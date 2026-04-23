import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}

async function verifyState(state: string, secret: string): Promise<{ user_id: string; exp: number } | null> {
  try {
    const [payloadB64, sigB64] = state.split(".");
    if (!payloadB64 || !sigB64) return null;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = Uint8Array.from(b64urlDecode(sigB64), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!ok) return null;

    const payload = JSON.parse(b64urlDecode(payloadB64));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.user_id !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptRefreshToken(plaintext: string, secret: string): Promise<string> {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  // Combine iv + ciphertext, base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

function htmlResponse(message: string, success: boolean): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${success ? "Connected" : "Connection failed"}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#101A2B;color:#e6edf7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center}
.box{max-width:400px}h1{font-size:20px;margin:0 0 8px}p{opacity:.8;font-size:14px;margin:0}
</style></head>
<body><div class="box"><h1>${success ? "✓ YouTube connected" : "Connection failed"}</h1>
<p>${message}</p><p style="margin-top:16px;opacity:.5">This window will close automatically.</p></div>
<script>
try {
  if (window.opener) {
    window.opener.postMessage({ type: ${success ? "'youtube_connected'" : "'youtube_connect_failed'"}, message: ${JSON.stringify(message)} }, "*");
  }
} catch(e) {}
setTimeout(function(){ try { window.close(); } catch(e){} }, 1500);
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
      console.warn("OAuth provider returned error:", oauthError);
      return htmlResponse(`Google returned: ${oauthError}`, false);
    }
    if (!code || !state) {
      return htmlResponse("Missing code or state parameter.", false);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const encKey = Deno.env.get("YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY");

    if (!clientId || !clientSecret || !encKey) {
      return htmlResponse("Server is not configured.", false);
    }

    const verified = await verifyState(state, encKey);
    if (!verified) {
      return htmlResponse("Invalid or expired authorization state.", false);
    }
    const userId = verified.user_id;

    const redirectUri = `${supabaseUrl}/functions/v1/youtube-native-oauth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Token exchange failed:", tokenRes.status, text);
      return htmlResponse("Failed to exchange authorization code.", false);
    }
    const tokens = await tokenRes.json();
    const accessToken: string = tokens.access_token;
    const refreshToken: string | undefined = tokens.refresh_token;
    const expiresIn: number = tokens.expires_in ?? 3600;
    const scopeStr: string = tokens.scope ?? "";

    if (!refreshToken) {
      return htmlResponse(
        "Google did not return a refresh token. Disconnect this app at myaccount.google.com and try again.",
        false,
      );
    }

    // Fetch userinfo (email)
    let email: string | null = null;
    try {
      const uRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (uRes.ok) {
        const u = await uRes.json();
        email = u.email ?? null;
      }
    } catch (e) {
      console.warn("userinfo fetch failed:", e);
    }

    // Fetch channel info
    let channelId: string | null = null;
    let channelTitle: string | null = null;
    let channelHandle: string | null = null;
    try {
      const cRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (cRes.ok) {
        const c = await cRes.json();
        const item = c.items?.[0];
        if (item) {
          channelId = item.id ?? null;
          channelTitle = item.snippet?.title ?? null;
          channelHandle = item.snippet?.customUrl ?? null;
        }
      } else {
        const errText = await cRes.text();
        console.warn("channels.list failed:", cRes.status, errText);
      }
    } catch (e) {
      console.warn("channels.list error:", e);
    }

    const refreshEncrypted = await encryptRefreshToken(refreshToken, encKey);
    const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error: upsertError } = await admin
      .from("youtube_connections")
      .upsert({
        user_id: userId,
        google_account_email: email,
        channel_id: channelId,
        channel_title: channelTitle,
        channel_handle: channelHandle,
        refresh_token_encrypted: refreshEncrypted,
        access_token: accessToken,
        access_token_expires_at: expiresAt,
        scopes: scopeStr ? scopeStr.split(" ") : [],
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Upsert failed:", upsertError);
      return htmlResponse(`Database error: ${upsertError.message}`, false);
    }

    return htmlResponse(
      channelTitle
        ? `Connected as ${channelTitle}${email ? ` (${email})` : ""}.`
        : "Your YouTube account is now connected.",
      true,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("youtube-native-oauth-callback error:", msg);
    return htmlResponse(msg, false);
  }
});
