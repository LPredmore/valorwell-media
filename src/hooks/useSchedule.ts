import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SocialContent } from "./useContents";

export function useUnscheduledContent() {
  return useQuery({
    queryKey: ["schedule", "unscheduled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("status", "complete")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SocialContent[];
    },
  });
}

export function useScheduledContent() {
  return useQuery({
    queryKey: ["schedule", "scheduled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("status", "scheduled")
        .order("scheduled_at" as any, { ascending: true });
      if (error) throw error;
      return data as unknown as SocialContent[];
    },
  });
}

export function usePostedContent() {
  return useQuery({
    queryKey: ["schedule", "posted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("status", "posted")
        .order("posted_at" as any, { ascending: false });
      if (error) throw error;
      return data as unknown as SocialContent[];
    },
  });
}

export function useScheduleContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      scheduledAt,
      platforms,
    }: {
      id: string;
      scheduledAt: Date;
      platforms: string[];
    }) => {
      const { error } = await supabase
        .from("social_content")
        .update({
          status: "scheduled",
          scheduled_at: scheduledAt.toISOString(),
          scheduled_platforms: platforms,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      scheduledAt,
      platforms,
    }: {
      id: string;
      scheduledAt: Date;
      platforms: string[];
    }) => {
      const { error } = await supabase
        .from("social_content")
        .update({
          scheduled_at: scheduledAt.toISOString(),
          scheduled_platforms: platforms,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}
