import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SocialContent } from "./useContents";

export function useIncompleteContent() {
  return useQuery({
    queryKey: ["schedule", "incomplete"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("status", "incomplete")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SocialContent[];
    },
  });
}

export function useUnscheduledContent() {
  return useQuery({
    queryKey: ["schedule", "unscheduled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("status", "unscheduled")
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
        .from("posted_content")
        .select("*")
        .order("posted_at", { ascending: false });
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
      playlistId,
    }: {
      id: string;
      scheduledAt: Date;
      playlistId: number | null;
    }) => {
      const { error } = await supabase
        .from("social_content")
        .update({
          status: "scheduled",
          scheduled_at: scheduledAt.toISOString(),
          playlist_id: playlistId,
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
      playlistId,
    }: {
      id: string;
      scheduledAt: Date;
      playlistId: number | null;
    }) => {
      const { error } = await supabase
        .from("social_content")
        .update({
          scheduled_at: scheduledAt.toISOString(),
          playlist_id: playlistId,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

export function usePostNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contentId,
      playlistId,
    }: {
      contentId: string;
      playlistId: number | null;
    }) => {
      // Save playlist_id and mark as scheduled with scheduled_at = now
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("social_content")
        .update({
          playlist_id: playlistId,
          status: "scheduled",
          scheduled_at: now,
        } as any)
        .eq("id", contentId);
      if (updateError) throw updateError;

      // Invoke the edge function to do the actual posting
      const { data, error: fnError } = await supabase.functions.invoke(
        "post-scheduled-content",
        { body: { contentId } }
      );
      if (fnError) throw fnError;

      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (result?.error) throw new Error(result.error);
      if (result?.posted === 0) throw new Error("Edge function did not post the content");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
  });
}

export function usePlaylists() {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playlists")
        .select("*")
        .order("playlist_title", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
