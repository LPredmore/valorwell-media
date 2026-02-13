import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");

    if (!R2_ENDPOINT) throw new Error("R2_ENDPOINT is not configured");
    if (!R2_ACCESS_KEY_ID) throw new Error("R2_ACCESS_KEY_ID is not configured");
    if (!R2_SECRET_ACCESS_KEY) throw new Error("R2_SECRET_ACCESS_KEY is not configured");
    if (!R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME is not configured");

    const { storagePath, contentType } = await req.json();
    if (!storagePath || !contentType) {
      return new Response(JSON.stringify({ error: "storagePath and contentType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      new Request(`${url}?X-Amz-Expires=${expiresIn}`, {
        method: "PUT",
        headers: { "Content-Type": contentType },
      }),
      { aws: { signQuery: true } },
    );

    return new Response(
      JSON.stringify({ uploadUrl: signed.url.toString() }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    console.error("Error generating presigned URL:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
