// Admin-only: returns Upload-Post slot usage and orphaned upstream profiles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UPLOAD_POST_BASE = "https://api.upload-post.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Admin gate
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const resp = await fetch(`${UPLOAD_POST_BASE}/api/uploadposts/users`, {
      headers: { "Authorization": `Apikey ${apiKey}` },
    });
    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: data?.message ?? text, status: resp.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upload-Post returns either a list or {profiles:[...]}; normalize.
    const upstreamRaw: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.profiles) ? data.profiles
      : Array.isArray(data?.users) ? data.users
      : [];

    const upstreamUsernames: string[] = upstreamRaw
      .map((p: any) => (typeof p === "string" ? p : p?.username))
      .filter(Boolean);

    const { data: ourRows } = await admin
      .from("upload_post_profiles")
      .select("user_id, username, provisioning_status, provisioning_error, updated_at");

    const ourMap = new Map((ourRows ?? []).map((r: any) => [r.username, r]));

    const orphans = upstreamUsernames.filter((u) => !ourMap.has(u));
    const missingUpstream = (ourRows ?? [])
      .filter((r: any) => r.provisioning_status === "ready" && !upstreamUsernames.includes(r.username))
      .map((r: any) => r.username);

    return new Response(
      JSON.stringify({
        used: upstreamUsernames.length,
        upstream_profiles: upstreamRaw,
        upstream_usernames: upstreamUsernames,
        our_rows_count: ourRows?.length ?? 0,
        orphans,
        missing_upstream: missingUpstream,
        checked_at: new Date().toISOString(),
        raw: data,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
