import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  ready: "bg-info text-info-foreground",
  processing: "bg-warning text-warning-foreground",
  completed: "bg-success text-success-foreground",
  error: "bg-destructive text-destructive-foreground",
};

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-0 font-semibold capitalize", STATUS_STYLES[status] || "")}>
      {status}
    </Badge>
  );
}
