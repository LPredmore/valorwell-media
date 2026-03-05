import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SocialContent } from "./useContents";

export function useIncompleteContent(postLength?: "Long" | "Short") {
  return useQuery({
    queryKey: ["schedule", "incomplete", postLength],
    queryFn: async () => {
      let query = supabase
        .from("social_content")
        .select("*")
        .eq("status", "incomplete")
        .order("created_at", { ascending: false });
      if (postLength) query = query.eq("post_length", postLength);
      const { data, error } = await query;
      if (error) throw error;

      const rows = (data as unknown as SocialContent[]) ?? [];
      const readyToPromoteIds = rows
        .filter((item) => {
          const needsImage = item.post_length === "Long";
          const hasImage = !needsImage || !!item.image;
          return !!item.video_storage_path && !!item.post_title && !!item.post_length && hasImage;
        })
        .map((item) => item.id);

      if (readyToPromoteIds.length > 0) {
        await supabase
          .from("social_content")
          .update({ status: "unscheduled" } as any)
          .in("id", readyToPromoteIds);
      }

      return rows.filter((item) => !readyToPromoteIds.includes(item.id));
    },
  });
}

export function useUnscheduledContent(postLength?: "Long" | "Short") {
  return useQuery({
    queryKey: ["schedule", "unscheduled", postLength],
    queryFn: async () => {
      let query = supabase
        .from("social_content")
        .select("*")
        .eq("status", "unscheduled")
        .order("created_at", { ascending: false });
      if (postLength) query = query.eq("post_length", postLength);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as SocialContent[];
    },
  });
}

export function useScheduledContent(postLength?: "Long" | "Short") {
  return useQuery({
    queryKey: ["schedule", "scheduled", postLength],
    queryFn: async () => {
      let query = supabase
        .from("social_content")
        .select("*")
        .eq("status", "scheduled")
        .order("scheduled_at" as any, { ascending: true });
      if (postLength) query = query.eq("post_length", postLength);
      const { data, error } = await query;
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
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("social_content")
        .update({
          playlist_id: playlistId,
          status: "scheduled",
          scheduled_at: now,
        } as any)
        .eq("id", contentId);
      if (error) throw error;
      // Supabase trigger will set upload_at = now() and youtube_status = 'queued'
      // Fly.io will pick it up on its next poll
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
  });
}

export function useRetryYouTubeUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("social_content")
        .update({
          youtube_status: "queued",
          upload_at: new Date().toISOString(),
          youtube_error_detail: null,
          youtube_video_id: null,
          youtube_uploaded_at: null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
      queryClient.invalidateQueries({ queryKey: ["content"] });
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
