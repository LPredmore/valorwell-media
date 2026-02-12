import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContentJob = Tables<"content_jobs">;

export function useJobs(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ["jobs", search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("content_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      if (search) {
        query = query.ilike("topic", `%${search}%`);
      }
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ContentJob[];
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      // Delete storage files
      const { data: files } = await supabase.storage
        .from("content-media")
        .list(`jobs/${jobId}`);
      if (files && files.length > 0) {
        await supabase.storage
          .from("content-media")
          .remove(files.map((f) => `jobs/${jobId}/${f.name}`));
      }
      // Delete job (cascades to platform_outputs via DB)
      const { error } = await supabase.from("content_jobs").delete().eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
