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
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { contentId } = await req.json();
    if (!contentId) {
      return new Response(JSON.stringify({ error: "contentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the content row (RLS ensures ownership)
    const { data: content, error: fetchError } = await userClient
      .from("social_content")
      .select("*")
      .eq("id", contentId)
      .single();

    if (fetchError || !content) {
      return new Response(JSON.stringify({ error: "Content not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set status to generating
    await adminClient
      .from("social_content")
      .update({ status: "generating", error: null })
      .eq("id", contentId);

    // Fetch active content instructions
    const { data: instructions } = await adminClient
      .from("content_instructions")
      .select("scope, instruction")
      .eq("is_active", true);

    const instructionsByScope: Record<string, string> = {};
    for (const row of instructions || []) {
      instructionsByScope[row.scope] = row.instruction;
    }

    const systemPrompt = instructionsByScope["global"] || "You are a social media content generation assistant.";

    const fieldScopes = ["youtube_title", "youtube_desc", "facebook_desc", "linkedin_desc", "ig_tiktok_desc", "hashtags"];
    let fieldRules = "";
    for (const scope of fieldScopes) {
      if (instructionsByScope[scope]) {
        fieldRules += `\n\n## ${scope} rules:\n${instructionsByScope[scope]}`;
      }
    }

    const userPrompt = `Topic: ${content.topic}${fieldRules}`;

    // ── Step 1: Generate text (Claude Sonnet) ──
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_content",
              description: "Save the generated social media content for all platforms.",
              parameters: {
                type: "object",
                properties: {
                  youtube_title: { type: "string", description: "YouTube video title, 55-75 characters" },
                  youtube_desc: { type: "string", description: "YouTube description, 1800-2500 characters with hashtags" },
                  facebook_desc: { type: "string", description: "Facebook caption, 600-1200 characters with hashtags" },
                  linkedin_desc: { type: "string", description: "LinkedIn post, 900-1600 characters with hashtags" },
                  ig_tiktok_desc: { type: "string", description: "Instagram + TikTok caption, 200-300 characters plus hashtags" },
                },
                required: ["youtube_title", "youtube_desc", "facebook_desc", "linkedin_desc", "ig_tiktok_desc"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_content" } },
      }),
    });

    if (!openRouterResponse.ok) {
      const errText = await openRouterResponse.text();
      console.error("OpenRouter text error:", openRouterResponse.status, errText);
      await adminClient
        .from("social_content")
        .update({ status: "error", error: `OpenRouter API error: ${openRouterResponse.status}` })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await openRouterResponse.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "save_content") {
      console.error("Unexpected response structure:", JSON.stringify(result));
      await adminClient
        .from("social_content")
        .update({ status: "error", error: "AI did not return structured content" })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: "AI did not return expected format" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const generated = JSON.parse(toolCall.function.arguments);

    // Save text fields (status stays 'generating' while image is produced)
    const { error: updateError } = await adminClient
      .from("social_content")
      .update({
        youtube_title: generated.youtube_title,
        youtube_desc: generated.youtube_desc,
        facebook_desc: generated.facebook_desc,
        linkedin_desc: generated.linkedin_desc,
        ig_tiktok_desc: generated.ig_tiktok_desc,
        error: null,
      })
      .eq("id", contentId);

    if (updateError) {
      console.error("DB update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save generated content" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Image generation (soft failure) ──
    try {
      // Fetch image instructions
      const { data: imageInstructions } = await adminClient
        .from("image_instructions")
        .select("instruction, aspect_ratio")
        .eq("is_active", true);

      const imageRules = (imageInstructions || [])
        .map((r) => `Aspect ratio: ${r.aspect_ratio}\n${r.instruction}`)
        .join("\n\n");

      // Step 2a: Craft image prompt with GPT-4.1 Mini
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
                "You craft optimized image generation prompts for FLUX.2 Pro. Given content context and rules, produce a single detailed image prompt that will generate a compelling cover image.",
            },
            {
              role: "user",
              content: `Title: ${generated.youtube_title}\n\nDescription: ${generated.youtube_desc}\n\n${imageRules ? `Image rules:\n${imageRules}` : ""}`,
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
                      description: "A detailed prompt optimized for FLUX.2 Pro image generation",
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

      // Step 2b: Generate image with gpt-image-1
      const imageResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "black-forest-labs/flux.2-pro",
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
      if (!base64Url) throw new Error("No image returned from FLUX.2 Pro");

      // Step 2c: Upload to R2
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

      // Step 2d: Save image path and prompt
      await adminClient
        .from("social_content")
        .update({ image: storagePath, image_prompt } as any)
        .eq("id", contentId);

      console.log("Image generated and uploaded:", storagePath);
    } catch (imgError) {
      console.error("Image generation error (soft):", imgError);
      // Soft failure - text is preserved, just log the error
    }

    // ── Step 3: Set status to complete ──
    await adminClient
      .from("social_content")
      .update({ status: "complete" })
      .eq("id", contentId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-content error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
