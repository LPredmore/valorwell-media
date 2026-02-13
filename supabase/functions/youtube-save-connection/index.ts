import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { providerToken, providerRefreshToken } = await req.json();

    if (!providerToken || !providerRefreshToken) {
      return new Response(JSON.stringify({ error: "Missing provider tokens" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch Google user info
    let googleEmail: string | null = null;
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${providerToken}` },
      });
      if (userInfoRes.ok) {
        const info = await userInfoRes.json();
        googleEmail = info.email || null;
      }
    } catch {
      console.warn("Failed to fetch Google user info");
    }

    // Fetch YouTube channel info
    let channelId: string | null = null;
    let channelTitle: string | null = null;
    try {
      const ytRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${providerToken}` } },
      );
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        if (ytData.items?.length > 0) {
          channelId = ytData.items[0].id;
          channelTitle = ytData.items[0].snippet?.title || null;
        }
      }
    } catch {
      console.warn("Failed to fetch YouTube channel info");
    }

    // Use service role to upsert (since we need to store refresh_token which RLS user can do)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: upsertError } = await serviceClient
      .from("youtube_connections")
      .upsert(
        {
          user_id: userId,
          google_email: googleEmail,
          channel_id: channelId,
          channel_title: channelTitle,
          refresh_token: providerRefreshToken,
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response(JSON.stringify({ error: "Failed to save connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        googleEmail,
        channelId,
        channelTitle,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("youtube-save-connection error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
