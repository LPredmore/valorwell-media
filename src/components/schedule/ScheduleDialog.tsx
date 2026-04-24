import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { usePlaylists } from "@/hooks/useSchedule";
import {
  useUploadPostProfile,
  isPlatformConnected,
  ALL_PLATFORMS,
} from "@/hooks/useUploadPostProfile";
import { useYoutubeNativeConnection } from "@/hooks/useYoutubeNativeConnection";
import { PLATFORM_LABELS } from "@/lib/platforms";

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

function chicagoHourToUTC(date: Date, chicagoHour: number): Date {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(chicagoHour).padStart(2, "0");
  const probe = new Date(`${year}-${month}-${day}T${hour}:00:00`);
  const chicagoStr = probe.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  const offsetMs = probe.getTime() - chicagoDate.getTime();
  const utcMs = new Date(year, date.getMonth(), date.getDate(), chicagoHour, 0, 0).getTime() + offsetMs;
  return new Date(utcMs);
}

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    scheduledAt: Date,
    playlistId: number | null,
    platforms: string[],
    youtubeVia: string | null,
  ) => void;
  loading?: boolean;
  initialDate?: Date;
  initialTime?: string;
  initialPlaylistId?: number | null;
  initialPlatforms?: string[] | null;
  initialYoutubeVia?: string | null;
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
  initialPlatforms,
  initialYoutubeVia,
  postLength,
  title = "Schedule Post",
}: ScheduleDialogProps) {
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const [time, setTime] = useState(initialTime ?? "09:00");
  const [usePrefTimes, setUsePrefTimes] = useState(true);
  const [selectedPrefTime, setSelectedPrefTime] = useState<string>("");
  const [playlistId, setPlaylistId] = useState<number | null>(initialPlaylistId ?? null);
  const { data: playlists } = usePlaylists();
  const { data: profile, isLoading: profileLoading } = useUploadPostProfile();
  const { data: nativeYt } = useYoutubeNativeConnection();

  const uploadPostPlatforms = profile
    ? ALL_PLATFORMS.filter((p) => isPlatformConnected(profile.connected_platforms, p))
    : [];
  const youtubeFromUploadPost = uploadPostPlatforms.includes("youtube");
  const connectedPlatforms: string[] = nativeYt && !youtubeFromUploadPost
    ? [...uploadPostPlatforms, "youtube"]
    : uploadPostPlatforms;

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [useNativeYoutube, setUseNativeYoutube] = useState<boolean>(
    initialYoutubeVia === "native" || (!!nativeYt && !youtubeFromUploadPost),
  );

  // Default platform selection: existing scheduled_platforms (filtered to still-connected) or all connected
  useEffect(() => {
    if (!open) return;
    if (initialPlatforms && initialPlatforms.length) {
      setSelectedPlatforms(initialPlatforms.filter((p) => connectedPlatforms.includes(p)));
    } else {
      setSelectedPlatforms(connectedPlatforms);
    }
    setUseNativeYoutube(
      initialYoutubeVia === "native" || (!!nativeYt && !youtubeFromUploadPost),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.user_id, nativeYt?.user_id]);

  const togglePlatform = (p: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const prefOptions = postLength === "Long" ? LONG_TIMES_CHICAGO : SHORT_TIMES_CHICAGO;
  const youtubeSelected = selectedPlatforms.includes("youtube");
  const showNativeToggle = youtubeSelected && !!nativeYt;

  const handleConfirm = () => {
    if (!date) return;
    let selectedAt: Date;
    if (usePrefTimes && selectedPrefTime) {
      selectedAt = chicagoHourToUTC(date, Number(selectedPrefTime));
    } else {
      const [hours, minutes] = time.split(":").map(Number);
      selectedAt = new Date(date);
      selectedAt.setHours(hours, minutes, 0, 0);
    }
    const youtubeVia = showNativeToggle && useNativeYoutube ? "native" : null;
    onConfirm(selectedAt, playlistId, selectedPlatforms, youtubeVia);
  };

  const noConnections = !profileLoading && connectedPlatforms.length === 0;
  const canConfirm =
    date &&
    (usePrefTimes ? !!selectedPrefTime : true) &&
    selectedPlatforms.length > 0 &&
    !noConnections;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choose a date, time, and platforms.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {noConnections && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>No social accounts connected yet.</span>
                <Link to="/settings?tab=connections">
                  <Button size="sm" variant="outline">Connect</Button>
                </Link>
              </AlertDescription>
            </Alert>
          )}

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
                    key={opt.chicagoHour}
                    value={String(opt.chicagoHour)}
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

          <div className="space-y-2">
            <Label className="font-medium">Platforms</Label>
            {profileLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : connectedPlatforms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No connected platforms.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {connectedPlatforms.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedPlatforms.includes(p)}
                      onCheckedChange={() => togglePlatform(p)}
                    />
                    {PLATFORM_LABELS[p] ?? p}
                  </label>
                ))}
              </div>
            )}

            {showNativeToggle && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex flex-col">
                  <Label htmlFor="native-yt-toggle" className="text-sm font-medium cursor-pointer">
                    Post YouTube via Native (beta)
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {nativeYt?.channel_title
                      ? `Uploads directly to ${nativeYt.channel_title}`
                      : "Uploads directly via your Google account"}
                  </span>
                </div>
                <Switch
                  id="native-yt-toggle"
                  checked={useNativeYoutube}
                  onCheckedChange={setUseNativeYoutube}
                />
              </div>
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
