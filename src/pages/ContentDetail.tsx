import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useContent } from "@/hooks/useContent";
import { useDeleteContent } from "@/hooks/useContents";
import { useAutosave } from "@/hooks/useAutosave";
import { StatusBadge } from "@/components/content/StatusBadge";
import { VideoSection } from "@/components/content/VideoSection";
import { ContentFieldCard } from "@/components/content/ContentFieldCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToR2 } from "@/lib/uploadVideo";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Trash2, Loader2, RefreshCw } from "lucide-react";
import { CONTENT_FIELDS } from "@/lib/platforms";
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
  youtube_title: "55–75",
  youtube_desc: "1,800–2,500",
  facebook_desc: "600–1,200",
  linkedin_desc: "900–1,600",
  ig_tiktok_desc: "200–300",
};

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: content, isLoading, error } = useContent(id);
  const deleteContent = useDeleteContent();
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

  const handleVideoReplace = async (file: File) => {
    if (!id) return;
    setVideoUploading(true);
    setVideoProgress(20);

    const ext = file.name.split(".").pop();
    const storagePath = `content/${id}/video.${ext}`;

    try {
      await uploadVideoToR2(storagePath, file, (pct) => {
        setVideoProgress(20 + pct * 0.5);
      });
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

    queryClient.invalidateQueries({ queryKey: ["content", id] });
    setVideoProgress(100);
    setVideoUploading(false);
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

        {/* Video */}
        <VideoSection
          content={content}
          onReplace={handleVideoReplace}
          uploading={videoUploading}
          progress={videoProgress}
        />

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
