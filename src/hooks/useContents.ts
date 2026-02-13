import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SocialContent = {
  id: string;
  user_id: string;
  topic: string;
  status: string;
  youtube_title: string | null;
  youtube_desc: string | null;
  facebook_desc: string | null;
  linkedin_desc: string | null;
  ig_tiktok_desc: string | null;
  image: string | null;
  video_url: string | null;
  video_storage_path: string | null;
  video_original_filename: string | null;
  video_mime_type: string | null;
  error: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  scheduled_platforms: string[] | null;
  created_at: string;
  updated_at: string;
};

export function useContents(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ["contents", search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("social_content")
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
