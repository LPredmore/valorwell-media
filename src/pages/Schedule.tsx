import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnscheduledTab } from "@/components/schedule/UnscheduledTab";
import { ScheduledTab } from "@/components/schedule/ScheduledTab";
import { PastTab } from "@/components/schedule/PastTab";

export default function Schedule() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Schedule</h1>

        <Tabs defaultValue="unscheduled">
          <TabsList>
            <TabsTrigger value="unscheduled">Unscheduled</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>

          <TabsContent value="unscheduled">
            <UnscheduledTab />
          </TabsContent>
          <TabsContent value="scheduled">
            <ScheduledTab />
          </TabsContent>
          <TabsContent value="past">
            <PastTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
