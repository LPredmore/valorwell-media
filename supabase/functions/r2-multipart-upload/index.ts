import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getR2Config() {
  const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");

  if (!R2_ENDPOINT) throw new Error("R2_ENDPOINT is not configured");
  if (!R2_ACCESS_KEY_ID) throw new Error("R2_ACCESS_KEY_ID is not configured");
  if (!R2_SECRET_ACCESS_KEY) throw new Error("R2_SECRET_ACCESS_KEY is not configured");
  if (!R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME is not configured");

  return { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME };
}

function makeClient(accessKeyId: string, secretAccessKey: string) {
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const PRESIGN_EXPIRES = 7200; // 2 hours per part URL

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, storagePath, contentType, fileSize, uploadId, parts } = await req.json();

    if (!action || !storagePath) {
      return new Response(
        JSON.stringify({ error: "action and storagePath are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const config = getR2Config();
    const client = makeClient(config.R2_ACCESS_KEY_ID, config.R2_SECRET_ACCESS_KEY);
    const objectUrl = `${config.R2_ENDPOINT}/${config.R2_BUCKET_NAME}/${storagePath}`;

    // ── START ──────────────────────────────────────────────────────────
    if (action === "start") {
      if (!fileSize || !contentType) {
        return new Response(
          JSON.stringify({ error: "fileSize and contentType are required for start" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 1. Initiate multipart upload
      const initRes = await client.fetch(`${objectUrl}?uploads=`, {
        method: "POST",
        headers: { "Content-Type": contentType },
      });

      if (!initRes.ok) {
        const body = await initRes.text();
        console.error("CreateMultipartUpload failed", initRes.status, body);
        throw new Error(`CreateMultipartUpload failed: ${initRes.status}`);
      }

      const initXml = await initRes.text();
      const uploadIdMatch = initXml.match(/<UploadId>(.+?)<\/UploadId>/);
      if (!uploadIdMatch) throw new Error("Could not parse UploadId from response");
      const newUploadId = uploadIdMatch[1];

      // 2. Generate presigned PUT URLs for each part
      const partCount = Math.ceil(fileSize / CHUNK_SIZE);
      const partUrls: { partNumber: number; url: string }[] = [];

      for (let i = 1; i <= partCount; i++) {
        const partUrl = `${objectUrl}?partNumber=${i}&uploadId=${encodeURIComponent(newUploadId)}&X-Amz-Expires=${PRESIGN_EXPIRES}`;
        const signed = await client.sign(
          new Request(partUrl, { method: "PUT" }),
          { aws: { signQuery: true } },
        );
        partUrls.push({ partNumber: i, url: signed.url.toString() });
      }

      console.log(`[Multipart] Started upload ${newUploadId} for ${storagePath}, ${partCount} parts`);

      return new Response(
        JSON.stringify({ uploadId: newUploadId, partUrls }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── COMPLETE ───────────────────────────────────────────────────────
    if (action === "complete") {
      if (!uploadId || !parts || !Array.isArray(parts)) {
        return new Response(
          JSON.stringify({ error: "uploadId and parts[] are required for complete" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build XML body for CompleteMultipartUpload
      const partsXml = parts
        .sort((a: { partNumber: number }, b: { partNumber: number }) => a.partNumber - b.partNumber)
        .map(
          (p: { partNumber: number; etag: string }) =>
            `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`,
        )
        .join("");
      const completeXml = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;

      const completeRes = await client.fetch(
        `${objectUrl}?uploadId=${encodeURIComponent(uploadId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: completeXml,
        },
      );

      if (!completeRes.ok) {
        const body = await completeRes.text();
        console.error("CompleteMultipartUpload failed", completeRes.status, body);
        throw new Error(`CompleteMultipartUpload failed: ${completeRes.status} - ${body}`);
      }

      console.log(`[Multipart] Completed upload ${uploadId} for ${storagePath}`);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── ABORT ──────────────────────────────────────────────────────────
    if (action === "abort") {
      if (!uploadId) {
        return new Response(
          JSON.stringify({ error: "uploadId is required for abort" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const abortRes = await client.fetch(
        `${objectUrl}?uploadId=${encodeURIComponent(uploadId)}`,
        { method: "DELETE" },
      );

      if (!abortRes.ok) {
        const body = await abortRes.text();
        console.error("AbortMultipartUpload failed", abortRes.status, body);
        // Don't throw — abort is best-effort cleanup
      }

      console.log(`[Multipart] Aborted upload ${uploadId} for ${storagePath}`);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("r2-multipart-upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
