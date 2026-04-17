import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function isUuid(s: unknown): s is string {
  return typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // 1. Validate service role key
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!presented || !timingSafeEqual(presented, serviceKey)) {
      return json(403, { error: "unauthorized" });
    }

    // 2. Validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_request", detail: "invalid JSON" });
    }
    const contentId = (body as { contentId?: unknown })?.contentId;
    if (!isUuid(contentId)) {
      return json(400, { error: "invalid_request", detail: "contentId must be UUID" });
    }

    // 3. Service-role client
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Look up content owner
    const { data: content, error: contentErr } = await admin
      .from("social_content")
      .select("user_id")
      .eq("id", contentId)
      .single();

    if (contentErr || !content) {
      return json(404, { error: "content_not_found" });
    }
    const userId = content.user_id as string;

    // 4. Look up YouTube connection
    const { data: conn, error: connErr } = await admin
      .from("youtube_connections")
      .select("refresh_token, channel_id, channel_title")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn || !conn.refresh_token) {
      return json(404, { error: "no_connection", userId });
    }

    // 5. Exchange refresh token for access token
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? Deno.env.get("YOUTUBE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? Deno.env.get("YOUTUBE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json(500, { error: "server_misconfigured", detail: "OAuth client credentials missing" });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: conn.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      // Google returns 400 with invalid_grant when refresh token revoked/expired
      const isInvalidGrant = detail.includes("invalid_grant");
      return json(401, {
        error: isInvalidGrant ? "invalid_grant" : "refresh_failed",
        detail,
      });
    }

    const tokenData = await tokenRes.json();
    return json(200, {
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      channelId: conn.channel_id,
      channelTitle: conn.channel_title,
      userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: "internal_error", detail: message });
  }
});
