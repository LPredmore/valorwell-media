import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { Link } from "react-router-dom";
import { IncompleteTab } from "@/components/schedule/IncompleteTab";
import { UnscheduledTab } from "@/components/schedule/UnscheduledTab";
import { ScheduledTab } from "@/components/schedule/ScheduledTab";
import { PastTab } from "@/components/schedule/PastTab";
import { useYouTubeConnection } from "@/hooks/useYouTubeConnection";

const DISMISS_KEY = "yt-connect-banner-dismissed";

export default function Schedule() {
  const [lengthFilter, setLengthFilter] = useState<"Long" | "Short">("Long");
  const { isConnected, isLoading: ytLoading } = useYouTubeConnection();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const showBanner = !ytLoading && !isConnected && !dismissed;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Content</h1>

        {showBanner && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Connect your YouTube account to start posting.</span>
              <div className="flex items-center gap-2">
                <Link to="/connections">
                  <Button size="sm">Connect</Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </Button>
              </div>
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
    </AppLayout>
  );
}
