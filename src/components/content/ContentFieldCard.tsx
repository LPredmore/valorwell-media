import { useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { useAutosave } from "@/hooks/useAutosave";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  contentId: string;
  fieldKey: string;
  label: string;
  value: string | null;
  charTarget?: string;
}

export function ContentFieldCard({ contentId, fieldKey, label, value, charTarget }: Props) {
  const [text, setText] = useState(value || "");
  const [copied, setCopied] = useState(false);

  const saveFn = useCallback(
    async (newText: string) => {
      const { error } = await supabase
        .from("social_content")
        .update({ [fieldKey]: newText } as any)
        .eq("id", contentId);
      if (error) throw error;
    },
    [contentId, fieldKey]
  );

  const { trigger, status } = useAutosave(saveFn);

  const handleChange = (val: string) => {
    setText(val);
    trigger(val);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">{label}</h4>
          {status === "saving" && <span className="text-xs text-muted-foreground">Saving...</span>}
          {status === "saved" && <span className="text-xs text-success">Saved ✓</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {text.length} chars
            {charTarget && ` · target: ${charTarget}`}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={fieldKey === "post_title" || fieldKey === "ig_tiktok_desc" ? 3 : 8}
        className="resize-y"
      />
    </div>
  );
}
