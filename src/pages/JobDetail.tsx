import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useJob } from "@/hooks/useJob";
import { useDeleteJob } from "@/hooks/useJobs";
import { useAutosave } from "@/hooks/useAutosave";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { VideoSection } from "@/components/jobs/VideoSection";
import { ImagesSection } from "@/components/jobs/ImagesSection";
import { PlatformOutputsEditor } from "@/components/jobs/PlatformOutputsEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToR2 } from "@/lib/uploadVideo";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
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

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { job, outputs, isLoading, error } = useJob(id);
  const deleteJob = useDeleteJob();
  const [topic, setTopic] = useState("");
  const [topicInitialized, setTopicInitialized] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  // Initialize topic when job loads
  if (job && !topicInitialized) {
    setTopic(job.topic);
    setTopicInitialized(true);
  }

  const saveTopicFn = useCallback(
    async (newTopic: string) => {
      if (!id) return;
      const { error } = await supabase.from("content_jobs").update({ topic: newTopic }).eq("id", id);
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
    const storagePath = `jobs/${id}/video.${ext}`;

    try {
      await uploadVideoToR2(storagePath, file, (pct) => {
        setVideoProgress(20 + pct * 0.5);
      });
    } catch (uploadError: any) {
      toast({ title: "Upload failed", description: uploadError?.message, variant: "destructive" });
      setVideoUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("content_jobs")
      .update({
        video_storage_path: storagePath,
        video_mime_type: file.type,
        video_original_filename: file.name,
      })
      .eq("id", id);

    if (updateError) {
      toast({ title: "Update failed", description: updateError.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    }
    setVideoProgress(100);
    setVideoUploading(false);
  };

  const handleDelete = () => {
    if (!id) return;
    deleteJob.mutate(id, { onSuccess: () => navigate("/jobs") });
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

  if (error || !job) {
    return (
      <AppLayout>
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">Job not found</p>
          <Link to="/jobs">
            <Button variant="link" className="mt-2">Back to Jobs</Button>
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
            <Link to="/jobs">
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
            <Badge variant="outline" className="capitalize">{job.format}</Badge>
            <JobStatusBadge status={job.status} />
            <span className="text-sm text-muted-foreground">
              Created {format(new Date(job.created_at), "MMM d, yyyy")}
            </span>
            <div className="flex-1" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this job?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the job, all platform outputs, and uploaded files.
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
        </div>

        {/* Video */}
        <VideoSection
          job={job}
          onReplace={handleVideoReplace}
          uploading={videoUploading}
          progress={videoProgress}
        />

        {/* Images */}
        <ImagesSection job={job} />

        {/* Platform Outputs */}
        {outputs && outputs.length > 0 && (
          <PlatformOutputsEditor outputs={outputs} format={job.format} />
        )}
      </div>
    </AppLayout>
  );
}
