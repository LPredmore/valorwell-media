import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SocialContent = {
  id: string;
  user_id: string;
  topic: string;
  status: string;
  youtube_desc: string | null;
  facebook_desc: string | null;
  linkedin_desc: string | null;
  ig_tiktok_desc: string | null;
  post_title: string | null;
  image: string | null;
  video_url: string | null;
  video_storage_path: string | null;
  video_original_filename: string | null;
  video_mime_type: string | null;
  error: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  scheduled_platforms: string[] | null;
  playlist_id: number | null;
  post_length: string | null;
  upload_post_request_id: string | null;
  upload_post_status: string | null;
  upload_post_results: Record<string, unknown> | null;
  video_size_bytes: number | null;
  script: string | null;
  planned_date: string | null;
  created_at: string;
  updated_at: string;
};

export function useContents(search?: string, statusFilter?: string, lengthFilter?: "Long" | "Short") {
  return useQuery({
    queryKey: ["contents", search, statusFilter, lengthFilter],
    queryFn: async () => {
      let query = supabase
        .from("social_content")
        .select("*")
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`topic.ilike.%${search}%,post_title.ilike.%${search}%`);
      }
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
      }
      if (lengthFilter) {
        query = query.eq("post_length", lengthFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as SocialContent[];
    },
  });
}

export function useDeleteContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("social_content").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
  });
}
