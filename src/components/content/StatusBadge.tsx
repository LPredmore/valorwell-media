import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  uploading: "bg-info text-info-foreground",
  ready: "bg-info text-info-foreground",
  generating: "bg-warning text-warning-foreground",
  complete: "bg-success text-success-foreground",
  error: "bg-destructive text-destructive-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-0 font-semibold capitalize", STATUS_STYLES[status] || "")}>
      {status}
    </Badge>
  );
}
