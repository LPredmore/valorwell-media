import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useContent } from "@/hooks/useContent";
import { useDeleteContent } from "@/hooks/useContents";
import { useAutosave } from "@/hooks/useAutosave";
import { useRetryYouTubeUpload } from "@/hooks/useSchedule";
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
import { CONTENT_FIELDS, SCRIPT_FIELDS } from "@/lib/platforms";
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
  youtube_title: "55–75",
  youtube_desc: "1,800–2,500",
  facebook_desc: "600–1,200",
  linkedin_desc: "900–1,600",
  ig_tiktok_desc: "200–300",
};

function YouTubeStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const variants: Record<string, string> = {
    queued: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    uploading: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    scheduled: "bg-green-500/15 text-green-700 border-green-500/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <Badge variant="outline" className={variants[status] ?? ""}>{status}</Badge>
  );
}

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: content, isLoading, error } = useContent(id);
  const deleteContent = useDeleteContent();
  const retryMutation = useRetryYouTubeUpload();
  const [topic, setTopic] = useState("");
  const [topicInit, setTopicInit] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
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

  const promoteStatusIfComplete = async () => {
    if (!id) return;
    const { data: updated } = await supabase
      .from("social_content")
      .select("image, video_storage_path, youtube_title, status")
      .eq("id", id)
      .single();

    if (updated && (updated as any).image && (updated as any).video_storage_path
        && (updated as any).youtube_title && (updated as any).status === "incomplete") {
      await supabase.from("social_content").update({ status: "unscheduled" } as any).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["content", id] });
  };

  const handleVideoReplace = async (file: File) => {
    if (!id) return;
    setVideoUploading(true);
    setVideoProgress(20);

    const ext = file.name.split(".").pop();
    const storagePath = `content/${id}/video.${ext}`;

    console.log("[ContentDetail] Starting video replace", {
      contentId: id,
      fileName: file.name,
      fileSize: file.size,
      fileSizeHuman: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      storagePath,
    });

    try {
      await uploadVideoToR2(storagePath, file, (pct) => {
        setVideoProgress(20 + pct * 0.5);
      });
      console.log("[ContentDetail] Video upload succeeded, updating DB...");
    } catch (uploadError: any) {
      console.error("[ContentDetail] Video upload failed", uploadError);
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
    await promoteStatusIfComplete();
  };

  const handleImageUploaded = async (_storagePath: string) => {
    await promoteStatusIfComplete();
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
    deleteContent.mutate(id, { onSuccess: () => navigate("/content") });
  };

  const handleRetry = () => {
    if (!id) return;
    retryMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Upload re-queued" });
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
          <Link to="/content">
            <Button variant="link" className="mt-2">Back to Content</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Link to="/content">
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

        {/* YouTube Status Panel */}
        {content.youtube_status && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">YouTube Upload</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="mt-1"><YouTubeStatusBadge status={content.youtube_status} /></div>
              </div>
              <div>
                <span className="text-muted-foreground">Upload At</span>
                <div className="mt-1 font-medium">
                  {content.upload_at ? format(new Date(content.upload_at), "MMM d, yyyy h:mm a") : "—"}
                </div>
              </div>
              {content.youtube_video_id && (
                <div>
                  <span className="text-muted-foreground">YouTube Video</span>
                  <div className="mt-1">
                    <a
                      href={`https://youtu.be/${content.youtube_video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                    >
                      {content.youtube_video_id}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
              {content.youtube_uploaded_at && (
                <div>
                  <span className="text-muted-foreground">Uploaded At</span>
                  <div className="mt-1 font-medium">
                    {format(new Date(content.youtube_uploaded_at), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
              )}
            </div>

            {content.youtube_status === "failed" && content.youtube_error_detail && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {content.youtube_error_detail}
              </div>
            )}

            {content.youtube_status === "failed" && (
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
                Retry Upload
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
        />

        {/* Cover Image */}
        <ImageSection storagePath={content.image} contentId={content.id} onImageUploaded={handleImageUploaded} />

        {/* Scripts */}
        {(content.script_long || content.script_short) && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Scripts</h3>
            {content.post_length === "Long" && (
              <ContentFieldCard
                contentId={content.id}
                fieldKey="script_long"
                label={SCRIPT_FIELDS.script_long}
                value={(content as any).script_long}
              />
            )}
            <ContentFieldCard
              contentId={content.id}
              fieldKey="script_short"
              label={SCRIPT_FIELDS.script_short}
              value={(content as any).script_short}
            />
          </div>
        )}

        {/* Generated Content Fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Generated Content</h3>
          {(Object.entries(CONTENT_FIELDS) as [string, string][]).map(([key, label]) => (
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
