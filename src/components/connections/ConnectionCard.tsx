import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

interface ConnectionCardProps {
  icon: LucideIcon;
  iconClassName?: string;
  title: string;
  description: string;
  status: "connected" | "available" | "coming-soon";
  children?: React.ReactNode;
}

export function ConnectionCard({
  icon: Icon,
  iconClassName,
  title,
  description,
  status,
  children,
}: ConnectionCardProps) {
  return (
    <Card className={status === "coming-soon" ? "opacity-70" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={iconClassName ?? "h-6 w-6 text-muted-foreground"} />
            <div className="min-w-0">
              <CardTitle className="truncate">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {status === "coming-soon" && (
            <Badge variant="secondary" className="shrink-0">
              Coming soon
            </Badge>
          )}
          {status === "connected" && (
            <Badge variant="secondary" className="shrink-0">
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}
