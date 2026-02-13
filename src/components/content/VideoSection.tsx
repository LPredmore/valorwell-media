import { Film } from "lucide-react";
import { VideoUploader } from "@/components/jobs/VideoUploader";
import type { SocialContent } from "@/hooks/useContents";

interface Props {
  content: SocialContent;
  onReplace: (file: File) => void;
  uploading: boolean;
  progress: number;
}

export function VideoSection({ content, onReplace, uploading, progress }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Video</h3>
      {content.video_storage_path ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Film className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{content.video_original_filename || "Video file"}</p>
              <p className="text-xs text-muted-foreground">{content.video_mime_type}</p>
            </div>
          </div>
          <VideoUploader onFileSelected={onReplace} uploading={uploading} progress={progress} currentFilename={content.video_original_filename} />
        </div>
      ) : (
        <VideoUploader onFileSelected={onReplace} uploading={uploading} progress={progress} />
      )}
    </div>
  );
}
