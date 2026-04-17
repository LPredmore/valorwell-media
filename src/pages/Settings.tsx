import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileView } from "@/components/settings/ProfileView";
import { InstructionsView } from "@/components/settings/InstructionsView";
import { ConnectionsView } from "@/components/settings/ConnectionsView";

const VALID_TABS = ["profile", "instructions", "connections"] as const;
type TabValue = typeof VALID_TABS[number];

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam || "")
    ? (tabParam as TabValue)
    : "profile";

  const handleTabChange = (value: string) => {
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
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileView />
          </TabsContent>
          <TabsContent value="instructions" className="mt-6">
            <InstructionsView />
          </TabsContent>
          <TabsContent value="connections" className="mt-6">
            <ConnectionsView />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
