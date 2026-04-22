import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useContent } from "@/hooks/useContent";
import { useDeleteContent } from "@/hooks/useContents";
import { useAutosave } from "@/hooks/useAutosave";
import { useRetryUploadPost } from "@/hooks/useSchedule";
import { StatusBadge } from "@/components/content/StatusBadge";
import { VideoSection } from "@/components/content/VideoSection";
import { ImageSection } from "@/components/content/ImageSection";
import { ContentFieldCard } from "@/components/content/ContentFieldCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToR2 } from "@/lib/uploadVideo";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Trash2, Loader2, RefreshCw, RotateCcw, ExternalLink } from "lucide-react";
import { COMMON_FIELDS, LONG_FIELDS, SHORT_FIELDS, PLATFORM_LABELS } from "@/lib/platforms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CHAR_TARGETS: Record<string, string> = {
  post_title: "≤60",
  youtube_desc: "1,800–2,500",
  facebook_desc: "600–1,200",
  linkedin_desc: "900–1,600",
  ig_tiktok_desc: "200–300",
};

function PostStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const variants: Record<string, string> = {
    pending: "bg-muted text-muted-foreground border-border",
    uploading: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    success: "bg-green-500/15 text-green-700 border-green-500/30",
    partial: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <Badge variant="outline" className={variants[status] ?? ""}>{status}</Badge>
  );
}

function getResultPostUrl(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const candidates = ["post_url", "url", "permalink", "video_url"];
  for (const k of candidates) {
    const v = r[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function getResultStatus(result: unknown): "success" | "failed" | "pending" {
  if (!result || typeof result !== "object") return "pending";
  const r = result as Record<string, unknown>;
  if (r.success === true) return "success";
  if (r.success === false) return "failed";
  if (typeof r.status === "string") {
    const s = r.status.toLowerCase();
    if (["success", "completed", "complete", "done", "finished"].includes(s)) return "success";
    if (["failed", "error"].includes(s)) return "failed";
  }
  return "pending";
}

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: content, isLoading, error } = useContent(id);
  const deleteContent = useDeleteContent();
  const retryMutation = useRetryUploadPost();
  const [topic, setTopic] = useState("");
  const [topicInit, setTopicInit] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoFileSize, setVideoFileSize] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  if (content && !topicInit) {
    setTopic(content.topic);
    setTopicInit(true);
  }

  const saveTopicFn = useCallback(
    async (newTopic: string) => {
      if (!id) return;
      const { error } = await supabase.from("social_content").update({ topic: newTopic } as any).eq("id", id);
      if (error) throw error;
    },
    [id]
  );

  const { trigger: triggerTopicSave, status: topicSaveStatus } = useAutosave(saveTopicFn);

  const handleTopicChange = (value: string) => {
    setTopic(value);
    triggerTopicSave(value);
  };

  const handleVideoReplace = async (file: File) => {
    if (!id) return;
    setVideoUploading(true);
    setVideoProgress(0);
    setVideoFileSize(file.size);
    const ext = file.name.split(".").pop();
    const storagePath = `content/${id}/video.${ext}`;

    try {
      await uploadVideoToR2(storagePath, file, (pct) => setVideoProgress(pct));
    } catch (uploadError: any) {
      toast({ title: "Upload failed", description: uploadError?.message, variant: "destructive" });
      setVideoUploading(false);
      return;
    }

    await supabase
      .from("social_content")
      .update({
        video_storage_path: storagePath,
        video_mime_type: file.type,
        video_original_filename: file.name,
      } as any)
      .eq("id", id);

    setVideoProgress(100);
    setVideoUploading(false);
    queryClient.invalidateQueries({ queryKey: ["content", id] });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
  };

  const handleImageUploaded = async (_storagePath: string) => {
    queryClient.invalidateQueries({ queryKey: ["content", id] });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
  };

  const handleRegenerate = async () => {
    if (!id) return;
    setRegenerating(true);
    const { error } = await supabase.functions.invoke("generate-content", {
      body: { contentId: id },
    });
    if (error) {
      toast({ title: "Regeneration failed", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["content", id] });
      toast({ title: "Content regenerated" });
    }
    setRegenerating(false);
  };

  const handleDelete = () => {
    if (!id) return;
    deleteContent.mutate(id, { onSuccess: () => navigate("/schedule") });
  };

  const handleRetry = () => {
    if (!id) return;
    retryMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Post re-queued" });
        queryClient.invalidateQueries({ queryKey: ["content", id] });
      },
      onError: (err: any) => {
        toast({ title: "Retry failed", description: err.message, variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (error || !content) {
    return (
      <AppLayout>
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">Content not found</p>
          <Link to="/schedule">
            <Button variant="link" className="mt-2">Back to Content</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const results = (content.upload_post_results ?? {}) as Record<string, unknown>;
  const platformResultEntries = Object.entries(results);

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Link to="/schedule">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <Input
                value={topic}
                onChange={(e) => handleTopicChange(e.target.value)}
                className="border-0 bg-transparent px-0 text-2xl font-extrabold tracking-tight shadow-none focus-visible:ring-0"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {topicSaveStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
              {topicSaveStatus === "saved" && "Saved ✓"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={content.status} />
            <span className="text-sm text-muted-foreground">
              Created {format(new Date(content.created_at), "MMM d, yyyy")}
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this content?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this content and all generated outputs.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {content.error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {content.error}
            </div>
          )}
        </div>

        {/* Upload-Post Status Panel */}
        {content.upload_post_status && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Publishing Status
              </h3>
              <PostStatusBadge status={content.upload_post_status} />
            </div>

            {platformResultEntries.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {platformResultEntries.map(([platform, result]) => {
                  const status = getResultStatus(result);
                  const url = getResultPostUrl(result);
                  return (
                    <div
                      key={platform}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                    >
                      <span className="text-sm font-medium">
                        {PLATFORM_LABELS[platform] ?? platform}
                      </span>
                      <div className="flex items-center gap-2">
                        <PostStatusBadge status={status} />
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(content.upload_post_status === "failed" || content.upload_post_status === "partial") && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleRetry}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Retry Post
              </Button>
            )}
          </div>
        )}

        {/* Video */}
        <VideoSection
          content={content}
          onReplace={handleVideoReplace}
          uploading={videoUploading}
          progress={videoProgress}
          fileSize={videoFileSize}
        />

        {content.post_length === "Long" && (
          <ImageSection storagePath={content.image} contentId={content.id} onImageUploaded={handleImageUploaded} />
        )}

        {/* Script */}
        {content.script && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Script</h3>
            <ContentFieldCard
              contentId={content.id}
              fieldKey="script"
              label={content.post_length === "Long" ? "Long-Form Script" : "Short-Form Script"}
              value={content.script}
            />
          </div>
        )}

        {/* Generated Content Fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Generated Content</h3>
          {(Object.entries(COMMON_FIELDS) as [string, string][]).map(([key, label]) => (
            <ContentFieldCard
              key={key}
              contentId={content.id}
              fieldKey={key}
              label={label}
              value={(content as any)[key]}
              charTarget={CHAR_TARGETS[key]}
            />
          ))}
          {content.post_length === "Long" && (Object.entries(LONG_FIELDS) as [string, string][]).map(([key, label]) => (
            <ContentFieldCard
              key={key}
              contentId={content.id}
              fieldKey={key}
              label={label}
              value={(content as any)[key]}
              charTarget={CHAR_TARGETS[key]}
            />
          ))}
          {content.post_length === "Short" && (Object.entries(SHORT_FIELDS) as [string, string][]).map(([key, label]) => (
            <ContentFieldCard
              key={key}
              contentId={content.id}
              fieldKey={key}
              label={label}
              value={(content as any)[key]}
              charTarget={CHAR_TARGETS[key]}
            />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
