import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Youtube,
  Linkedin,
  Music2,
  Instagram,
  Facebook,
  Twitter,
  AtSign,
  Image as PinIcon,
  Plug,
  MessageCircle,
  Cloud,
} from "lucide-react";
import { ConnectionCard } from "@/components/connections/ConnectionCard";
import {
  useUploadPostProfile,
  useSyncUploadPostProfile,
  useGenerateConnectLink,
  useRetryProvisioning,
  isPlatformConnected,
  ALL_PLATFORMS,
  type PlatformKey,
} from "@/hooks/useUploadPostProfile";

const PLATFORM_META: Record<
  PlatformKey,
  { label: string; description: string; icon: any; iconClassName: string }
> = {
  tiktok: {
    label: "TikTok",
    description: "Publish Shorts as TikTok videos.",
    icon: Music2,
    iconClassName: "h-6 w-6 text-foreground",
  },
  instagram: {
    label: "Instagram",
    description: "Publish Reels and posts to your Instagram account.",
    icon: Instagram,
    iconClassName: "h-6 w-6 text-pink-500",
  },
  youtube: {
    label: "YouTube",
    description: "Publish videos and Shorts directly to your channel.",
    icon: Youtube,
    iconClassName: "h-6 w-6 text-destructive",
  },
  linkedin: {
    label: "LinkedIn",
    description: "Share long-form posts and articles to your profile.",
    icon: Linkedin,
    iconClassName: "h-6 w-6 text-[#0A66C2]",
  },
  facebook: {
    label: "Facebook",
    description: "Share videos and posts to your Facebook Page.",
    icon: Facebook,
    iconClassName: "h-6 w-6 text-[#1877F2]",
  },
  x: {
    label: "X",
    description: "Post videos and updates to X (Twitter).",
    icon: Twitter,
    iconClassName: "h-6 w-6 text-foreground",
  },
  threads: {
    label: "Threads",
    description: "Share short posts and videos to Threads.",
    icon: AtSign,
    iconClassName: "h-6 w-6 text-foreground",
  },
  pinterest: {
    label: "Pinterest",
    description: "Pin videos and images to your Pinterest boards.",
    icon: PinIcon,
    iconClassName: "h-6 w-6 text-destructive",
  },
  reddit: {
    label: "Reddit",
    description: "Share posts and videos to your Reddit communities.",
    icon: MessageCircle,
    iconClassName: "h-6 w-6 text-[#FF4500]",
  },
  bluesky: {
    label: "Bluesky",
    description: "Post short updates and media to your Bluesky account.",
    icon: Cloud,
    iconClassName: "h-6 w-6 text-[#0085FF]",
  },
};

function getHandle(platformValue: unknown): string | null {
  if (!platformValue) return null;
  if (typeof platformValue === "string") return platformValue;
  if (typeof platformValue === "object") {
    const obj = platformValue as Record<string, unknown>;
    const candidates = ["username", "handle", "display_name", "name", "channel_title", "account_name"];
    for (const key of candidates) {
      const v = obj[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

export function ConnectionsView() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: profile, isLoading, refetch } = useUploadPostProfile();
  const syncMutation = useSyncUploadPostProfile();
  const linkMutation = useGenerateConnectLink();
  const retryMutation = useRetryProvisioning();

  // Auto-sync on returning from hosted OAuth
  useEffect(() => {
    if (searchParams.get("synced") === "1") {
      syncMutation.mutate(undefined, {
        onSuccess: () => {
          toast({ title: "Connections refreshed" });
        },
      });
      const next = new URLSearchParams(searchParams);
      next.delete("synced");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async (platform: PlatformKey) => {
    try {
      const data = await linkMutation.mutateAsync(platform);
      const url = data?.access_url ?? data?.url;
      if (!url) throw new Error("No connection link returned");
      window.open(url, "_blank", "noopener,noreferrer");
      toast({
        title: "Opening connection page",
        description: "Finish the connection in the new tab, then come back and refresh.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start connection";
      toast({ title: "Connection error", description: message, variant: "destructive" });
    }
  };

  const handleRefresh = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => toast({ title: "Connections refreshed" }),
      onError: (err: any) =>
        toast({ title: "Refresh failed", description: err?.message, variant: "destructive" }),
    });
  };

  const handleRetryProvisioning = () => {
    retryMutation.mutate(undefined, {
      onSuccess: () => toast({ title: "Retrying setup…" }),
      onError: (err: any) =>
        toast({ title: "Retry failed", description: err?.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your connections…
      </div>
    );
  }

  const status = profile?.provisioning_status ?? "pending";
  const isReady = status === "ready";
  const connected = (profile?.connected_platforms ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Connections</h2>
          <p className="text-muted-foreground mt-1">
            Hook up your social accounts so I can publish content directly from Flurra.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleRefresh}
          disabled={syncMutation.isPending || !isReady}
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {status === "pending" && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            I'm setting up your posting workspace — this usually takes a few seconds.
          </AlertDescription>
        </Alert>
      )}

      {status === "failed" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              Workspace setup failed
              {profile?.provisioning_error ? `: ${profile.provisioning_error}` : "."}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryProvisioning}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {ALL_PLATFORMS.map((platform) => {
          const meta = PLATFORM_META[platform];
          const isConnected = isReady && isPlatformConnected(connected, platform);
          const handle = isConnected ? getHandle(connected[platform]) : null;

          return (
            <ConnectionCard
              key={platform}
              icon={meta.icon}
              iconClassName={meta.iconClassName}
              title={meta.label}
              description={meta.description}
              status={isConnected ? "connected" : "available"}
            >
              {isConnected ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {handle ? (
                      <span>
                        Connected as <span className="font-medium text-foreground">{handle}</span>
                      </span>
                    ) : (
                      <span>Connected</span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleConnect(platform)}
                    disabled={linkMutation.isPending}
                  >
                    <Plug className="h-4 w-4" />
                    Manage
                  </Button>
                </div>
              ) : (
                <Button
                  className="gap-2"
                  onClick={() => handleConnect(platform)}
                  disabled={!isReady || linkMutation.isPending}
                >
                  {linkMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4" />
                  )}
                  Connect {meta.label}
                </Button>
              )}
            </ConnectionCard>
          );
        })}
      </div>
    </div>
  );
}
