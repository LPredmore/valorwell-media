import { useState } from "react";
import { format } from "date-fns";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnscheduledContent, useScheduleContent, usePostNow } from "@/hooks/useSchedule";
import { ScheduleThumbnail } from "./ScheduleThumbnail";
import { ScheduleDialog } from "./ScheduleDialog";
import { toast } from "@/hooks/use-toast";
import type { SocialContent } from "@/hooks/useContents";

export function UnscheduledTab() {
  const { data: items, isLoading } = useUnscheduledContent();
  const scheduleMutation = useScheduleContent();
  const postNowMutation = usePostNow();
  const [selectedItem, setSelectedItem] = useState<SocialContent | null>(null);

  const handleConfirm = (scheduledAt: Date, playlistId: number | null) => {
    if (!selectedItem) return;

    // If scheduledAt is basically now (in the past or within 1 minute), post immediately
    const now = new Date();
    if (scheduledAt.getTime() <= now.getTime() + 60000) {
      postNowMutation.mutate(selectedItem.id, {
        onSuccess: () => {
          toast({ title: "Post published" });
          setSelectedItem(null);
        },
        onError: (err: any) => {
          toast({ title: "Failed to post", description: err.message, variant: "destructive" });
        },
      });
    } else {
      scheduleMutation.mutate(
        { id: selectedItem.id, scheduledAt, playlistId },
        {
          onSuccess: () => {
            toast({ title: "Post scheduled" });
            setSelectedItem(null);
          },
          onError: (err: any) => {
            toast({ title: "Failed to schedule", description: err.message, variant: "destructive" });
          },
        }
      );
    }
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
            <TableHead className="w-14">Image</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead className="w-40">Created On</TableHead>
            <TableHead className="w-28 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell><ScheduleThumbnail imagePath={item.image} /></TableCell>
              <TableCell className="font-medium">{item.topic}</TableCell>
              <TableCell className="text-muted-foreground">{format(new Date(item.created_at), "MMM d, yyyy")}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSelectedItem(item)}>
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Schedule
                </Button>
              </TableCell>
            </TableRow>
          ))}
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
