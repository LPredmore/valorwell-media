import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UploadPostProfile = {
  user_id: string;
  username: string;
  provisioning_status: "pending" | "ready" | "failed" | "error" | "limit_reached" | string;
  provisioning_error: string | null;
  connected_platforms: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export const ALL_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "linkedin",
  "facebook",
  "x",
  "threads",
  "pinterest",
  "reddit",
  "bluesky",
] as const;
export type PlatformKey = (typeof ALL_PLATFORMS)[number];

export function isPlatformConnected(
  connected: Record<string, unknown> | null | undefined,
  platform: string,
): boolean {
  if (!connected) return false;
  const v = connected[platform];
  if (!v) return false;
  if (typeof v === "string") return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

export function useUploadPostProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["upload-post-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upload_post_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as UploadPostProfile | null;
    },
    refetchInterval: (q) => {
      const data = q.state.data as UploadPostProfile | null | undefined;
      // Keep polling while still provisioning
      return data && data.provisioning_status === "pending" ? 3000 : false;
    },
  });
}

export function useSyncUploadPostProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "upload-post-sync-profile",
        { body: {} },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upload-post-profile"] });
    },
  });
}

export class ProfileLimitReachedError extends Error {
  code = "PROFILE_LIMIT_REACHED";
  constructor(message?: string) {
    super(message ?? "Our publishing service is at capacity. Please contact support.");
  }
}

export function useGenerateConnectLink() {
  return useMutation({
    mutationFn: async (platform: PlatformKey) => {
      const { data, error } = await supabase.functions.invoke(
        "upload-post-generate-link",
        { body: { platform } },
      );
      if (error) {
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const payload = await ctx.json();
            if (payload?.error_code === "PROFILE_LIMIT_REACHED") {
              throw new ProfileLimitReachedError(payload.error);
            }
            if (payload?.error) throw new Error(payload.error);
          }
        } catch (inner) {
          if (inner instanceof ProfileLimitReachedError) throw inner;
        }
        throw error;
      }
      if ((data as any)?.error_code === "PROFILE_LIMIT_REACHED") {
        throw new ProfileLimitReachedError((data as any)?.error);
      }
      return data as { url?: string; access_url?: string };
    },
  });
}

export function useUploadPostSlotStatus(enabled = false) {
  return useQuery({
    queryKey: ["upload-post-slot-status"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "upload-post-admin-slot-status",
        { body: {} },
      );
      if (error) throw error;
      return data as {
        used: number;
        upstream_usernames: string[];
        upstream_profiles: any[];
        our_rows_count: number;
        orphans: string[];
        missing_upstream: string[];
        checked_at: string;
      };
    },
    staleTime: 10_000,
  });
}

export function usePruneUploadPostProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) => {
      const { data, error } = await supabase.functions.invoke(
        "upload-post-admin-prune",
        { body: { username } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upload-post-slot-status"] });
      queryClient.invalidateQueries({ queryKey: ["upload-post-profile"] });
    },
  });
}

export function useRetryProvisioning() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke(
        "upload-post-create-profile",
        { body: { user_id: user.id, retry: true } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upload-post-profile"] });
    },
  });
}

export type UploadPostDebugStatus = {
  our_profile: UploadPostProfile;
  provider_status: number;
  provider_user: Record<string, unknown> | null;
  provider_raw: unknown;
  debug_log: Array<Record<string, unknown>>;
  checked_at: string;
};

export function useUploadPostDebugStatus(enabled = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["upload-post-debug-status", user?.id],
    enabled: !!user?.id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "upload-post-debug-status",
        { body: {} },
      );
      if (error) throw error;
      return data as UploadPostDebugStatus;
    },
    staleTime: 10_000,
  });
}
