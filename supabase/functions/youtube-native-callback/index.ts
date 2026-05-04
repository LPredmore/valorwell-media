import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-flurra-signature",
};

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const flyHmac = Deno.env.get("FLY_WORKER_HMAC_SECRET");

  if (!flyHmac) {
    return new Response(JSON.stringify({ error: "HMAC secret not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get("x-flurra-signature") ?? "";
    const expected = await hmacSign(flyHmac, rawBody);
    if (!timingSafeEqual(sigHeader, expected)) {
      console.warn("Invalid HMAC signature on callback");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const contentId: string | undefined = payload?.content_id;
    const status: string | undefined = payload?.status; // 'success' | 'failed'
    const videoId: string | undefined = payload?.video_id;
    const errorDetail: string | undefined = payload?.error_detail;

    if (!contentId || !status) {
      return new Response(JSON.stringify({ error: "Missing content_id or status" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Detect non-retryable Google OAuth errors so we don't loop forever.
    const raw = (errorDetail ?? "").toLowerCase();
    const authBroken =
      raw.includes("invalid_grant") ||
      raw.includes("invalid_client") ||
      raw.includes("unauthorized_client") ||
      raw.includes("invalid_token");

    const friendlyError = authBroken
      ? "YouTube authorization expired or was revoked. Please reconnect YouTube in Settings → Connections, then retry this post."
      : (errorDetail ?? "Unknown error");

    const update: Record<string, unknown> = {
      youtube_native_status: status === "success" ? "success" : "failed",
      youtube_native_error_detail: status === "success" ? null : friendlyError,
    };
    if (status === "success") {
      update.youtube_native_video_id = videoId ?? null;
      update.youtube_native_uploaded_at = new Date().toISOString();
    }

    const { error: updErr } = await admin
      .from("social_content")
      .update(update)
      .eq("id", contentId);

    if (updErr) {
      console.error("Update failed:", updErr);
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("youtube-native-callback error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
