import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { IncompleteTab } from "@/components/schedule/IncompleteTab";
import { UnscheduledTab } from "@/components/schedule/UnscheduledTab";
import { ScheduledTab } from "@/components/schedule/ScheduledTab";
import { PastTab } from "@/components/schedule/PastTab";
import { useUploadPostProfile, isPlatformConnected, ALL_PLATFORMS } from "@/hooks/useUploadPostProfile";

export function ScheduleView() {
  const [lengthFilter, setLengthFilter] = useState<"Long" | "Short">("Long");
  const { data: profile, isLoading } = useUploadPostProfile();

  const status = profile?.provisioning_status ?? "pending";
  const connectedCount = profile
    ? ALL_PLATFORMS.filter((p) => isPlatformConnected(profile.connected_platforms, p)).length
    : 0;

  const showProvisioning = !isLoading && status !== "ready";
  const showNoConnections = !isLoading && status === "ready" && connectedCount === 0;

  return (
    <div className="space-y-6">
      {showProvisioning && (
        <Alert>
          {status === "pending" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {status === "pending"
                ? "I'm finishing your workspace setup — almost ready."
                : "Workspace setup needs attention."}
            </span>
            <Link to="/settings?tab=connections">
              <Button size="sm" variant="outline">Open Connections</Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {showNoConnections && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Connect at least one social account so I can start publishing for you.</span>
            <Link to="/settings?tab=connections">
              <Button size="sm">Connect</Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={lengthFilter} onValueChange={(v) => setLengthFilter(v as "Long" | "Short")}>
        <TabsList>
          <TabsTrigger value="Long">Long</TabsTrigger>
          <TabsTrigger value="Short">Short</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs defaultValue="incomplete">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="incomplete">Incomplete</TabsTrigger>
          <TabsTrigger value="unscheduled">Unscheduled</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="incomplete">
          <IncompleteTab postLength={lengthFilter} />
        </TabsContent>
        <TabsContent value="unscheduled">
          <UnscheduledTab postLength={lengthFilter} />
        </TabsContent>
        <TabsContent value="scheduled">
          <ScheduledTab postLength={lengthFilter} />
        </TabsContent>
        <TabsContent value="past">
          <PastTab postLength={lengthFilter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
