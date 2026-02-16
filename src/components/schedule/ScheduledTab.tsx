import { useState } from "react";
import { format } from "date-fns";
import { Pencil, TableIcon, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useScheduledContent, useUpdateSchedule } from "@/hooks/useSchedule";
import { ScheduleThumbnail } from "./ScheduleThumbnail";
import { ScheduleDialog } from "./ScheduleDialog";
import { CalendarView } from "./CalendarView";
import { toast } from "@/hooks/use-toast";
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

export function ScheduledTab() {
  const { data: items, isLoading } = useScheduledContent();
  const updateMutation = useUpdateSchedule();
  const [view, setView] = useState<"table" | "calendar">("table");
  const [editItem, setEditItem] = useState<SocialContent | null>(null);

  const handleUpdate = (scheduledAt: Date, playlistId: number | null) => {
    if (!editItem) return;
    updateMutation.mutate(
      { id: editItem.id, scheduledAt, playlistId },
      {
        onSuccess: () => {
          toast({ title: "Schedule updated" });
          setEditItem(null);
        },
        onError: (err: any) => {
          toast({ title: "Failed to update", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading…</div>;

  if (!items?.length) {
    return <div className="py-8 text-center text-muted-foreground">No scheduled content yet.</div>;
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as "table" | "calendar")}
          size="sm"
        >
          <ToggleGroupItem value="table" className="gap-1.5">
            <TableIcon className="h-3.5 w-3.5" />
            Table
          </ToggleGroupItem>
          <ToggleGroupItem value="calendar" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "calendar" ? (
        <CalendarView items={items} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Image</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead className="w-44">Scheduled Date</TableHead>
              <TableHead className="w-24">YouTube</TableHead>
              <TableHead className="w-16 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell><ScheduleThumbnail imagePath={item.image} /></TableCell>
                <TableCell className="font-medium">{item.topic}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.scheduled_at
                    ? format(new Date(item.scheduled_at), "MMM d, yyyy h:mm a")
                    : "—"}
                </TableCell>
                <TableCell><YtBadge status={item.youtube_status} /></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditItem(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
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
          initialTime={
            editItem.scheduled_at
              ? format(new Date(editItem.scheduled_at), "HH:mm")
              : undefined
          }
          initialPlaylistId={(editItem as any).playlist_id ?? null}
          postLength={editItem.post_length}
        />
      )}
    </>
  );
}
