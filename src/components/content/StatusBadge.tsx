import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  incomplete: "bg-muted text-muted-foreground",
  unscheduled: "bg-success text-success-foreground",
  scheduled: "bg-info text-info-foreground",
  posted: "bg-primary text-primary-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-0 font-semibold capitalize", STATUS_STYLES[status] || "")}>
      {status}
    </Badge>
  );
}
