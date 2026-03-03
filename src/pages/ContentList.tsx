import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ContentTable } from "@/components/content/ContentTable";
import { useContents, useDeleteContent } from "@/hooks/useContents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { CONTENT_STATUSES } from "@/lib/platforms";

export default function ContentList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lengthFilter, setLengthFilter] = useState<"Long" | "Short">("Long");
  const { data: items = [], isLoading } = useContents(search, statusFilter, lengthFilter);
  const deleteContent = useDeleteContent();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">Content</h1>
          <Link to="/content/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Content
            </Button>
          </Link>
        </div>

        <Tabs value={lengthFilter} onValueChange={(v) => setLengthFilter(v as "Long" | "Short")}>
          <TabsList>
            <TabsTrigger value="Long">Long</TabsTrigger>
            <TabsTrigger value="Short">Short</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CONTENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <ContentTable
            items={items}
            onDelete={(id) => deleteContent.mutate(id)}
            isDeleting={deleteContent.isPending}
          />
        )}
      </div>
    </AppLayout>
  );
}