import { useRef, useState } from "react";
import { Upload, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { TablesInsert } from "@/integrations/supabase/types";

const CSV_COLUMNS = [
  "topic",
  "post_length",
  "post_title",
  "planned_date",
  "script",
  "youtube_desc",
  "ig_tiktok_desc",
  "facebook_desc",
  "linkedin_desc",
] as const;

// Required columns (marked with * in template header)
const REQUIRED = new Set<string>(["topic", "post_length"]);

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let cells: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(current.trim());
        current = "";
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        if (ch === '\r') i++;
        cells.push(current.trim());
        if (cells.some((c) => c !== "")) rows.push(cells);
        cells = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }
  cells.push(current.trim());
  if (cells.some((c) => c !== "")) rows.push(cells);

  return rows;
}

// Strip trailing "*" markers from header names
const normalizeHeader = (h: string) => h.toLowerCase().trim().replace(/\*+$/, "").trim();

export function ContentCsvUpload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImporting(true);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast({ title: "CSV is empty", variant: "destructive" });
        return;
      }
      const headers = rows[0].map(normalizeHeader);
      const missing = CSV_COLUMNS.filter((c) => !headers.includes(c));
      if (missing.length > 0) {
        toast({
          title: "CSV column mismatch",
          description: `Missing columns: ${missing.join(", ")}. Download the template to see the expected format.`,
          variant: "destructive",
        });
        return;
      }
      const colIdx = Object.fromEntries(CSV_COLUMNS.map((c) => [c, headers.indexOf(c)])) as Record<
        (typeof CSV_COLUMNS)[number],
        number
      >;

      const inserts: TablesInsert<"social_content">[] = [];
      let invalidDateCount = 0;
      let skippedRequired = 0;
      let skippedLength = 0;

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const get = (k: (typeof CSV_COLUMNS)[number]) => (r[colIdx[k]] ?? "").trim();

        const topic = get("topic");
        const lengthRaw = get("post_length");

        // Skip wholly-empty rows silently
        if (!topic && !lengthRaw && CSV_COLUMNS.every((c) => !get(c))) continue;

        // Required field check
        if (REQUIRED.has("topic") && !topic) {
          skippedRequired++;
          continue;
        }
        if (REQUIRED.has("post_length") && !lengthRaw) {
          skippedRequired++;
          continue;
        }

        const lenNorm = lengthRaw.charAt(0).toUpperCase() + lengthRaw.slice(1).toLowerCase();
        if (lenNorm !== "Short" && lenNorm !== "Long") {
          skippedLength++;
          continue;
        }

        const rawDate = get("planned_date");
        let validDate: string | null = null;
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) validDate = d.toISOString();
          else invalidDateCount++;
        }

        inserts.push({
          user_id: user.id,
          topic,
          post_length: lenNorm as "Short" | "Long",
          post_title: get("post_title") || null,
          planned_date: validDate,
          script: get("script") || null,
          youtube_desc: get("youtube_desc") || null,
          ig_tiktok_desc: get("ig_tiktok_desc") || null,
          facebook_desc: get("facebook_desc") || null,
          linkedin_desc: get("linkedin_desc") || null,
          status: "incomplete",
        });
      }

      if (inserts.length === 0) {
        toast({
          title: "No valid rows imported",
          description:
            skippedRequired || skippedLength
              ? `${skippedRequired} missing required fields, ${skippedLength} invalid post_length.`
              : "Check the file and try again.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("social_content").insert(inserts);
      if (error) throw error;

      const warnings: string[] = [];
      if (skippedRequired) warnings.push(`${skippedRequired} skipped (missing topic or post_length)`);
      if (skippedLength) warnings.push(`${skippedLength} skipped (post_length must be Short or Long)`);
      if (invalidDateCount) warnings.push(`${invalidDateCount} invalid dates cleared`);

      toast({
        title: `${inserts.length} content rows imported`,
        description: warnings.length ? warnings.join(" · ") : "Find them in the Incomplete tab.",
      });

      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    } catch (err: any) {
      toast({ title: "CSV import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" className="gap-2" asChild>
        <a href="/content-template.csv" download="content-template.csv">
          <Download className="h-4 w-4" /> Template
        </a>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-2"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
      >
        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload CSV
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleCSV}
      />
    </div>
  );
}
