import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncompleteTab } from "@/components/schedule/IncompleteTab";
import { UnscheduledTab } from "@/components/schedule/UnscheduledTab";
import { ScheduledTab } from "@/components/schedule/ScheduledTab";
import { PastTab } from "@/components/schedule/PastTab";

export default function Schedule() {
  const [lengthFilter, setLengthFilter] = useState<"Long" | "Short">("Long");

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Content</h1>

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