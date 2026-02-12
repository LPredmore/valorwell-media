import { Film } from "lucide-react";
import { VideoUploader } from "./VideoUploader";
import type { ContentJob } from "@/hooks/useJob";

interface Props {
  job: ContentJob;
  onReplace: (file: File) => void;
  uploading: boolean;
  progress: number;
}

export function VideoSection({ job, onReplace, uploading, progress }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Video</h3>
      {job.video_storage_path ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Film className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{job.video_original_filename || "Video file"}</p>
              <p className="text-xs text-muted-foreground">
                {job.video_mime_type}
                {job.video_duration_seconds ? ` · ${Math.round(job.video_duration_seconds)}s` : ""}
              </p>
            </div>
          </div>
          <VideoUploader onFileSelected={onReplace} uploading={uploading} progress={progress} currentFilename={job.video_original_filename} />
        </div>
      ) : (
        <VideoUploader onFileSelected={onReplace} uploading={uploading} progress={progress} />
      )}
    </div>
  );
}
