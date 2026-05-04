import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UPLOAD_POST_BASE = "https://api.upload-post.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("UPLOAD_POST_API_KEY");

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "UPLOAD_POST_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.user_id;
    let username: string | undefined = body?.username;

    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!username) {
      username = "flurra" + userId.replace(/-/g, "");
    }

    // Make sure profile row exists
    await admin
      .from("upload_post_profiles")
      .upsert({ user_id: userId, username, provisioning_status: "pending" }, { onConflict: "user_id" });

    const resp = await fetch(`${UPLOAD_POST_BASE}/api/uploadposts/users`, {
      method: "POST",
      headers: {
        "Authorization": `Apikey ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });

    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    // 201 = created, 409 = already exists (treat as success)
    if (resp.ok || resp.status === 409) {
      await admin
        .from("upload_post_profiles")
        .update({
          provisioning_status: "ready",
          provisioning_error: null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      return new Response(
        JSON.stringify({ success: true, username, already_existed: resp.status === 409 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const errorCode: string | null = data?.error_code ?? null;
    const errorMessage = data?.message ?? data?.error ?? text ?? `HTTP ${resp.status}`;

    // Detect plan-limit hits explicitly so the UI/caller can react.
    const isLimitReached =
      resp.status === 403 ||
      errorCode === "PROFILE_LIMIT_REACHED" ||
      /limit/i.test(String(errorMessage));

    const newStatus = isLimitReached ? "limit_reached" : "error";

    console.error(
      `[upload-post-create-profile] provisioning failed for ${userId}: status=${resp.status} code=${errorCode} msg=${errorMessage}`,
    );

    await admin
      .from("upload_post_profiles")
      .update({
        provisioning_status: newStatus,
        provisioning_error: `[${resp.status}${errorCode ? "/" + errorCode : ""}] ${errorMessage}`,
      })
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        error_code: errorCode,
        status: resp.status,
        limit_reached: isLimitReached,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("upload-post-create-profile error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
