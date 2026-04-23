import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BlobReader, ZipReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.45/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_TEXT_CHARS = 200_000; // ~50k tokens worth, safety cap

async function extractTxt(file: Blob): Promise<string> {
  return await file.text();
}

async function extractDocx(file: Blob): Promise<string> {
  const reader = new ZipReader(new BlobReader(file));
  const entries = await reader.getEntries();
  const docEntry = entries.find((e) => e.filename === "word/document.xml");
  if (!docEntry || !docEntry.getData) {
    await reader.close();
    throw new Error("Invalid .docx — missing word/document.xml");
  }
  const xml = await docEntry.getData(new TextWriter());
  await reader.close();

  // Strip XML, keeping paragraph breaks. Replace </w:p> with newline, then strip all tags.
  const withBreaks = xml
    .replace(/<w:p[\s>][^]*?<\/w:p>/g, (m) => m + "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  // Decode common XML entities
  return stripped
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { fileId } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "fileId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: rowErr } = await supabase
      .from("user_knowledge_files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", userId)
      .single();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("user_knowledge_files")
      .update({ status: "processing", error: null })
      .eq("id", fileId);

    const { data: blob, error: dlErr } = await supabase.storage
      .from("content-media")
      .download(row.storage_path);

    if (dlErr || !blob) {
      const msg = dlErr?.message || "Download failed";
      await supabase
        .from("user_knowledge_files")
        .update({ status: "failed", error: msg })
        .eq("id", fileId);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let text = "";
    try {
      const lower = row.file_name.toLowerCase();
      if (lower.endsWith(".docx") || row.mime_type.includes("officedocument.wordprocessingml")) {
        text = await extractDocx(blob);
      } else if (lower.endsWith(".txt") || lower.endsWith(".md") || row.mime_type.startsWith("text/")) {
        text = await extractTxt(blob);
      } else {
        throw new Error(`Unsupported file type: ${row.mime_type || row.file_name}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extraction failed";
      console.error("Extraction error:", msg);
      await supabase
        .from("user_knowledge_files")
        .update({ status: "failed", error: msg })
        .eq("id", fileId);
      return new Response(JSON.stringify({ error: msg }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = text.trim().slice(0, MAX_TEXT_CHARS);

    await supabase
      .from("user_knowledge_files")
      .update({
        status: "ready",
        extracted_text: trimmed,
        error: null,
      })
      .eq("id", fileId);

    return new Response(
      JSON.stringify({ ok: true, chars: trimmed.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-knowledge-file error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
