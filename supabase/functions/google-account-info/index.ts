import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "unauthorized" });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json(401, { error: "unauthorized" });
    }
    const userId = claimsData.claims.sub;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: conn, error: connErr } = await admin
      .from("youtube_connections")
      .select("google_email, channel_title, channel_id, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr) {
      return json(500, { error: "db_error", detail: connErr.message });
    }

    if (!conn) {
      return json(200, { connected: false });
    }

    return json(200, {
      connected: true,
      email: conn.google_email,
      channelTitle: conn.channel_title,
      channelId: conn.channel_id,
      connectedAt: conn.created_at,
      updatedAt: conn.updated_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: "internal_error", detail: message });
  }
});
