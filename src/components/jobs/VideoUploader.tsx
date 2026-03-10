import { useCallback, useRef, useState } from "react";
import { Upload, Film } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Props {
  onFileSelected: (file: File) => void;
  progress?: number;
  uploading?: boolean;
  currentFilename?: string | null;
  fileSize?: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function VideoUploader({ onFileSelected, progress = 0, uploading = false, currentFilename, fileSize }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
        dragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50",
        uploading && "pointer-events-none opacity-70"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleChange} />
      {currentFilename ? (
        <div className="flex items-center gap-3">
          <Film className="h-8 w-8 text-primary" />
          <div>
            <p className="font-medium text-foreground">{currentFilename}</p>
            <p className="text-sm text-muted-foreground">Click or drag to replace</p>
          </div>
        </div>
      ) : (
        <>
          <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Drop your video here or click to browse</p>
          <p className="text-xs text-muted-foreground">Supports all major video formats</p>
        </>
      )}
      {uploading && (
        <div className="mt-4 w-full max-w-xs">
          <Progress value={progress} className="h-2" />
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {Math.round(progress)}%{fileSize ? ` of ${formatBytes(fileSize)}` : ""} — Uploading…
          </p>
        </div>
      )}
    </div>
  );
}
