import { useState, useEffect } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ImageLightbox } from "./ImageLightbox";
import { uploadVideoToR2 } from "@/lib/uploadVideo";
import { Button } from "@/components/ui/button";

interface Props {
  storagePath: string | null;
  contentId?: string;
  onImageUploaded?: (storagePath: string) => void;
}

export function ImageSection({ storagePath, contentId, onImageUploaded }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const handleImageUpload = async (file: File) => {
    if (!contentId) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const newPath = `content/${contentId}/cover.${ext}`;

    console.log("[ImageSection] Starting image upload", {
      contentId,
      fileName: file.name,
      fileSize: file.size,
      fileSizeHuman: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      fileType: file.type,
      storagePath: newPath,
    });

    try {
      await uploadVideoToR2(newPath, file, () => {});
      console.log("[ImageSection] Image upload succeeded, updating DB...");
      await supabase.from("social_content").update({ image: newPath } as any).eq("id", contentId);
      onImageUploaded?.(newPath);
    } catch (err: any) {
      console.error("[ImageSection] Image upload failed", err);
    } finally {
      setUploading(false);
    }
  };

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
          {contentId && (
            <label>
              <Button variant="outline" size="sm" className="gap-1.5" asChild disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Replace Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                    }}
                  />
                </span>
              </Button>
            </label>
          )}
        </>
      ) : (
        contentId ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <ImageIcon className="h-8 w-8" />
                <span>Click to upload a cover image</span>
                <span className="text-xs">PNG, JPG, or WebP</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
          </label>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 p-8 text-sm text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
            <span>No cover image</span>
          </div>
        )
      )}
    </div>
  );
}
