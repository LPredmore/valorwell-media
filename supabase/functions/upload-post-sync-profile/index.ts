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

  const apiKey = Deno.env.get("UPLOAD_POST_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "UPLOAD_POST_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: profileRow } = await admin
      .from("upload_post_profiles")
      .select("username, provisioning_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profileRow) {
      return new Response(JSON.stringify({ error: "No profile found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profileRow.provisioning_status !== "ready") {
      return new Response(
        JSON.stringify({ status: profileRow.provisioning_status, connected_platforms: {} }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resp = await fetch(
      `${UPLOAD_POST_BASE}/api/uploadposts/users/${encodeURIComponent(profileRow.username)}`,
      {
        method: "GET",
        headers: { "Authorization": `Apikey ${apiKey}` },
      },
    );

    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: data?.message ?? text, status: resp.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const social = data?.profile?.social_accounts ?? {};

    await admin
      .from("upload_post_profiles")
      .update({
        connected_platforms: social,
        last_synced_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ status: "ready", connected_platforms: social }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("upload-post-sync-profile error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
