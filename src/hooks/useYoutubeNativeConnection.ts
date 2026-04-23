import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface YoutubeNativeConnection {
  user_id: string;
  google_account_email: string | null;
  channel_id: string | null;
  channel_title: string | null;
  channel_handle: string | null;
  scopes: string[] | null;
  connected_at: string;
  updated_at: string;
}

export function useYoutubeNativeConnection() {
  return useQuery({
    queryKey: ["youtube-native-connection"],
    queryFn: async (): Promise<YoutubeNativeConnection | null> => {
      const { data, error } = await (supabase as any)
        .from("youtube_connections_public")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data as YoutubeNativeConnection) ?? null;
    },
  });
}

export function useConnectYoutubeNative() {
  const queryClient = useQueryClient();

  // Listen for postMessage from the OAuth popup
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data) return;
      if (event.data.type === "youtube_connected" || event.data.type === "youtube_connect_failed") {
        queryClient.invalidateQueries({ queryKey: ["youtube-native-connection"] });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("youtube-native-oauth-start", {
        body: {},
      });
      if (error) throw error;
      const authUrl = (data as any)?.auth_url;
      if (!authUrl) throw new Error("No auth URL returned");

      const w = 600;
      const h = 720;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        authUrl,
        "youtube-native-connect",
        `width=${w},height=${h},left=${left},top=${top}`,
      );
      if (!popup) {
        throw new Error("Popup blocked. Allow popups for this site and try again.");
      }

      // Poll for popup close → invalidate query
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (popup.closed) {
            clearInterval(interval);
            queryClient.invalidateQueries({ queryKey: ["youtube-native-connection"] });
            resolve();
          }
        }, 500);
      });
    },
  });
}

export function useDisconnectYoutubeNative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("youtube-native-disconnect", {
        body: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["youtube-native-connection"] });
    },
  });
}
