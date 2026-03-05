import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    try {
      const body = await req.json();
      contentId = body?.contentId ?? null;
    } catch {
      // No body or invalid JSON — fall through to cron behavior
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
      const { id: _id, upload_at: _ua, youtube_status: _ys, youtube_video_id: _yv,
              youtube_error_detail: _ye, youtube_uploaded_at: _yu, video_size_bytes: _vs,
              script: _sc,
              ...rest } = row;
      const { error: insertError } = await supabase
        .from("posted_content")
        .insert({
          ...rest,
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
