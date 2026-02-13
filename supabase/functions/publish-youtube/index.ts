import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchVideoFromR2(storagePath: string): Promise<{ blob: Blob; contentType: string }> {
  const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME")!;

  const client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${storagePath}`;
  const signed = await client.sign(
    new Request(`${url}?X-Amz-Expires=3600`, { method: "GET" }),
    { aws: { signQuery: true } },
  );

  const res = await fetch(signed.url.toString());
  if (!res.ok) {
    throw new Error(`R2 fetch failed (${res.status}): ${await res.text()}`);
  }

  const blob = await res.blob();
  const contentType = res.headers.get("content-type") || "video/mp4";
  return { blob, contentType };
}

async function uploadToYouTube(
  accessToken: string,
  videoBlob: Blob,
  contentType: string,
  title: string,
  description: string,
): Promise<string> {
  // Step 1: Initiate resumable upload
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(videoBlob.size),
        "X-Upload-Content-Type": contentType,
      },
      body: JSON.stringify({
        snippet: {
          title: title.slice(0, 100),
          description,
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: "public",
        },
      }),
    },
  );

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`YouTube init failed (${initRes.status}): ${text}`);
  }

  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("YouTube did not return an upload Location header");
  }

  // Step 2: Upload the video bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(videoBlob.size),
    },
    body: videoBlob,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`YouTube upload failed (${uploadRes.status}): ${text}`);
  }

  const result = await uploadRes.json();
  return result.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    const { contentId } = await req.json();
    if (!contentId) {
      return new Response(JSON.stringify({ error: "contentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch content (RLS enforces ownership)
    const { data: content, error: fetchError } = await supabase
      .from("social_content")
      .select("*")
      .eq("id", contentId)
      .single();

    if (fetchError || !content) {
      return new Response(JSON.stringify({ error: "Content not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!content.video_storage_path) {
      return new Response(JSON.stringify({ error: "No video attached to this content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!content.youtube_title) {
      return new Response(JSON.stringify({ error: "No YouTube title generated yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Publishing content ${contentId} to YouTube...`);

    // 1. Get Google access token
    const accessToken = await getAccessToken();
    console.log("Got Google access token");

    // 2. Fetch video from R2
    const { blob: videoBlob, contentType } = await fetchVideoFromR2(content.video_storage_path);
    console.log(`Fetched video from R2: ${videoBlob.size} bytes`);

    // 3. Upload to YouTube
    const videoId = await uploadToYouTube(
      accessToken,
      videoBlob,
      content.video_mime_type || contentType,
      content.youtube_title,
      content.youtube_desc || "",
    );
    console.log(`YouTube upload complete: ${videoId}`);

    // 4. Update content row
    const { error: updateError } = await supabase
      .from("social_content")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        video_url: `https://youtu.be/${videoId}`,
      })
      .eq("id", contentId);

    if (updateError) {
      console.error("Failed to update content row:", updateError);
    }

    return new Response(
      JSON.stringify({ success: true, videoId, url: `https://youtu.be/${videoId}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("publish-youtube error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Try to mark content as error
    try {
      const authHeader = req.headers.get("Authorization");
      const body = await req.clone().json().catch(() => ({}));
      if (body.contentId && authHeader) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        await supabase
          .from("social_content")
          .update({ status: "error", error: message })
          .eq("id", body.contentId);
      }
    } catch {
      // ignore cleanup errors
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
