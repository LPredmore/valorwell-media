import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function ScheduleThumbnail({ imagePath }: { imagePath: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) return;
    let cancelled = false;

    supabase.functions
      .invoke("r2-read-url", { body: { storagePath: imagePath } })
      .then(({ data }) => {
        if (!cancelled && data?.readUrl) setUrl(data.readUrl);
      });

    return () => { cancelled = true; };
  }, [imagePath]);

  if (!imagePath || !url) {
    return (
      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
        —
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="Thumbnail"
      className="h-12 w-12 rounded object-cover"
    />
  );
}
