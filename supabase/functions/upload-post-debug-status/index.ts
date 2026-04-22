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
    return new Response(
      JSON.stringify({ error: "UPLOAD_POST_API_KEY missing" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: profileRow, error: profileErr } = await admin
    .from("upload_post_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileErr || !profileRow) {
    return new Response(
      JSON.stringify({ error: "No upload_post_profiles row" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Fetch the full users list from Upload-Post and find ours.
  const debugLog: Array<Record<string, unknown>> = [];
  let providerUser: unknown = null;
  let providerRaw: unknown = null;
  let providerStatus = 0;

  try {
    const resp = await fetch(`${UPLOAD_POST_BASE}/api/uploadposts/users`, {
      method: "GET",
      headers: {
        Authorization: `Apikey ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    providerStatus = resp.status;
    const text = await resp.text();
    try {
      providerRaw = JSON.parse(text);
    } catch {
      providerRaw = text;
    }
    debugLog.push({
      step: "list_users",
      status: resp.status,
      ok: resp.ok,
    });

    if (resp.ok && providerRaw && typeof providerRaw === "object") {
      const obj = providerRaw as Record<string, unknown>;
      const list =
        (obj.profiles as unknown[]) ??
        (obj.users as unknown[]) ??
        (Array.isArray(providerRaw) ? (providerRaw as unknown[]) : []);
      if (Array.isArray(list)) {
        providerUser =
          list.find((u) => {
            if (!u || typeof u !== "object") return false;
            const r = u as Record<string, unknown>;
            return r.username === profileRow.username;
          }) ?? null;
      }
    }
  } catch (err: unknown) {
    debugLog.push({
      step: "list_users_error",
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  return new Response(
    JSON.stringify({
      our_profile: profileRow,
      provider_status: providerStatus,
      provider_user: providerUser,
      provider_raw: providerRaw,
      debug_log: debugLog,
      checked_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
