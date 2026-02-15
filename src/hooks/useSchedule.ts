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
    mutationFn: async (contentId: string) => {
      // Fetch the content
      const { data: row, error: fetchError } = await supabase
        .from("social_content")
        .select("*")
        .eq("id", contentId)
        .single();
      if (fetchError || !row) throw fetchError || new Error("Not found");

      const now = new Date().toISOString();
      const { id: _id, ...rest } = row as any;

      // Insert into posted_content
      const { error: insertError } = await supabase
        .from("posted_content")
        .insert({ ...rest, status: "posted", posted_at: now } as any);
      if (insertError) throw insertError;

      // Update social_content status
      const { error: updateError } = await supabase
        .from("social_content")
        .update({ status: "posted", posted_at: now } as any)
        .eq("id", contentId);
      if (updateError) throw updateError;
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
