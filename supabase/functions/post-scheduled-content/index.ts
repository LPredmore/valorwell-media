import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function generateSignedUrl(storagePath: string): Promise<string | null> {
  const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");

  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error("R2 credentials not configured, skipping URL signing");
    return null;
  }

  const client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${storagePath}`;
  const expiresIn = 3600; // 1 hour

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

  try {
    // Check for optional contentId in request body (immediate posting)
    let contentId: string | null = null;
    try {
      const body = await req.json();
      contentId = body?.contentId ?? null;
    } catch {
      // No body or invalid JSON — fall through to cron behavior
    }

    let rows: any[] = [];

    if (contentId) {
      // Immediate posting: fetch a single specific row
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
      // Cron behavior: find all scheduled content whose scheduled_at has passed
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

      // Generate signed R2 download URLs for Make.com
      let signedVideoUrl: string | null = null;
      let signedImageUrl: string | null = null;

      if (row.video_storage_path) {
        try {
          signedVideoUrl = await generateSignedUrl(row.video_storage_path);
          console.log(`Generated signed video URL for ${row.id}`);
        } catch (e) {
          console.error(`Failed to sign video URL for ${row.id}:`, e);
        }
      }

      if (row.image) {
        try {
          signedImageUrl = await generateSignedUrl(row.image);
          console.log(`Generated signed image URL for ${row.id}`);
        } catch (e) {
          console.error(`Failed to sign image URL for ${row.id}:`, e);
        }
      }

      // Copy to posted_content (strip id so a new one is generated)
      const { id: _id, ...rest } = row;
      const { error: insertError } = await supabase
        .from("posted_content")
        .insert({
          ...rest,
          status: "posted",
          posted_at: now,
          video_url: signedVideoUrl,
          image_url: signedImageUrl,
        });

      if (insertError) {
        console.error(`Insert error for ${row.id}:`, insertError);
        continue;
      }

      // Update social_content status
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
