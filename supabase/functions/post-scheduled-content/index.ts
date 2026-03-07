import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PUBLER_BASE = "https://app.publer.com/api/v1";

async function generateSignedUrl(
  client: AwsClient,
  endpoint: string,
  bucket: string,
  storagePath: string,
): Promise<string> {
  const url = `${endpoint}/${bucket}/${storagePath}`;
  const expiresIn = 3600;
  const signed = await client.sign(
    new Request(`${url}?X-Amz-Expires=${expiresIn}`, { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return signed.url.toString();
}

async function uploadMediaFromUrl(
  videoUrl: string,
  apiKey: string,
  workspaceId: string,
): Promise<{ success: boolean; mediaId?: string; mediaPath?: string; error?: string }> {
  const headers = {
    "Authorization": `Bearer-API ${apiKey}`,
    "Publer-Workspace-Id": workspaceId,
    "Content-Type": "application/json",
  };

  console.log(`[Publer Media] Uploading media from URL: ${videoUrl.substring(0, 80)}...`);

  const uploadResp = await fetch(`${PUBLER_BASE}/media/from-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      media: [{ url: videoUrl, name: "video.mp4" }],
      type: "video",
    }),
  });

  if (!uploadResp.ok) {
    const err = await uploadResp.text();
    return { success: false, error: `Media upload request failed [${uploadResp.status}]: ${err}` };
  }

  const uploadData = await uploadResp.json();
  console.log(`[Publer Media] Upload response:`, JSON.stringify(uploadData));

  const jobId = uploadData?.job_id;
  if (!jobId) {
    // Some responses return the media directly without a job
    if (uploadData?.id) {
      return { success: true, mediaId: uploadData.id, mediaPath: uploadData.path ?? uploadData.url };
    }
    return { success: false, error: `Media upload returned no job_id: ${JSON.stringify(uploadData)}` };
  }

  // Poll for media upload completion
  const MAX_POLLS = 40;
  const POLL_INTERVAL_MS = 3000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const statusResp = await fetch(`${PUBLER_BASE}/job_status/${jobId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer-API ${apiKey}`,
          "Publer-Workspace-Id": workspaceId,
        },
      });

      if (!statusResp.ok) {
        console.warn(`[Publer Media] Job poll ${i + 1} failed [${statusResp.status}]`);
        continue;
      }

      const statusData = await statusResp.json();
      const jobStatus = statusData?.status;
      console.log(`[Publer Media] Job ${jobId} poll ${i + 1}: ${jobStatus}`, JSON.stringify(statusData));

      if (jobStatus === "completed" || jobStatus === "done" || jobStatus === "complete") {
        const payload = statusData?.payload;
        // Extract media ID from payload
        const mediaId = payload?.id ?? payload?.media_id;
        const mediaPath = payload?.path ?? payload?.url;
        if (mediaId) {
          return { success: true, mediaId, mediaPath };
        }
        // If payload is the media object itself
        if (typeof payload === "object" && payload) {
          return { success: true, mediaId: payload.id, mediaPath: payload.path ?? payload.url };
        }
        // Fallback: return success but log concern
        console.warn(`[Publer Media] Job complete but no media ID found in payload:`, JSON.stringify(statusData));
        return { success: true, mediaPath: mediaPath ?? undefined };
      }

      if (jobStatus === "failed" || jobStatus === "error") {
        return { success: false, error: `Media upload job failed: ${JSON.stringify(statusData?.payload ?? statusData)}` };
      }
    } catch (pollErr) {
      console.warn(`[Publer Media] Job poll ${i + 1} error:`, pollErr);
    }
  }

  return { success: false, error: `Media upload job ${jobId} timed out after ${MAX_POLLS * POLL_INTERVAL_MS / 1000}s` };
}

async function publishToPubler(
  videoUrl: string,
  caption: string,
  apiKey: string,
  workspaceId: string,
  tiktokAccountId: string,
): Promise<{ success: boolean; error?: string; jobId?: string; pending?: boolean }> {
  const headers = {
    "Authorization": `Bearer-API ${apiKey}`,
    "Publer-Workspace-Id": workspaceId,
    "Content-Type": "application/json",
  };

  // Step 1: Pre-upload media to Publer
  const mediaResult = await uploadMediaFromUrl(videoUrl, apiKey, workspaceId);
  if (!mediaResult.success) {
    return { success: false, error: `Media pre-upload failed: ${mediaResult.error}` };
  }

  console.log(`[Publer Post] Media ready — id: ${mediaResult.mediaId}, path: ${mediaResult.mediaPath}`);

  // Build media object with ID if available
  const mediaObj: Record<string, string> = {};
  if (mediaResult.mediaId) mediaObj.id = mediaResult.mediaId;
  if (mediaResult.mediaPath) mediaObj.path = mediaResult.mediaPath;
  // Fallback: if neither worked, use original URL
  if (!mediaObj.id && !mediaObj.path) mediaObj.path = videoUrl;

  // Step 2: Create post with correct payload including details
  const postPayload = {
    bulk: {
      state: "scheduled",
      posts: [
        {
          accounts: [{ id: tiktokAccountId }],
          networks: {
            tiktok: {
              type: "video",
              text: caption,
              media: [mediaObj],
              details: {
                privacy: "PUBLIC_TO_EVERYONE",
                comment: true,
                duet: true,
                stitch: true,
                promotional: false,
                paid: false,
              },
            },
          },
        },
      ],
    },
  };

  console.log(`[Publer Post] Submitting TikTok post:`, JSON.stringify(postPayload));

  const postResp = await fetch(`${PUBLER_BASE}/posts/schedule/publish`, {
    method: "POST",
    headers,
    body: JSON.stringify(postPayload),
  });

  if (!postResp.ok) {
    const err = await postResp.text();
    return { success: false, error: `Publer post publish failed [${postResp.status}]: ${err}` };
  }

  const postData = await postResp.json();
  console.log(`[Publer Post] Response:`, JSON.stringify(postData));

  const jobId = postData?.job_id;
  if (!jobId) {
    console.warn("[Publer Post] No job_id returned — cannot verify delivery");
    return { success: false, error: "Publer returned no job_id to track" };
  }

  // Step 3: Poll job status with payload.failures inspection
  const MAX_POLLS = 30;
  const POLL_INTERVAL_MS = 3000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const statusResp = await fetch(`${PUBLER_BASE}/job_status/${jobId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer-API ${apiKey}`,
          "Publer-Workspace-Id": workspaceId,
        },
      });

      if (!statusResp.ok) {
        console.warn(`[Publer Post] Job poll ${i + 1} failed [${statusResp.status}]`);
        continue;
      }

      const statusData = await statusResp.json();
      const jobStatus = statusData?.status;
      console.log(`[Publer Post] Job ${jobId} poll ${i + 1}: ${jobStatus}`, JSON.stringify(statusData));

      if (jobStatus === "completed" || jobStatus === "done" || jobStatus === "complete") {
        // CRITICAL: Check payload.failures for per-account errors
        const failures = statusData?.payload?.failures;
        if (failures && typeof failures === "object" && Object.keys(failures).length > 0) {
          const failureDetail = JSON.stringify(failures);
          console.error(`[Publer Post] Job complete BUT has failures:`, failureDetail);
          return { success: false, error: `TikTok delivery failed: ${failureDetail}`, jobId };
        }
        return { success: true, jobId };
      }

      if (jobStatus === "failed" || jobStatus === "error") {
        const errorDetail = JSON.stringify(statusData?.payload ?? statusData);
        return { success: false, error: `Publer job failed: ${errorDetail}`, jobId };
      }
    } catch (pollErr) {
      console.warn(`[Publer Post] Job poll ${i + 1} error:`, pollErr);
    }
  }

  console.warn(`[Publer Post] Job ${jobId} still working after ${MAX_POLLS} polls — marking as pending`);
  return { success: false, pending: true, jobId, error: `Job ${jobId} still processing after ${MAX_POLLS * POLL_INTERVAL_MS / 1000}s` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // R2 credentials for signed URL generation
  const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");

  let r2Client: AwsClient | null = null;
  if (R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
    r2Client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });
  }

  try {
    let contentId: string | null = null;
    let retryTiktok = false;
    let retrySourceContentId: string | null = null;
    try {
      const body = await req.json();
      contentId = body?.contentId ?? null;
      retryTiktok = body?.retryTiktok === true;
      retrySourceContentId = body?.sourceContentId ?? null;
    } catch {
      // No body or invalid JSON — fall through to cron behavior
    }

    // --- TikTok retry path: re-run Publer for already-posted content ---
    if (retryTiktok && retrySourceContentId) {
      const publerApiKey = Deno.env.get("PUBLER_API_KEY");
      const publerWorkspaceId = Deno.env.get("PUBLER_WORKSPACE_ID");
      const publerTiktokAccountId = Deno.env.get("PUBLER_TIKTOK_ACCOUNT_ID");

      if (!publerApiKey || !publerWorkspaceId || !publerTiktokAccountId) {
        return new Response(JSON.stringify({ error: "Publer credentials not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: postedRows, error: fetchErr } = await supabase
        .from("posted_content")
        .select("*")
        .eq("source_content_id", retrySourceContentId)
        .order("posted_at", { ascending: false })
        .limit(1);

      const posted = postedRows?.[0] ?? null;

      if (fetchErr || !posted) {
        return new Response(JSON.stringify({ error: fetchErr?.message ?? "Posted content not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate fresh signed video URL
      let videoUrl: string | null = posted.video_url;
      if (r2Client && R2_ENDPOINT && R2_BUCKET_NAME && posted.video_storage_path) {
        try {
          videoUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, posted.video_storage_path);
        } catch (e) {
          console.error("Failed to generate signed URL for retry:", e);
        }
      }

      if (!videoUrl) {
        return new Response(JSON.stringify({ error: "No video URL available for retry" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const caption = posted.ig_tiktok_desc || posted.post_title || posted.topic || "";
      let tiktokStatus = "failed";
      let tiktokError: string | null = null;

      try {
        const result = await publishToPubler(videoUrl, caption, publerApiKey, publerWorkspaceId, publerTiktokAccountId);
        if (result.success) {
          tiktokStatus = "posted";
          console.log(`TikTok retry succeeded for ${retrySourceContentId}`);
        } else {
          tiktokError = result.error ?? "Unknown Publer error";
          console.error(`TikTok retry failed for ${retrySourceContentId}:`, tiktokError);
        }
      } catch (err) {
        tiktokError = err instanceof Error ? err.message : String(err);
        console.error(`TikTok retry error for ${retrySourceContentId}:`, tiktokError);
      }

      await supabase
        .from("posted_content")
        .update({ tiktok_status: tiktokStatus, tiktok_error: tiktokError })
        .eq("source_content_id", retrySourceContentId);

      return new Response(JSON.stringify({ retried: retrySourceContentId, tiktok_status: tiktokStatus, tiktok_error: tiktokError }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rows: any[] = [];

    if (contentId) {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("id", contentId)
        .single();

      if (error) {
        console.error("Fetch error for contentId:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows = [data];
    } else {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString());

      if (error) {
        console.error("Fetch error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows = data ?? [];
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ posted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let posted = 0;

    for (const row of rows) {
      const now = new Date().toISOString();

      // Generate signed R2 URLs for video and image
      let videoUrl: string | null = null;
      let imageUrl: string | null = null;

      if (r2Client && R2_ENDPOINT && R2_BUCKET_NAME) {
        try {
          if (row.video_storage_path) {
            videoUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.video_storage_path);
          }
          if (row.image) {
            imageUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.image);
          }
        } catch (signErr) {
          console.error(`Signed URL generation failed for ${row.id}:`, signErr);
          // Continue with null URLs rather than failing the entire post
        }
      } else {
        console.warn("R2 credentials not configured — video_url and image_url will be null");
      }

      // Copy to posted_content — strip social_content-only fields
      const { id: _id, upload_at: _ua, youtube_status: _ys,
              youtube_error_detail: _ye, youtube_uploaded_at: _yu, video_size_bytes: _vs,
              script: _sc,
              ...rest } = row;
      const { error: insertError } = await supabase
        .from("posted_content")
        .insert({
          ...rest,
          source_content_id: row.id,
          status: "posted",
          posted_at: now,
          video_url: videoUrl,
          image_url: imageUrl,
          youtube_title: rest.post_title ?? null,
        });

      if (insertError) {
        console.error(`Insert error for ${row.id}:`, insertError);
        continue;
      }

      // Notify Make.com webhook with posted content data
      const makeWebhookUrl = Deno.env.get("MAKE_WEBHOOK_URL");
      if (makeWebhookUrl) {
        try {
          const webhookPayload = {
            source_content_id: row.id,
            topic: row.topic,
            post_title: row.post_title,
            post_length: row.post_length,
            video_url: videoUrl,
            image_url: imageUrl,
            ig_tiktok_desc: row.ig_tiktok_desc,
            facebook_desc: row.facebook_desc,
            linkedin_desc: row.linkedin_desc,
            youtube_desc: row.youtube_desc,
            youtube_video_id: row.youtube_video_id,
            scheduled_platforms: row.scheduled_platforms,
            posted_at: now,
          };

          const makeResp = await fetch(makeWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });

          if (!makeResp.ok) {
            console.error(`Make.com webhook failed for ${row.id}: ${makeResp.status}`);
          }
        } catch (makeErr) {
          console.error(`Make.com webhook error for ${row.id}:`, makeErr);
        }
      }

      // Publish Shorts to TikTok via Publer
      const publerApiKey = Deno.env.get("PUBLER_API_KEY");
      const publerWorkspaceId = Deno.env.get("PUBLER_WORKSPACE_ID");
      const publerTiktokAccountId = Deno.env.get("PUBLER_TIKTOK_ACCOUNT_ID");

      if (
        publerApiKey && publerWorkspaceId && publerTiktokAccountId &&
        row.post_length === "Short" && videoUrl
      ) {
        let tiktokStatus: string | null = null;
        let tiktokError: string | null = null;
        let tiktokJobId: string | null = null;

        try {
          const caption = row.ig_tiktok_desc || row.post_title || row.topic || "";
          const publerResult = await publishToPubler(
            videoUrl,
            caption,
            publerApiKey,
            publerWorkspaceId,
            publerTiktokAccountId,
          );

          tiktokJobId = publerResult.jobId ?? null;

          if (publerResult.pending) {
            console.warn(`Publer TikTok job pending for ${row.id}: ${publerResult.jobId}`);
            tiktokStatus = "pending";
            tiktokError = publerResult.error ?? null;
          } else if (!publerResult.success) {
            console.error(`Publer TikTok publish failed for ${row.id}:`, publerResult.error);
            tiktokStatus = "failed";
            tiktokError = publerResult.error ?? "Unknown Publer error";
          } else {
            console.log(`Publer TikTok publish succeeded for ${row.id}`);
            tiktokStatus = "posted";
          }
        } catch (publerErr) {
          console.error(`Publer TikTok error for ${row.id}:`, publerErr);
          tiktokStatus = "failed";
          tiktokError = publerErr instanceof Error ? publerErr.message : String(publerErr);
        }

        // Persist TikTok result to posted_content
        if (tiktokStatus) {
          const { error: ttUpdateErr } = await supabase
            .from("posted_content")
            .update({ tiktok_status: tiktokStatus, tiktok_error: tiktokError, tiktok_job_id: tiktokJobId } as any)
            .eq("source_content_id", row.id);

          if (ttUpdateErr) {
            console.error(`Failed to update tiktok_status for ${row.id}:`, ttUpdateErr);
          }
        }
      }

      const { error: updateError } = await supabase
        .from("social_content")
        .update({ status: "posted", posted_at: now })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Update error for ${row.id}:`, updateError);
        continue;
      }

      posted++;
    }

    return new Response(JSON.stringify({ posted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("post-scheduled-content error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
