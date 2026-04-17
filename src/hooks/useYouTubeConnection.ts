import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface YouTubeConnection {
  id: string;
  user_id: string;
  google_email: string | null;
  channel_title: string | null;
  channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useYouTubeConnection() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["youtube-connection", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("youtube_connections")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as YouTubeConnection | null) ?? null;
    },
  });

  return {
    connection: query.data ?? null,
    isLoading: query.isLoading,
    isConnected: !!query.data,
    refetch: query.refetch,
  };
}
