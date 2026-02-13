import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
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

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader || "" } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Use adminClient for fetch when no auth header (admin invocation)
  const fetchClient = authHeader ? userClient : adminClient;

  try {
    const { contentId } = await req.json();
    if (!contentId) {
      return new Response(JSON.stringify({ error: "contentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the content row
    const { data: content, error: fetchError } = await fetchClient
      .from("social_content")
      .select("youtube_title, youtube_desc")
      .eq("id", contentId)
      .single();

    if (fetchError || !content) {
      return new Response(JSON.stringify({ error: "Content not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!content.youtube_title || !content.youtube_desc) {
      return new Response(JSON.stringify({ error: "Content has no generated title/description yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch image instructions
    const { data: imageInstructions } = await adminClient
      .from("image_instructions")
      .select("instruction, aspect_ratio")
      .eq("is_active", true);

    const imageRules = (imageInstructions || [])
      .map((r) => `Aspect ratio: ${r.aspect_ratio}\n${r.instruction}`)
      .join("\n\n");

    // Step 1: Craft image prompt with GPT-4.1 Mini
    const promptCraftResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You craft optimized image generation prompts for gpt-5-image-mini. Given content context and rules, produce a single detailed image prompt that will generate a compelling cover image.",
          },
          {
            role: "user",
            content: `Title: ${content.youtube_title}\n\nDescription: ${content.youtube_desc}\n\n${imageRules ? `Image rules:\n${imageRules}` : ""}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_prompt",
              description: "Save the crafted image generation prompt.",
              parameters: {
                type: "object",
                properties: {
                  image_prompt: {
                    type: "string",
                    description: "A detailed prompt optimized for gpt-5-image-mini image generation",
                  },
                },
                required: ["image_prompt"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_prompt" } },
      }),
    });

    if (!promptCraftResponse.ok) {
      const errText = await promptCraftResponse.text();
      throw new Error(`Prompt craft failed (${promptCraftResponse.status}): ${errText}`);
    }

    const promptResult = await promptCraftResponse.json();
    const promptToolCall = promptResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!promptToolCall) throw new Error("GPT-4.1 Mini did not return a tool call");

    const { image_prompt } = JSON.parse(promptToolCall.function.arguments);
    console.log("Crafted image prompt:", image_prompt);

    // Step 2: Generate image with gpt-5-image-mini
    const imageResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-image-mini",
        messages: [{ role: "user", content: image_prompt }],
        modalities: ["image"],
      }),
    });

    if (!imageResponse.ok) {
      const errText = await imageResponse.text();
      throw new Error(`Image generation failed (${imageResponse.status}): ${errText}`);
    }

    const imageResult = await imageResponse.json();
    const base64Url = imageResult.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!base64Url) throw new Error("No image returned from gpt-5-image-mini");

    // Step 3: Upload to R2
    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME")!;

    const r2Client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });

    const storagePath = `content/${contentId}/cover.png`;
    const r2Url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${storagePath}`;

    const uploadResp = await r2Client.fetch(r2Url, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: imageBytes,
    });

    if (!uploadResp.ok) {
      throw new Error(`R2 upload failed: ${uploadResp.status}`);
    }

    // Step 4: Save image path
    await adminClient
      .from("social_content")
      .update({ image: storagePath })
      .eq("id", contentId);

    console.log("Image regenerated and uploaded:", storagePath);

    return new Response(JSON.stringify({ success: true, storagePath }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("regenerate-image error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
