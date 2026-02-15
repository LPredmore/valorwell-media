import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VideoUploader } from "@/components/jobs/VideoUploader";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToR2 } from "@/lib/uploadVideo";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ImageIcon, X } from "lucide-react";
import { Link } from "react-router-dom";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function CreateContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [postLength, setPostLength] = useState<"Short" | "Long" | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Cleanup object URL on unmount or when imageFile changes
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageSelect = (file: File) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleImageRemove = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !videoFile || !topic.trim()) return;

    setUploading(true);
    setProgress(5);

    // 1. Create content row
    const { data: content, error: insertError } = await supabase
      .from("social_content")
      .insert({ topic: topic.trim(), user_id: user.id, status: "uploading", post_length: postLength } as any)
      .select()
      .single();

    if (insertError || !content) {
      toast({ title: "Failed to create content", description: insertError?.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const contentId = (content as any).id as string;
    setProgress(10);

    // 2. Upload video to R2
    const videoExt = videoFile.name.split(".").pop();
    const videoStoragePath = `content/${contentId}/video.${videoExt}`;

    try {
      await uploadVideoToR2(videoStoragePath, videoFile, (pct) => {
        setProgress(10 + pct * 0.4);
      });
    } catch (uploadError: any) {
      toast({ title: "Video upload failed", description: uploadError?.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    setProgress(55);

    // 3. Upload cover image to R2 (if provided)
    let imageStoragePath: string | null = null;
    if (imageFile) {
      const imgExt = imageFile.name.split(".").pop();
      imageStoragePath = `content/${contentId}/cover.${imgExt}`;
      try {
        await uploadVideoToR2(imageStoragePath, imageFile, (pct) => {
          setProgress(55 + pct * 0.1);
        });
      } catch (uploadError: any) {
        toast({ title: "Image upload failed", description: uploadError?.message, variant: "destructive" });
        setUploading(false);
        return;
      }
    }

    setProgress(65);

    // 4. Update with video/image info and set status to ready
    await supabase
      .from("social_content")
      .update({
        video_storage_path: videoStoragePath,
        video_mime_type: videoFile.type,
        video_original_filename: videoFile.name,
        status: "ready",
        ...(imageStoragePath ? { image: imageStoragePath } : {}),
      } as any)
      .eq("id", contentId);

    setProgress(70);

    // 5. Call generate-content edge function
    const { error: genError } = await supabase.functions.invoke("generate-content", {
      body: { contentId },
    });

    if (genError) {
      toast({ title: "Generation failed", description: genError.message, variant: "destructive" });
    }

    setProgress(100);
    navigate(`/content/${contentId}`);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/content">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">New Content</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="topic" className="font-medium">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. CHAMPVA telehealth access for military spouses"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-medium">Video Length</Label>
            <RadioGroup
              value={postLength ?? ""}
              onValueChange={(val) => setPostLength(val as "Short" | "Long")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Short" id="short" />
                <Label htmlFor="short" className="cursor-pointer">Short <span className="text-muted-foreground text-sm">(Reels, TikTok, Shorts)</span></Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Long" id="long" />
                <Label htmlFor="long" className="cursor-pointer">Long <span className="text-muted-foreground text-sm">(YouTube, Facebook)</span></Label>
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

          <div className="space-y-1.5">
            <Label className="font-medium">Cover Image <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            {imagePreview ? (
              <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                <img src={imagePreview} alt="Cover preview" className="w-full h-48 object-cover" />
                <button
                  type="button"
                  onClick={handleImageRemove}
                  className="absolute top-2 right-2 rounded-full bg-background/80 p-1.5 text-foreground hover:bg-background transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50">
                <ImageIcon className="h-8 w-8" />
                <span>Click to upload a cover image</span>
                <span className="text-xs">PNG, JPG, or WebP</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageSelect(file);
                  }}
                />
              </label>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={uploading || !videoFile || !topic.trim() || !postLength}>
            {uploading ? "Creating & Generating..." : "Create & Generate"}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
