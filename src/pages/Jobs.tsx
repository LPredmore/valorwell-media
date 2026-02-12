import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { JobsTable } from "@/components/jobs/JobsTable";
import { useJobs, useDeleteJob } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { JOB_STATUSES } from "@/lib/platforms";

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: jobs = [], isLoading } = useJobs(search, statusFilter);
  const deleteJob = useDeleteJob();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">Jobs</h1>
          <Link to="/jobs/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Job
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by topic..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {JOB_STATUSES.map((s) => (
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
          <JobsTable
            jobs={jobs}
            onDelete={(id) => deleteJob.mutate(id)}
            isDeleting={deleteJob.isPending}
          />
        )}
      </div>
    </AppLayout>
  );
}
