import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4.1-mini";

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { longScript, topic } = await req.json();

    if (!longScript || !topic) {
      return new Response(JSON.stringify({ error: "longScript and topic are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the shorts_extraction instruction
    const { data: instructionRows } = await adminClient
      .from("content_instructions")
      .select("instruction")
      .eq("scope", "shorts_extraction")
      .eq("is_active", true)
      .limit(1);

    const extractionInstruction = instructionRows?.[0]?.instruction
      || "Extract 3-5 compelling standalone short-form video segments from the long-form script.";

    // Also fetch global instruction for system prompt
    const { data: globalRows } = await adminClient
      .from("content_instructions")
      .select("instruction")
      .eq("scope", "global")
      .eq("is_active", true)
      .limit(1);

    const systemPrompt = globalRows?.[0]?.instruction || "You are a professional video content strategist.";

    const userPrompt = `Topic: ${topic}\n\n## Long-form script:\n${longScript}\n\n## Extraction rules:\n${extractionInstruction}`;

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
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
              name: "save_extracted_shorts",
              description: "Save the extracted short-form video scripts.",
              parameters: {
                type: "object",
                properties: {
                  shorts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short-form video title, max 60 characters" },
                        script: { type: "string", description: "Complete short-form video script, 75-150 words" },
                      },
                      required: ["title", "script"],
                      additionalProperties: false,
                    },
                    description: "Array of 3-5 extracted short-form video scripts",
                  },
                },
                required: ["shorts"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_extracted_shorts" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenRouter error:", response.status, errText);
      return new Response(JSON.stringify({ error: `AI extraction failed: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "save_extracted_shorts") {
      console.error("Unexpected AI response:", JSON.stringify(result));
      return new Response(JSON.stringify({ error: "AI did not return expected format" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const shorts = parsed.shorts;

    if (!Array.isArray(shorts) || shorts.length === 0) {
      return new Response(JSON.stringify({ error: "AI returned no shorts" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[extract-shorts] Extracted ${shorts.length} shorts for topic "${topic}"`);

    return new Response(JSON.stringify({ shorts }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-shorts error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
