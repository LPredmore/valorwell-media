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
      return (data as unknown as SocialContent[]) ?? [];
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
      platforms,
      youtubeVia,
    }: {
      id: string;
      scheduledAt: Date;
      playlistId: number | null;
      platforms?: string[];
      youtubeVia?: string | null;
    }) => {
      const update: Record<string, unknown> = {
        status: "scheduled",
        scheduled_at: scheduledAt.toISOString(),
        playlist_id: playlistId,
      };
      if (platforms) update.scheduled_platforms = platforms;
      if (youtubeVia !== undefined) update.youtube_via = youtubeVia;
      const { error } = await supabase
        .from("social_content")
        .update(update as any)
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
      platforms,
      youtubeVia,
    }: {
      id: string;
      scheduledAt: Date;
      playlistId: number | null;
      platforms?: string[];
      youtubeVia?: string | null;
    }) => {
      const update: Record<string, unknown> = {
        scheduled_at: scheduledAt.toISOString(),
        playlist_id: playlistId,
      };
      if (platforms) update.scheduled_platforms = platforms;
      if (youtubeVia !== undefined) update.youtube_via = youtubeVia;
      const { error } = await supabase
        .from("social_content")
        .update(update as any)
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
      platforms,
      youtubeVia,
    }: {
      contentId: string;
      playlistId: number | null;
      platforms?: string[];
      youtubeVia?: string | null;
    }) => {
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        playlist_id: playlistId,
        status: "scheduled",
        scheduled_at: now,
      };
      if (platforms) update.scheduled_platforms = platforms;
      if (youtubeVia !== undefined) update.youtube_via = youtubeVia;
      const { error } = await supabase
        .from("social_content")
        .update(update as any)
        .eq("id", contentId);
      if (error) throw error;

      // Fire submit(s) immediately so user doesn't wait for cron
      const wantsYoutube = (platforms ?? []).includes("youtube");
      const useNative = youtubeVia === "native" && wantsYoutube;
      const others = (platforms ?? []).filter((p) => p !== "youtube");

      if (useNative) {
        await supabase.functions.invoke("youtube-native-submit", { body: { content_id: contentId } });
        if (others.length > 0) {
          await supabase.functions.invoke("upload-post-submit", { body: { content_id: contentId } });
        }
      } else {
        await supabase.functions.invoke("upload-post-submit", { body: { content_id: contentId } });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
  });
}

export function useRetryUploadPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Reset status then re-invoke submit
      const { error } = await supabase
        .from("social_content")
        .update({
          upload_post_status: "pending",
          upload_post_results: {},
          error: null,
        } as any)
        .eq("id", id);
      if (error) throw error;

      await supabase.functions.invoke("upload-post-submit", {
        body: { content_id: id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["contents"] });
      queryClient.invalidateQueries({ queryKey: ["content"] });
    },
  });
}

export function useRetryYoutubeNative() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("social_content")
        .update({
          youtube_native_status: null,
          youtube_native_error_detail: null,
          youtube_native_video_id: null,
          youtube_native_uploaded_at: null,
        } as any)
        .eq("id", id);
      if (error) throw error;

      await supabase.functions.invoke("youtube-native-submit", {
        body: { content_id: id },
      });
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
