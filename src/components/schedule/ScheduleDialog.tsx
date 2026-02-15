import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlaylists } from "@/hooks/useSchedule";

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scheduledAt: Date, playlistId: number | null) => void;
  loading?: boolean;
  initialDate?: Date;
  initialTime?: string;
  initialPlaylistId?: number | null;
  postLength?: string | null;
  title?: string;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
  initialDate,
  initialTime,
  initialPlaylistId,
  postLength,
  title = "Schedule Post",
}: ScheduleDialogProps) {
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const [time, setTime] = useState(initialTime ?? "09:00");
  const [playlistId, setPlaylistId] = useState<number | null>(initialPlaylistId ?? null);
  const { data: playlists } = usePlaylists();

  const handleConfirm = () => {
    if (!date) return;
    const [hours, minutes] = time.split(":").map(Number);
    const selectedAt = new Date(date);
    selectedAt.setHours(hours, minutes, 0, 0);

    // Apply time offset based on post length
    let offsetHours = 0;
    if (postLength === "Short") offsetHours = 2;
    else if (postLength === "Long") offsetHours = 6;

    const actualScheduledAt = new Date(selectedAt.getTime() - offsetHours * 60 * 60 * 1000);

    // If the adjusted time is in the past, use now
    const now = new Date();
    const finalTime = actualScheduledAt <= now ? now : actualScheduledAt;

    onConfirm(finalTime, playlistId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose a date and time.
            {postLength && (
              <span className="block text-xs mt-1">
                {postLength === "Short" ? "Short content schedules 2h early." : "Long content schedules 6h early."}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="font-medium">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="font-medium">Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="font-medium">Playlist <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Select
              value={playlistId?.toString() ?? "none"}
              onValueChange={(val) => setPlaylistId(val === "none" ? null : Number(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a playlist" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No playlist</SelectItem>
                {playlists?.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.playlist_title || `Playlist ${p.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!date || loading}>
            {loading ? "Saving..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
