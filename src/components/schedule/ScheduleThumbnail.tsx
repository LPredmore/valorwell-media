import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImageLightbox } from "@/components/content/ImageLightbox";

export function ScheduleThumbnail({ imagePath }: { imagePath: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
    <>
      <img
        src={url}
        alt="Thumbnail"
        className="h-12 w-12 rounded object-cover cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
        onClick={(e) => {
          e.stopPropagation();
          setLightboxOpen(true);
        }}
      />
      <ImageLightbox imageUrl={url} open={lightboxOpen} onOpenChange={setLightboxOpen} />
    </>
  );
}
