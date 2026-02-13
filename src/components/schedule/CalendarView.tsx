import { useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScheduleThumbnail } from "./ScheduleThumbnail";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { SocialContent } from "@/hooks/useContents";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CalendarViewProps {
  items: SocialContent[];
}

export function CalendarView({ items }: CalendarViewProps) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"monthly" | "weekly">("monthly");
  const [anchor, setAnchor] = useState(new Date());

  const rangeStart =
    viewMode === "monthly"
      ? startOfWeek(startOfMonth(anchor))
      : startOfWeek(anchor);

  const rangeEnd =
    viewMode === "monthly"
      ? endOfWeek(endOfMonth(anchor))
      : endOfWeek(anchor);

  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const goBack = () =>
    setAnchor((a) => (viewMode === "monthly" ? subMonths(a, 1) : subWeeks(a, 1)));
  const goForward = () =>
    setAnchor((a) => (viewMode === "monthly" ? addMonths(a, 1) : addWeeks(a, 1)));

  const getItemsForDay = (day: Date) =>
    items.filter((item) => {
      const sa = (item as any).scheduled_at;
      return sa && isSameDay(new Date(sa), day);
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[140px] text-center">
            {viewMode === "monthly"
              ? format(anchor, "MMMM yyyy")
              : `Week of ${format(rangeStart, "MMM d")}`}
          </span>
          <Button variant="ghost" size="icon" onClick={goForward}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as "monthly" | "weekly")}
          size="sm"
        >
          <ToggleGroupItem value="monthly">Month</ToggleGroupItem>
          <ToggleGroupItem value="weekly">Week</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-xs font-medium text-muted-foreground py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px rounded-lg border border-border overflow-hidden bg-border">
        {days.map((day) => {
          const dayItems = getItemsForDay(day);
          const isCurrentMonth = viewMode === "monthly" ? isSameMonth(day, anchor) : true;
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "bg-card p-1.5 min-h-[80px]",
                viewMode === "weekly" && "min-h-[120px]",
                !isCurrentMonth && "bg-muted/40"
              )}
            >
              <div
                className={cn(
                  "text-xs mb-1",
                  isToday
                    ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold"
                    : "text-muted-foreground"
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/content/${item.id}`)}
                    className="flex items-center gap-1 w-full rounded bg-accent px-1 py-0.5 text-left text-xs hover:bg-accent/80 transition-colors truncate"
                  >
                    <span className="truncate">{item.topic}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
