import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { VideoUploader } from "@/components/jobs/VideoUploader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function CreateJob() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<"short" | "long">("short");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !videoFile || !topic.trim()) return;

    setUploading(true);
    setProgress(10);

    // 1. Create job
    const { data: job, error: jobError } = await supabase
      .from("content_jobs")
      .insert({ topic: topic.trim(), format, user_id: user.id, status: "new" })
      .select()
      .single();

    if (jobError || !job) {
      toast({ title: "Failed to create job", description: jobError?.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    setProgress(30);

    // 2. Upload video
    const ext = videoFile.name.split(".").pop();
    const storagePath = `jobs/${job.id}/video.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("content-media")
      .upload(storagePath, videoFile, { upsert: true });

    if (uploadError) {
      toast({ title: "Video upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    setProgress(80);

    // 3. Update job with video info
    const { error: updateError } = await supabase
      .from("content_jobs")
      .update({
        video_storage_path: storagePath,
        video_mime_type: videoFile.type,
        video_original_filename: videoFile.name,
        status: "ready",
      })
      .eq("id", job.id);

    if (updateError) {
      toast({ title: "Failed to update job", description: updateError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    setProgress(100);
    navigate(`/jobs/${job.id}`);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/jobs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">Create Job</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="topic" className="font-medium">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. How to start a business"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="font-medium">Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as "short" | "long")} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="short" id="short" />
                <Label htmlFor="short" className="cursor-pointer">Short</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="long" id="long" />
                <Label htmlFor="long" className="cursor-pointer">Long</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label className="font-medium">Video</Label>
            <VideoUploader
              onFileSelected={setVideoFile}
              uploading={uploading}
              progress={progress}
              currentFilename={videoFile?.name}
            />
          </div>

          <Button type="submit" className="w-full" disabled={uploading || !videoFile || !topic.trim()}>
            {uploading ? "Creating..." : "Create Job"}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
