import { useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Pencil, TableIcon, CalendarDays, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useScheduledContent, useUpdateSchedule } from "@/hooks/useSchedule";
import { useDeleteContent } from "@/hooks/useContents";
import { ScheduleThumbnail } from "./ScheduleThumbnail";
import { ScheduleDialog } from "./ScheduleDialog";
import { CalendarView } from "./CalendarView";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { SocialContent } from "@/hooks/useContents";

function YtBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const colors: Record<string, string> = {
    queued: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    uploading: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    scheduled: "bg-green-500/15 text-green-700 border-green-500/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={`text-xs ${colors[status] ?? ""}`}>{status}</Badge>;
}

export function ScheduledTab({ postLength }: { postLength?: "Long" | "Short" }) {
  const { data: items, isLoading } = useScheduledContent(postLength);
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteContent();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"table" | "calendar">("table");
  const [editItem, setEditItem] = useState<SocialContent | null>(null);

  const handleUpdate = (scheduledAt: Date, playlistId: number | null) => {
    if (!editItem) return;
    updateMutation.mutate(
      { id: editItem.id, scheduledAt, playlistId },
      {
        onSuccess: () => { toast({ title: "Schedule updated" }); setEditItem(null); },
        onError: (err: any) => { toast({ title: "Failed to update", description: err.message, variant: "destructive" }); },
      }
    );
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
    return <div className="py-8 text-center text-muted-foreground">No scheduled content yet.</div>;
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "table" | "calendar")} size="sm">
          <ToggleGroupItem value="table" className="gap-1.5"><TableIcon className="h-3.5 w-3.5" />Table</ToggleGroupItem>
          <ToggleGroupItem value="calendar" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Calendar</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "calendar" ? (
        <CalendarView items={items} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 hidden sm:table-cell">Image</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead className="w-44">Scheduled Date</TableHead>
              <TableHead className="w-24 hidden sm:table-cell">YouTube</TableHead>
              <TableHead className="w-24 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="hidden sm:table-cell"><ScheduleThumbnail imagePath={item.image} /></TableCell>
                <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">{item.post_title || item.topic}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.scheduled_at ? format(new Date(item.scheduled_at), "MMM d, yyyy h:mm a") : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell"><YtBadge status={item.youtube_status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditItem(item)}>
                      <Pencil className="h-3.5 w-3.5" />
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
            ))}
          </TableBody>
        </Table>
      )}

      {editItem && (
        <ScheduleDialog
          open={!!editItem}
          onOpenChange={(open) => !open && setEditItem(null)}
          onConfirm={handleUpdate}
          loading={updateMutation.isPending}
          title="Edit Schedule"
          initialDate={editItem.scheduled_at ? new Date(editItem.scheduled_at) : undefined}
          initialTime={editItem.scheduled_at ? format(new Date(editItem.scheduled_at), "HH:mm") : undefined}
          initialPlaylistId={(editItem as any).playlist_id ?? null}
          postLength={editItem.post_length}
        />
      )}
    </>
  );
}
