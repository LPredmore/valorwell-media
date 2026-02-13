import { useState, useEffect } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ImageLightbox } from "./ImageLightbox";

interface Props {
  storagePath: string | null;
}

export function ImageSection({ storagePath }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!storagePath) {
      setImageUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("r2-read-url", {
          body: { storagePath },
        });
        if (!cancelled && !error && data?.readUrl) {
          setImageUrl(data.readUrl);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [storagePath]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cover Image</h3>
      {loading ? (
        <div className="flex items-center justify-center rounded-lg bg-muted/50 p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : imageUrl ? (
        <>
          <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" onClick={() => setLightboxOpen(true)}>
            <img
              src={imageUrl}
              alt="Generated cover"
              className="h-full w-full object-cover"
            />
          </AspectRatio>
          <ImageLightbox imageUrl={imageUrl} open={lightboxOpen} onOpenChange={setLightboxOpen} />
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 p-8 text-sm text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
          <span>No image generated yet</span>
        </div>
      )}
    </div>
  );
}
