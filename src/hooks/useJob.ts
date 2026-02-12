import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContentJob = Tables<"content_jobs">;
export type PlatformOutput = Tables<"platform_outputs">;

export function useJob(jobId: string | undefined) {
  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      if (!jobId) throw new Error("No job ID");
      const { data, error } = await supabase
        .from("content_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error) throw error;
      return data as ContentJob;
    },
    enabled: !!jobId,
  });

  const outputsQuery = useQuery({
    queryKey: ["job-outputs", jobId],
    queryFn: async () => {
      if (!jobId) throw new Error("No job ID");
      const { data, error } = await supabase
        .from("platform_outputs")
        .select("*")
        .eq("job_id", jobId);
      if (error) throw error;
      return data as PlatformOutput[];
    },
    enabled: !!jobId,
  });

  return { job: jobQuery.data, outputs: outputsQuery.data, isLoading: jobQuery.isLoading || outputsQuery.isLoading, error: jobQuery.error || outputsQuery.error };
}
