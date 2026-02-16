import { useState } from "react";
import { Check, Minus, ImageIcon, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIncompleteContent } from "@/hooks/useSchedule";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToR2 } from "@/lib/uploadVideo";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { SocialContent } from "@/hooks/useContents";

export function IncompleteTab() {
  const { data: items, isLoading } = useIncompleteContent();
  const queryClient = useQueryClient();
  const [editItem, setEditItem] = useState<SocialContent | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleMediaUpload = async (file: File, type: "video" | "image") => {
    if (!editItem) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const storagePath = type === "video"
      ? `content/${editItem.id}/video.${ext}`
      : `content/${editItem.id}/cover.${ext}`;

    try {
      await uploadVideoToR2(storagePath, file, () => {});
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const updateData: any = type === "video"
      ? { video_storage_path: storagePath, video_mime_type: file.type, video_original_filename: file.name }
      : { image: storagePath };

    await supabase.from("social_content").update(updateData).eq("id", editItem.id);

    // Re-fetch to check if both media are now present
    const { data: updated } = await supabase
      .from("social_content")
      .select("*")
      .eq("id", editItem.id)
      .single();

    if (updated && (updated as any).image && (updated as any).video_storage_path) {
      // Both media present — trigger generation
      await supabase.functions.invoke("generate-content", {
        body: { contentId: editItem.id },
      });
      toast({ title: "Media uploaded, generating content…" });
      setEditItem(null);
    } else {
      toast({ title: `${type === "video" ? "Video" : "Image"} uploaded` });
      // Update local editItem state
      if (updated) setEditItem(updated as unknown as SocialContent);
    }

    queryClient.invalidateQueries({ queryKey: ["schedule"] });
    setUploading(false);
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;

  if (!items?.length) {
    return <div className="py-8 text-center text-muted-foreground">No incomplete content.</div>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Topic</TableHead>
            <TableHead className="w-20 text-center hidden sm:table-cell">Image</TableHead>
            <TableHead className="w-20 text-center hidden sm:table-cell">Video</TableHead>
            <TableHead className="w-28 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">{item.topic}</TableCell>
              <TableCell className="text-center hidden sm:table-cell">
                {item.image ? <Check className="h-4 w-4 mx-auto text-success" /> : <Minus className="h-4 w-4 mx-auto text-muted-foreground" />}
              </TableCell>
              <TableCell className="text-center hidden sm:table-cell">
                {item.video_storage_path ? <Check className="h-4 w-4 mx-auto text-success" /> : <Minus className="h-4 w-4 mx-auto text-muted-foreground" />}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => setEditItem(item)}>
                  Upload Media
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription>Upload the missing image and/or video for "{editItem?.topic}"</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Image upload */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Cover Image
                {editItem?.image && <Check className="h-4 w-4 text-success" />}
              </p>
              {!editItem?.image && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Click to upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleMediaUpload(file, "image");
                    }}
                  />
                </label>
              )}
            </div>

            {/* Video upload */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium flex items-center gap-2">
                <Film className="h-4 w-4" /> Video
                {editItem?.video_storage_path && <Check className="h-4 w-4 text-success" />}
              </p>
              {!editItem?.video_storage_path && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Click to upload video"}
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleMediaUpload(file, "video");
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
