import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4.1-mini";

// ── AI call helper ──────────────────────────────────────────────────

async function callAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolName: string,
  toolDescription: string,
  toolProperties: Record<string, unknown>,
  requiredFields: string[],
): Promise<Record<string, string>> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: toolDescription,
            parameters: {
              type: "object",
              properties: toolProperties,
              required: requiredFields,
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`OpenRouter error (${toolName}):`, response.status, errText);
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const result = await response.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function.name !== toolName) {
    console.error(`Unexpected response for ${toolName}:`, JSON.stringify(result));
    throw new Error(`AI did not return expected format for ${toolName}`);
  }

  return JSON.parse(toolCall.function.arguments);
}

// ── Step generators ─────────────────────────────────────────────────

async function generateLongScript(
  apiKey: string,
  topic: string,
  instructions: Record<string, string>,
): Promise<string> {
  const systemPrompt = instructions["global"] || "You are a professional video scriptwriter.";
  let userPrompt = `Topic: ${topic}`;
  if (instructions["script_long"]) {
    userPrompt += `\n\n## Script rules:\n${instructions["script_long"]}`;
  }

  const result = await callAI(
    apiKey,
    systemPrompt,
    userPrompt,
    "save_long_script",
    "Save the generated long-form video script.",
    { script_long: { type: "string", description: "Full long-form video script for YouTube" } },
    ["script_long"],
  );

  return result.script_long;
}

async function generateShortScript(
  apiKey: string,
  topic: string,
  longScript: string | null,
  instructions: Record<string, string>,
): Promise<string> {
  const systemPrompt = instructions["global"] || "You are a professional video scriptwriter.";
  let userPrompt = `Topic: ${topic}`;

  if (longScript) {
    userPrompt += `\n\n## Long-form script (extract the most compelling segment for a short-form version):\n${longScript}`;
  }

  if (instructions["script_short"]) {
    userPrompt += `\n\n## Short-form script rules:\n${instructions["script_short"]}`;
  }

  const result = await callAI(
    apiKey,
    systemPrompt,
    userPrompt,
    "save_short_script",
    "Save the generated short-form video script.",
    { script_short: { type: "string", description: "Short-form video script for Reels/TikTok/Shorts" } },
    ["script_short"],
  );

  return result.script_short;
}

async function generateSocialCopy(
  apiKey: string,
  topic: string,
  script: string | null,
  postLength: string,
  instructions: Record<string, string>,
): Promise<Record<string, string>> {
  const systemPrompt = instructions["global"] || "You are a social media content generation assistant.";

  let userPrompt = `Topic: ${topic}`;

  if (script) {
    const label = postLength === "Long" ? "Long-form script" : "Short-form script";
    userPrompt += `\n\n## ${label}:\n${script}`;
  }

  // Build field scopes based on post length
  const commonScopes = ["post_title", "facebook_desc", "youtube_comment"];
  const longScopes = ["youtube_desc", "linkedin_desc"];
  const shortScopes = ["ig_tiktok_desc"];

  const fieldScopes = [
    ...commonScopes,
    ...(postLength === "Long" ? longScopes : []),
    ...(postLength === "Short" ? shortScopes : []),
    "hashtags",
  ];

  for (const scope of fieldScopes) {
    if (instructions[scope]) {
      userPrompt += `\n\n## ${scope} rules:\n${instructions[scope]}`;
    }
  }

  // Build tool properties based on post length
  const properties: Record<string, unknown> = {
    post_title: { type: "string", description: "Content title, max 60 characters, creates tension and curiosity with a core keyword" },
    facebook_desc: { type: "string", description: "Facebook caption, 600-1200 characters with hashtags" },
    youtube_comment: { type: "string", description: "YouTube first comment, under 300 chars, no hashtags" },
  };

  const required = ["post_title", "facebook_desc", "youtube_comment"];

  if (postLength === "Long") {
    properties.youtube_desc = { type: "string", description: "YouTube description, 1800-2500 characters with hashtags" };
    properties.linkedin_desc = { type: "string", description: "LinkedIn post, 900-1600 characters with hashtags" };
    required.push("youtube_desc", "linkedin_desc");
  }

  if (postLength === "Short") {
    properties.ig_tiktok_desc = { type: "string", description: "Instagram + TikTok caption, 200-300 characters plus hashtags" };
    required.push("ig_tiktok_desc");
  }

  return await callAI(
    apiKey,
    systemPrompt,
    userPrompt,
    "save_content",
    `Save the generated social media content for ${postLength === "Long" ? "long-form" : "short-form"} video.`,
    properties,
    required,
  );
}

// ── Email helper ────────────────────────────────────────────────────

async function sendScriptEmail(
  apiKey: string,
  postLength: string,
  postTitle: string,
  script: string,
): Promise<void> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Flurra <info@bestselfs.com>",
        to: "info@bestselfs.com",
        subject: `${postLength} - ${postTitle}`,
        text: script,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[generate-content] Email send failed:", res.status, errText);
    } else {
      console.log("[generate-content] Script email sent successfully");
    }
  } catch (e) {
    console.error("[generate-content] Email send error:", e);
  }
}

// ── Main handler ────────────────────────────────────────────────────

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
    const { contentId, skipScript } = await req.json();
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
      .update({ status: "incomplete", error: null })
      .eq("id", contentId);

    // Fetch this user's active content instructions (per-tenant)
    const { data: instructionRows } = await adminClient
      .from("user_content_instructions")
      .select("scope, instruction")
      .eq("user_id", content.user_id)
      .eq("is_active", true);

    const instructions: Record<string, string> = {};
    for (const row of instructionRows || []) {
      instructions[row.scope] = row.instruction;
    }

    const topic = content.topic;
    const postLength = content.post_length; // "Long" or "Short"

    let script: string | null = null;

    // ── Step 1: Generate script (one per video type) ──
    // If skipScript is true, use the pre-populated script from the DB
    if (skipScript && content.script) {
      script = content.script;
      console.log(`[generate-content] Skipping script generation — using pre-populated script`);
    } else if (postLength === "Long") {
      try {
        console.log(`[generate-content] Step 1: Generating long script for "${topic}"`);
        script = await generateLongScript(OPENROUTER_API_KEY, topic, instructions);

        await adminClient
          .from("social_content")
          .update({ script })
          .eq("id", contentId);

        console.log("[generate-content] Step 1 complete: long script saved");
      } catch (e) {
        console.error("[generate-content] Step 1 failed:", e);
        await adminClient
          .from("social_content")
          .update({ status: "incomplete", error: `Failed at step 1 (long script): ${e instanceof Error ? e.message : "Unknown error"}` })
          .eq("id", contentId);
        return new Response(JSON.stringify({ error: "Long script generation failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (postLength === "Short") {
      try {
        console.log(`[generate-content] Step 1: Generating short script for "${topic}"`);
        script = await generateShortScript(OPENROUTER_API_KEY, topic, null, instructions);

        await adminClient
          .from("social_content")
          .update({ script })
          .eq("id", contentId);

        console.log("[generate-content] Step 1 complete: short script saved");
      } catch (e) {
        console.error("[generate-content] Step 1 failed:", e);
        await adminClient
          .from("social_content")
          .update({ status: "incomplete", error: `Failed at step 1 (short script): ${e instanceof Error ? e.message : "Unknown error"}` })
          .eq("id", contentId);
        return new Response(JSON.stringify({ error: "Short script generation failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Step 2: Social copy (length-specific fields) ──
    try {
      console.log(`[generate-content] Step 2: Generating social copy for "${topic}" (${postLength})`);
      const generated = await generateSocialCopy(OPENROUTER_API_KEY, topic, script, postLength, instructions);

      // Build update object with only the fields that were generated
      // The DB trigger auto_promote_incomplete will set status to 'unscheduled'
      // if all required fields are present after this update.
      const updateData: Record<string, unknown> = {
        post_title: generated.post_title,
        facebook_desc: generated.facebook_desc,
        youtube_comment: generated.youtube_comment,
        error: null,
      };

      if (postLength === "Long") {
        updateData.youtube_desc = generated.youtube_desc;
        updateData.linkedin_desc = generated.linkedin_desc;
      }

      if (postLength === "Short") {
        updateData.ig_tiktok_desc = generated.ig_tiktok_desc;
      }

      const { error: updateError } = await adminClient
        .from("social_content")
        .update(updateData)
        .eq("id", contentId);

      if (updateError) {
        console.error("DB update error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to save generated content" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[generate-content] Step 2 complete: social copy saved");

      // Fire-and-forget: email the script to info@bestselfs.com
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY && script) {
        sendScriptEmail(RESEND_API_KEY, postLength, generated.post_title || topic, script);
      }
    } catch (e) {
      console.error("[generate-content] Step 2 failed:", e);
      await adminClient
        .from("social_content")
        .update({ status: "incomplete", error: `Failed at step 2 (social copy): ${e instanceof Error ? e.message : "Unknown error"}` })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: "Social copy generation failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
