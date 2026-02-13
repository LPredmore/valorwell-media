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
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN")!;

    // Exchange refresh token for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return new Response(JSON.stringify({ error: `Token exchange failed: ${text}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { access_token } = await tokenRes.json();

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userRes.json();

    // Get YouTube channel info
    const ytRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    const ytData = await ytRes.json();

    const channel = ytData.items?.[0]?.snippet;

    return new Response(
      JSON.stringify({
        email: userInfo.email || null,
        name: userInfo.name || null,
        channelTitle: channel?.title || "No channel found",
        channelId: ytData.items?.[0]?.id || null,
        _debug: { userInfo, ytData },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
