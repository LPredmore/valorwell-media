// ONE-TIME USE: reveals secrets needed to configure the Fly.io YouTube worker.
// DELETE THIS FUNCTION IMMEDIATELY AFTER COPYING THE VALUES.
// Gated to admin users only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Verify admin via service-role client (bypasses RLS for the role check)
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdminData, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdminData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secrets = {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      GOOGLE_OAUTH_CLIENT_ID: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? null,
      GOOGLE_OAUTH_CLIENT_SECRET:
        Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? null,
      YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY:
        Deno.env.get("YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY") ?? null,
      FLY_WORKER_HMAC_SECRET:
        Deno.env.get("FLY_WORKER_HMAC_SECRET") ?? null,
    };

    // Render a fly secrets set command for convenience
    const flyCmd =
      "fly secrets set \\\n" +
      Object.entries(secrets)
        .map(([k, v]) => `  ${k}='${(v ?? "").replace(/'/g, "'\\''")}'`)
        .join(" \\\n") +
      " \\\n  -a youtube-uploader-service";

    return new Response(
      JSON.stringify(
        {
          warning:
            "DELETE THIS EDGE FUNCTION IMMEDIATELY AFTER COPYING THESE VALUES.",
          secrets,
          fly_command: flyCmd,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
