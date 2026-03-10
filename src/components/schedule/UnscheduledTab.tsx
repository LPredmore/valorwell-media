import { useState } from "react";
import { format } from "date-fns";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useUnscheduledContent, useScheduleContent, usePostNow } from "@/hooks/useSchedule";
import { useDeleteContent } from "@/hooks/useContents";
import { ScheduleThumbnail } from "./ScheduleThumbnail";
import { ScheduleDialog } from "./ScheduleDialog";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { SocialContent } from "@/hooks/useContents";

function validateForScheduling(item: SocialContent): string[] {
  const missing: string[] = [];
  if (!item.video_storage_path) missing.push("Video");
  if (item.post_length === "Long" && !item.image?.trim()) missing.push("Cover Image");
  if (!item.post_title?.trim()) missing.push("Post Title");
  if (item.post_length !== "Short" && item.post_length !== "Long") missing.push("Post Length (Short or Long)");
  return missing;
}

export function UnscheduledTab({ postLength }: { postLength?: "Long" | "Short" }) {
  const { data: items, isLoading } = useUnscheduledContent(postLength);
  const scheduleMutation = useScheduleContent();
  const postNowMutation = usePostNow();
  const deleteMutation = useDeleteContent();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<SocialContent | null>(null);

  const handleScheduleClick = (item: SocialContent) => {
    const missing = validateForScheduling(item);
    if (missing.length > 0) {
      toast({ title: "Cannot schedule — missing fields", description: missing.join(", "), variant: "destructive" });
      return;
    }
    setSelectedItem(item);
  };

  const handleConfirm = (scheduledAt: Date, playlistId: number | null) => {
    if (!selectedItem) return;

    const now = new Date();
    if (scheduledAt.getTime() <= now.getTime() + 60000) {
      postNowMutation.mutate({ contentId: selectedItem.id, playlistId }, {
        onSuccess: () => { toast({ title: "Post queued for immediate upload" }); setSelectedItem(null); },
        onError: (err: any) => { toast({ title: "Failed to post", description: err.message, variant: "destructive" }); },
      });
    } else {
      scheduleMutation.mutate({ id: selectedItem.id, scheduledAt, playlistId }, {
        onSuccess: () => { toast({ title: "Post scheduled" }); setSelectedItem(null); },
        onError: (err: any) => { toast({ title: "Failed to schedule", description: err.message, variant: "destructive" }); },
      });
    }
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
    return <div className="py-8 text-center text-muted-foreground">No unscheduled content. Generate content first.</div>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 hidden sm:table-cell">Image</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead className="w-40 hidden sm:table-cell">Planned Date</TableHead>
            <TableHead className="w-36 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const dateToShow = (item as any).planned_date || item.created_at;
            return (
              <TableRow key={item.id}>
                <TableCell className="hidden sm:table-cell"><ScheduleThumbnail imagePath={item.image} /></TableCell>
                <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">{item.post_title || item.topic}</TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {format(new Date(dateToShow), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleScheduleClick(item)}>
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Schedule
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete content?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(item.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ScheduleDialog
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        onConfirm={handleConfirm}
        loading={scheduleMutation.isPending || postNowMutation.isPending}
        postLength={selectedItem?.post_length}
      />
    </>
  );
}
