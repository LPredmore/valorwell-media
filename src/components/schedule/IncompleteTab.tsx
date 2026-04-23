import { useState } from "react";
import { Check, Minus, ImageIcon, Film, Loader2, Pencil, Trash2, Upload, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIncompleteContent } from "@/hooks/useSchedule";
import { useDeleteContent } from "@/hooks/useContents";
import { supabase } from "@/integrations/supabase/client";
import { uploadVideoToR2 } from "@/lib/uploadVideo";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import type { SocialContent } from "@/hooks/useContents";
import { ContentCsvUpload } from "./ContentCsvUpload";

export function IncompleteTab({ postLength }: { postLength?: "Long" | "Short" }) {
  const { data: items, isLoading } = useIncompleteContent(postLength);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deleteMutation = useDeleteContent();
  const [editItem, setEditItem] = useState<SocialContent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
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

    toast({ title: `${type === "video" ? "Video" : "Image"} uploaded` });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
    setEditItem(null);
    setUploading(false);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Content deleted" });
        queryClient.invalidateQueries({ queryKey: ["schedule"] });
      },
      onError: (err: any) => {
        toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      },
    });
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;

  if (!items?.length) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <ContentCsvUpload />
        </div>
        <div className="py-8 text-center text-muted-foreground">All caught up — nothing waiting on you right now.</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <ContentCsvUpload />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Topic</TableHead>
            {postLength !== "Short" && <TableHead className="w-20 text-center hidden sm:table-cell">Image</TableHead>}
            <TableHead className="w-20 text-center hidden sm:table-cell">Video</TableHead>
            <TableHead className="w-32 hidden sm:table-cell">Planned Date</TableHead>
            <TableHead className="w-14 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">{item.post_title || item.topic}</TableCell>
              {postLength !== "Short" && (
                <TableCell className="text-center hidden sm:table-cell">
                  {item.image ? <Check className="h-4 w-4 mx-auto text-success" /> : <Minus className="h-4 w-4 mx-auto text-muted-foreground" />}
                </TableCell>
              )}
              <TableCell className="text-center hidden sm:table-cell">
                {item.video_storage_path ? <Check className="h-4 w-4 mx-auto text-success" /> : <Minus className="h-4 w-4 mx-auto text-muted-foreground" />}
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {(item as any).planned_date ? format(new Date((item as any).planned_date), "MMM d, yyyy") : "—"}
              </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/content/${item.id}`)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      {(!item.image || !item.video_storage_path) && (
                        <DropdownMenuItem onClick={() => setEditItem(item)}>
                          <Upload className="h-4 w-4 mr-2" /> Upload Media
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(item.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription className="truncate max-w-full overflow-hidden">Upload media for "{editItem?.topic}"</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {editItem?.post_length !== "Short" && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Cover Image
                  {editItem?.image && <Check className="h-4 w-4 text-success" />}
                </p>
                {!editItem?.image && (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Click to upload image"}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleMediaUpload(file, "image"); }} />
                  </label>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-sm font-medium flex items-center gap-2">
                <Film className="h-4 w-4" /> Video
                {editItem?.video_storage_path && <Check className="h-4 w-4 text-success" />}
              </p>
              {!editItem?.video_storage_path && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition-colors">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Click to upload video"}
                  <input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleMediaUpload(file, "video"); }} />
                </label>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete content?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
