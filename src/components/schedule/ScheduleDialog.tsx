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

// Preferred times in America/Chicago (handles CST/CDT automatically)
const SHORT_TIMES_CHICAGO = [
  { label: "11 AM", chicagoHour: 11 },
  { label: "1 PM", chicagoHour: 13 },
  { label: "6 PM", chicagoHour: 18 },
  { label: "8 PM", chicagoHour: 20 },
];
const LONG_TIMES_CHICAGO = [
  { label: "6 AM", chicagoHour: 6 },
  { label: "8 AM", chicagoHour: 8 },
];

/** Convert a Chicago-time hour to a UTC Date for the given date */
function chicagoHourToUTC(date: Date, chicagoHour: number): Date {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(chicagoHour).padStart(2, "0");

  // Create a probe date to discover Chicago's actual UTC offset on that day
  const probe = new Date(`${year}-${month}-${day}T${hour}:00:00`);
  const chicagoStr = probe.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  const offsetMs = probe.getTime() - chicagoDate.getTime();

  // The real UTC time = Chicago wall-clock time + offset
  const utcMs = new Date(year, date.getMonth(), date.getDate(), chicagoHour, 0, 0).getTime() + offsetMs;
  return new Date(utcMs);
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

  const prefOptions = postLength === "Long" ? LONG_TIMES_CHICAGO : SHORT_TIMES_CHICAGO;

  const handleConfirm = () => {
    if (!date) return;

    let selectedAt: Date;
    if (usePrefTimes && selectedPrefTime) {
      // Convert Chicago wall-clock hour → UTC, DST-aware
      selectedAt = chicagoHourToUTC(date, Number(selectedPrefTime));
    } else {
      // Manual time input is in the user's local browser timezone
      const [hours, minutes] = time.split(":").map(Number);
      selectedAt = new Date(date);
      selectedAt.setHours(hours, minutes, 0, 0);
    }

    onConfirm(selectedAt, playlistId);
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
                {postLength === "Short" ? "Upload begins 2h before broadcast." : "Upload begins 6h before broadcast."}
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
                  disabled={(d) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const check = new Date(d);
                    check.setHours(0, 0, 0, 0);
                    return check.getTime() < today.getTime();
                  }}
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
