import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  hashtags: string[];
  maxHashtags: number;
  onChange: (hashtags: string[]) => void;
}

export function HashtagEditor({ hashtags, maxHashtags, onChange }: Props) {
  const [input, setInput] = useState("");
  const overLimit = hashtags.length > maxHashtags;

  const addTag = useCallback(() => {
    const raw = input.trim();
    if (!raw) return;
    const tag = raw.startsWith("#") ? raw : `#${raw}`;
    if (!hashtags.includes(tag)) {
      onChange([...hashtags, tag]);
    }
    setInput("");
  }, [input, hashtags, onChange]);

  const removeTag = useCallback(
    (tag: string) => {
      onChange(hashtags.filter((h) => h !== tag));
    },
    [hashtags, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {hashtags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
          >
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add hashtag..."
          className="h-8 text-sm"
        />
        <span className={cn("shrink-0 text-xs font-medium", overLimit ? "text-destructive" : "text-muted-foreground")}>
          {hashtags.length} / {maxHashtags}
        </span>
      </div>
    </div>
  );
}
