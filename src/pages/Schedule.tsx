import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { IdeasView } from "@/components/ideas/IdeasView";

const VALID_TABS = ["content", "ideas"] as const;
type TabValue = typeof VALID_TABS[number];

export default function Schedule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam || "")
    ? (tabParam as TabValue)
    : "content";

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "content") {
      next.delete("tab");
    } else {
      next.set("tab", value);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Content</h1>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="ideas">General Ideas</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-6">
            <ScheduleView />
          </TabsContent>
          <TabsContent value="ideas" className="mt-6">
            <IdeasView />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
