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

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // TEMP: gated to specific user_id; function will be deleted after one run.
    const ALLOWED_USER_ID = "e79ad5f3-1202-4381-8f59-1712482c3aa9";
    if (userId !== ALLOWED_USER_ID) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
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
