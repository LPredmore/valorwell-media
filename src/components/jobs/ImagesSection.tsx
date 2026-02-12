import { useRef, useState, useEffect } from "react";
import { ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { ContentJob } from "@/hooks/useJob";

interface Props {
  job: ContentJob;
}

function ImageSlot({
  label,
  aspectRatio,
  storagePath,
  jobId,
  fieldName,
}: {
  label: string;
  aspectRatio: string;
  storagePath: string | null;
  jobId: string;
  fieldName: "image_url_9x16" | "image_url_16x9";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (storagePath) {
      supabase.storage
        .from("content-media")
        .createSignedUrl(storagePath, 3600)
        .then(({ data }) => {
          if (data) setPreviewUrl(data.signedUrl);
        });
    }
  }, [storagePath]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `jobs/${jobId}/cover_${aspectRatio.replace(":", "x")}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("content-media")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("content_jobs")
      .update({ [fieldName]: path })
      .eq("id", jobId);

    if (updateError) {
      toast({ title: "Save failed", description: updateError.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    }
    setUploading(false);
  };

  return (
    <div
      className="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 p-4 transition-colors hover:border-primary/50"
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      {previewUrl ? (
        <img src={previewUrl} alt={label} className="h-24 w-full rounded object-cover" />
      ) : (
        <>
          <ImagePlus className="mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </>
      )}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

export function ImagesSection({ job }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cover Images</h3>
      <div className="grid grid-cols-2 gap-3">
        <ImageSlot
          label="9:16 Portrait"
          aspectRatio="9:16"
          storagePath={job.image_url_9x16}
          jobId={job.id}
          fieldName="image_url_9x16"
        />
        <ImageSlot
          label="16:9 Landscape"
          aspectRatio="16:9"
          storagePath={job.image_url_16x9}
          jobId={job.id}
          fieldName="image_url_16x9"
        />
      </div>
    </div>
  );
}
