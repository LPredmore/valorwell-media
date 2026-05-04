import { useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Pencil, TableIcon, CalendarDays, Trash2, MoreHorizontal, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useScheduledContent, useUpdateSchedule, useRetryYoutubeNative } from "@/hooks/useSchedule";
import { useDeleteContent } from "@/hooks/useContents";
import { ScheduleThumbnail } from "./ScheduleThumbnail";
import { ScheduleDialog } from "./ScheduleDialog";
import { CalendarView } from "./CalendarView";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { SocialContent } from "@/hooks/useContents";

function PostStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const colors: Record<string, string> = {
    pending: "bg-muted text-muted-foreground border-border",
    uploading: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    success: "bg-green-500/15 text-green-700 border-green-500/30",
    partial: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={`text-xs ${colors[status] ?? ""}`}>{status}</Badge>;
}

export function ScheduledTab({ postLength }: { postLength?: "Long" | "Short" }) {
  const { data: items, isLoading } = useScheduledContent(postLength);
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteContent();
  const retryYoutubeNative = useRetryYoutubeNative();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<"table" | "calendar">("table");
  const [editItem, setEditItem] = useState<SocialContent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleUpdate = (
    scheduledAt: Date,
    playlistId: number | null,
    platforms: string[],
    youtubeVia: string | null,
  ) => {
    if (!editItem) return;
    updateMutation.mutate(
      { id: editItem.id, scheduledAt, playlistId, platforms, youtubeVia },
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
    return <div className="py-8 text-center text-muted-foreground">Nothing on the calendar yet — schedule a post and I'll take it from there.</div>;
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
              <TableHead className="w-28 hidden sm:table-cell">Status</TableHead>
              <TableHead className="w-14 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const ytStatus = (item as any).youtube_native_status as string | null;
              const ytErr = (item as any).youtube_native_error_detail as string | null;
              const ytNative = (item as any).youtube_via === "native";
              const reconnectNeeded =
                ytStatus === "failed" &&
                (ytErr ?? "").toLowerCase().includes("reconnect");
              const displayStatus = ytNative ? (ytStatus ?? item.upload_post_status) : item.upload_post_status;
              return (
                <TableRow key={item.id}>
                  <TableCell className="hidden sm:table-cell"><ScheduleThumbnail imagePath={item.image} /></TableCell>
                  <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">
                    {item.post_title || item.topic}
                    {reconnectNeeded && (
                      <div className="text-xs text-destructive mt-0.5 truncate">
                        Reconnect YouTube, then retry
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.scheduled_at ? format(new Date(item.scheduled_at), "MMM d, yyyy h:mm a") : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><PostStatusBadge status={displayStatus} /></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/content/${item.id}`)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditItem(item)}>
                          <CalendarDays className="h-4 w-4 mr-2" /> Reschedule
                        </DropdownMenuItem>
                        {ytStatus === "failed" && (
                          <DropdownMenuItem
                            onClick={() => {
                              retryYoutubeNative.mutate(item.id, {
                                onSuccess: () => toast({ title: "Retry queued" }),
                                onError: (err: any) =>
                                  toast({ title: "Retry failed", description: err.message, variant: "destructive" }),
                              });
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" /> Retry YouTube
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(item.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
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
          initialPlatforms={editItem.scheduled_platforms ?? null}
          initialYoutubeVia={(editItem as any)?.youtube_via ?? null}
          postLength={editItem.post_length}
        />
      )}

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
