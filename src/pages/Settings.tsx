import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRegistrationStatus } from "@/hooks/useRegistrationStatus";
import { ProfileView } from "@/components/settings/ProfileView";
import { AboutView } from "@/components/settings/AboutView";
import { InstructionsView } from "@/components/settings/InstructionsView";
import { ConnectionsView } from "@/components/settings/ConnectionsView";
import { BillingView } from "@/components/settings/BillingView";

const VALID_TABS = ["profile", "about", "instructions", "connections", "billing"] as const;
type TabValue = typeof VALID_TABS[number];

export default function Settings() {
  const { signOut } = useAuth();
  const { status } = useRegistrationStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");

  const billingOnly = status === "needs_subscription";

  const activeTab: TabValue = billingOnly
    ? "billing"
    : (VALID_TABS as readonly string[]).includes(tabParam || "")
    ? (tabParam as TabValue)
    : "profile";

  // Force ?tab=billing in URL when in billing-only mode
  useEffect(() => {
    if (billingOnly && tabParam !== "billing") {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "billing");
      setSearchParams(next, { replace: true });
    }
  }, [billingOnly, tabParam, searchParams, setSearchParams]);

  const handleTabChange = (value: string) => {
    if (billingOnly) return; // locked to billing
    const next = new URLSearchParams(searchParams);
    if (value === "profile") {
      next.delete("tab");
    } else {
      next.set("tab", value);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
          <Button
            variant="outline"
            onClick={signOut}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>

        {billingOnly && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">
                Your subscription is paused.
              </p>
              <p className="mt-1 text-muted-foreground">
                Restart it below to get back to posting.
              </p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {!billingOnly && (
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="instructions">Instructions</TabsTrigger>
              <TabsTrigger value="connections">Connections</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
            </TabsList>
          )}

          {!billingOnly && (
            <>
              <TabsContent value="profile" className="mt-6">
                <ProfileView />
              </TabsContent>
              <TabsContent value="about" className="mt-6">
                <AboutView />
              </TabsContent>
              <TabsContent value="instructions" className="mt-6">
                <InstructionsView />
              </TabsContent>
              <TabsContent value="connections" className="mt-6">
                <ConnectionsView />
              </TabsContent>
            </>
          )}
          <TabsContent value="billing" className={billingOnly ? "" : "mt-6"}>
            <BillingView />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
