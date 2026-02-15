import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePlaylists } from "@/hooks/useSchedule";

// Preferred times in CST (UTC-6)
const SHORT_TIMES_CST = [
  { label: "11 AM", cstHour: 11 },
  { label: "1 PM", cstHour: 13 },
  { label: "6 PM", cstHour: 18 },
  { label: "8 PM", cstHour: 20 },
];
const LONG_TIMES_CST = [
  { label: "6 AM", cstHour: 6 },
  { label: "8 AM", cstHour: 8 },
];

/** Convert a CST hour to a local time string HH:mm */
function cstHourToLocalTime(cstHour: number): string {
  // CST = UTC-6. Create a date in UTC for today at cstHour + 6
  const now = new Date();
  const utc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), cstHour + 6, 0, 0);
  const local = new Date(utc);
  return `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}

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
  const [usePrefTimes, setUsePrefTimes] = useState(true);
  const [selectedPrefTime, setSelectedPrefTime] = useState<string>("");
  const [playlistId, setPlaylistId] = useState<number | null>(initialPlaylistId ?? null);
  const { data: playlists } = usePlaylists();

  const prefOptions = postLength === "Long" ? LONG_TIMES_CST : SHORT_TIMES_CST;

  const handleConfirm = () => {
    if (!date) return;

    // Determine the effective time string
    const effectiveTime = usePrefTimes && selectedPrefTime
      ? cstHourToLocalTime(Number(selectedPrefTime))
      : time;

    const [hours, minutes] = effectiveTime.split(":").map(Number);
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

  const canConfirm = date && (usePrefTimes ? !!selectedPrefTime : true);

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
            <div className="flex items-center justify-between">
              <Label className="font-medium">Time</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="pref-toggle" className="text-xs text-muted-foreground cursor-pointer">Pref Times</Label>
                <Switch
                  id="pref-toggle"
                  checked={usePrefTimes}
                  onCheckedChange={setUsePrefTimes}
                />
              </div>
            </div>
            {usePrefTimes ? (
              <ToggleGroup
                type="single"
                value={selectedPrefTime}
                onValueChange={(val) => { if (val) setSelectedPrefTime(val); }}
                className="flex flex-wrap gap-2 justify-start"
              >
                {prefOptions.map((opt) => (
                  <ToggleGroupItem
                    key={opt.cstHour}
                    value={String(opt.cstHour)}
                    variant="outline"
                    className="px-3 py-1.5 text-sm"
                  >
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            )}
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
          <Button onClick={handleConfirm} disabled={!canConfirm || loading}>
            {loading ? "Saving..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
