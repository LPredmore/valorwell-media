import { useCallback, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HashtagEditor } from "./HashtagEditor";
import { useAutosave } from "@/hooks/useAutosave";
import { supabase } from "@/integrations/supabase/client";
import { HASHTAG_LIMITS, type PlatformKey } from "@/lib/platforms";
import { formatPlatformOutput, copyToClipboard } from "@/lib/clipboard";
import { Copy, Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { PlatformOutput } from "@/hooks/useJob";

interface Props {
  output: PlatformOutput;
  platform: PlatformKey;
}

export function PlatformOutputTab({ output, platform }: Props) {
  const [title, setTitle] = useState(output.title || "");
  const [body, setBody] = useState(output.body || "");
  const [hashtags, setHashtags] = useState<string[]>(output.hashtags || []);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTitle(output.title || "");
    setBody(output.body || "");
    setHashtags(output.hashtags || []);
  }, [output.id]);

  const saveFn = useCallback(
    async (data: { title: string; body: string; hashtags: string[] }) => {
      const { error } = await supabase
        .from("platform_outputs")
        .update({ title: data.title || null, body: data.body || null, hashtags: data.hashtags })
        .eq("id", output.id);
      if (error) throw error;
    },
    [output.id]
  );

  const { trigger, status } = useAutosave(saveFn);

  const handleChange = useCallback(
    (updates: Partial<{ title: string; body: string; hashtags: string[] }>) => {
      const next = { title, body, hashtags, ...updates };
      if ("title" in updates) setTitle(updates.title!);
      if ("body" in updates) setBody(updates.body!);
      if ("hashtags" in updates) setHashtags(updates.hashtags!);
      trigger(next);
    },
    [title, body, hashtags, trigger]
  );

  const handleCopy = async () => {
    const text = formatPlatformOutput(title, body, hashtags);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {status === "saving" && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </span>
          )}
          {status === "saved" && <span className="text-success">Saved ✓</span>}
          {status === "error" && <span className="text-destructive">Save failed</span>}
        </span>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Title (optional)</label>
        <Input value={title} onChange={(e) => handleChange({ title: e.target.value })} placeholder="Enter title..." />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Body</label>
        <Textarea
          value={body}
          onChange={(e) => handleChange({ body: e.target.value })}
          placeholder="Enter description..."
          rows={6}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Hashtags</label>
        <HashtagEditor
          hashtags={hashtags}
          maxHashtags={HASHTAG_LIMITS[platform]}
          onChange={(h) => handleChange({ hashtags: h })}
        />
      </div>
    </div>
  );
}
