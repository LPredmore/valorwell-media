import { useState } from "react";
import { format } from "date-fns";
import { Pencil, TableIcon, CalendarDays, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useScheduledContent, useUpdateSchedule } from "@/hooks/useSchedule";
import { usePublishYouTube } from "@/hooks/usePublishYouTube";
import { ScheduleThumbnail } from "./ScheduleThumbnail";
import { ScheduleDialog } from "./ScheduleDialog";
import { CalendarView } from "./CalendarView";
import { toast } from "@/hooks/use-toast";
import type { SocialContent } from "@/hooks/useContents";

export function ScheduledTab() {
  const { data: items, isLoading } = useScheduledContent();
  const updateMutation = useUpdateSchedule();
  const publishMutation = usePublishYouTube();
  const [view, setView] = useState<"table" | "calendar">("table");
  const [editItem, setEditItem] = useState<SocialContent | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const handlePublish = (id: string) => {
    setPublishingId(id);
    publishMutation.mutate(id, {
      onSuccess: (data) => {
        toast({ title: "Posted to YouTube", description: `Video: ${data.url}` });
        setPublishingId(null);
      },
      onError: (err: any) => {
        toast({ title: "YouTube upload failed", description: err.message, variant: "destructive" });
        setPublishingId(null);
      },
    });
  };

  const handleUpdate = (scheduledAt: Date, platforms: string[]) => {
    if (!editItem) return;
    updateMutation.mutate(
      { id: editItem.id, scheduledAt, platforms },
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
              <TableHead className="w-24 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell><ScheduleThumbnail imagePath={item.image} /></TableCell>
                <TableCell className="font-medium">{item.topic}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(item as any).scheduled_at
                    ? format(new Date((item as any).scheduled_at), "MMM d, yyyy h:mm a")
                    : "—"}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handlePublish(item.id)}
                    disabled={publishingId === item.id || !item.video_storage_path}
                    title="Post to YouTube"
                  >
                    {publishingId === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                  </Button>
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
          initialDate={(editItem as any).scheduled_at ? new Date((editItem as any).scheduled_at) : undefined}
          initialTime={
            (editItem as any).scheduled_at
              ? format(new Date((editItem as any).scheduled_at), "HH:mm")
              : undefined
          }
          initialPlatforms={(editItem as any).scheduled_platforms ?? []}
        />
      )}
    </>
  );
}
