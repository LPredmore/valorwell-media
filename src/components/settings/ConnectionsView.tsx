import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  ChevronDown,
  Bug,
} from "lucide-react";
import { ConnectionCard } from "@/components/connections/ConnectionCard";
import {
  useUploadPostProfile,
  useSyncUploadPostProfile,
  useGenerateConnectLink,
  useRetryProvisioning,
  useUploadPostDebugStatus,
  useUploadPostSlotStatus,
  usePruneUploadPostProfile,
  isPlatformConnected,
  ProfileLimitReachedError,
  ALL_PLATFORMS,
  type PlatformKey,
} from "@/hooks/useUploadPostProfile";
import {
  useYoutubeNativeConnection,
  useConnectYoutubeNative,
  useDisconnectYoutubeNative,
} from "@/hooks/useYoutubeNativeConnection";
import { useIsAdmin } from "@/hooks/useIsAdmin";

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
    description: "Publish via Upload-Post (legacy path).",
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
  const { data: profile, isLoading } = useUploadPostProfile();
  const syncMutation = useSyncUploadPostProfile();
  const linkMutation = useGenerateConnectLink();
  const retryMutation = useRetryProvisioning();

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const debugStatus = useUploadPostDebugStatus(diagnosticsOpen);

  const pollRef = useRef<number | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

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

  const runPostConnectSync = (attemptedKey: PlatformKey) => {
    const attemptedLabel = PLATFORM_META[attemptedKey].label;
    syncMutation.mutate(undefined, {
      onSuccess: (updated: any) => {
        const updatedConnected = (updated?.connected_platforms ?? {}) as Record<
          string,
          unknown
        >;
        if (isPlatformConnected(updatedConnected, attemptedKey)) {
          const handle = getHandle(updatedConnected[attemptedKey]);
          toast({
            title: handle
              ? `${attemptedLabel} connected as ${handle}`
              : `${attemptedLabel} connected`,
          });
        } else {
          toast({
            title: `${attemptedLabel} didn't connect`,
            description: "Open Diagnostics to see the raw provider state.",
            variant: "destructive",
            action: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDiagnosticsOpen(true);
                  setTimeout(() => debugStatus.refetch(), 0);
                }}
              >
                View diagnostics
              </Button>
            ) as any,
          });
        }
      },
      onError: (err: any) =>
        toast({
          title: "Sync failed",
          description: err?.message,
          variant: "destructive",
        }),
    });
  };

  const handleConnect = async (platform: PlatformKey) => {
    const label = PLATFORM_META[platform].label;
    try {
      const data = await linkMutation.mutateAsync(platform);
      const url = data?.access_url ?? data?.url;
      if (!url) throw new Error("No connection link returned");

      // Open popup directly from user gesture
      const w = 600;
      const h = 720;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        url,
        "uploadpost-connect",
        `width=${w},height=${h},left=${left},top=${top}`,
      );

      if (!popup) {
        toast({
          title: "Popup blocked",
          description: "Allow popups for this site, then try again.",
          variant: "destructive",
          action: (
            <Button size="sm" variant="outline" onClick={() => handleConnect(platform)}>
              Retry
            </Button>
          ) as any,
        });
        return;
      }

      popupRef.current = popup;
      toast({ title: `Opening ${label} connection…` });

      // Clear any prior poll
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      const openedAt = Date.now();
      pollRef.current = window.setInterval(() => {
        if (popup.closed) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          const elapsed = Date.now() - openedAt;
          if (elapsed < 500) {
            toast({
              title: "Popup blocked",
              description: "Allow popups for this site, then try again.",
              variant: "destructive",
              action: (
                <Button size="sm" variant="outline" onClick={() => handleConnect(platform)}>
                  Retry
                </Button>
              ) as any,
            });
            return;
          }
          runPostConnectSync(platform);
        }
      }, 500);
    } catch (err: unknown) {
      if (err instanceof ProfileLimitReachedError) {
        toast({
          title: "Can't add more accounts right now",
          description:
            "Our publishing service has hit its profile limit. Please contact support so we can free up a slot.",
          variant: "destructive",
        });
        return;
      }
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
    if (diagnosticsOpen) debugStatus.refetch();
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
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Native connections (beta) */}
      <div className="space-y-3">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">
            Native connections <span className="text-xs font-normal text-muted-foreground ml-1">(beta)</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            Direct OAuth to your account — more reliable, no third-party.
          </p>
        </div>
        <YoutubeNativeCard />
      </div>

      <div>
        <h3 className="font-display text-lg font-semibold tracking-tight">
          Via Upload-Post
        </h3>
      </div>

      {status === "limit_reached" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Our publishing service is at capacity and can't add new accounts right now.
            Please contact support so we can free up a slot.
          </AlertDescription>
        </Alert>
      )}

      {(status === "failed" || status === "error") && (
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

      <AdminSlotPanel />


      <div className="grid gap-4">
        {ALL_PLATFORMS.map((platform) => {
          const meta = PLATFORM_META[platform];
          const isConnected = isPlatformConnected(connected, platform);
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
                  disabled={linkMutation.isPending}
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

      {/* Diagnostics panel */}
      <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Bug className="h-4 w-4" />
            Diagnostics
            <ChevronDown
              className={`h-4 w-4 transition-transform ${diagnosticsOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Upload-Post raw status</p>
                <p className="text-xs text-muted-foreground">
                  What the provider's API reports about your profile.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => debugStatus.refetch()}
                disabled={debugStatus.isFetching}
                className="gap-2"
              >
                {debugStatus.isFetching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Refresh
              </Button>
            </div>
            {debugStatus.isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Fetching diagnostics…
              </div>
            ) : debugStatus.error ? (
              <p className="text-sm text-destructive">
                {(debugStatus.error as Error).message}
              </p>
            ) : debugStatus.data ? (
              <pre className="text-xs bg-background border rounded p-3 overflow-auto max-h-96">
                {JSON.stringify(debugStatus.data, null, 2)}
              </pre>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

    </div>
  );
}

function YoutubeNativeCard() {
  const { toast } = useToast();
  const { data: connection, isLoading } = useYoutubeNativeConnection();
  const connectMutation = useConnectYoutubeNative();
  const disconnectMutation = useDisconnectYoutubeNative();

  const handleConnect = () => {
    connectMutation.mutate(undefined, {
      onError: (err: any) =>
        toast({
          title: "Couldn't start connection",
          description: err?.message ?? String(err),
          variant: "destructive",
        }),
    });
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => toast({ title: "YouTube disconnected" }),
      onError: (err: any) =>
        toast({
          title: "Disconnect failed",
          description: err?.message ?? String(err),
          variant: "destructive",
        }),
    });
  };

  const isConnected = !!connection;

  return (
    <ConnectionCard
      icon={Youtube}
      iconClassName="h-6 w-6 text-destructive"
      title="YouTube (Native)"
      description="Direct upload from your own Google account."
      status={isConnected ? "connected" : "available"}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : isConnected ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              {connection.channel_title ? (
                <div className="truncate">
                  Connected as{" "}
                  <span className="font-medium text-foreground">
                    {connection.channel_title}
                  </span>
                  {connection.channel_handle ? (
                    <span className="text-muted-foreground"> · {connection.channel_handle}</span>
                  ) : null}
                </div>
              ) : (
                <div>Connected</div>
              )}
              {connection.google_account_email && (
                <div className="text-xs text-muted-foreground truncate">
                  {connection.google_account_email}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleConnect}
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              Reconnect
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Disconnect"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="gap-2"
          onClick={handleConnect}
          disabled={connectMutation.isPending}
        >
          {connectMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plug className="h-4 w-4" />
          )}
          Connect YouTube
        </Button>
      )}
    </ConnectionCard>
  );
}

function AdminSlotPanel() {
  const { isAdmin } = useIsAdmin();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const slotStatus = useUploadPostSlotStatus(open);
  const pruneMutation = usePruneUploadPostProfile();

  if (!isAdmin) return null;

  const handlePrune = (username: string) => {
    if (!confirm(`Delete upstream profile "${username}"? This frees a slot but the user will need to reconnect.`)) return;
    pruneMutation.mutate(username, {
      onSuccess: () => toast({ title: `Removed ${username}` }),
      onError: (e: any) =>
        toast({ title: "Prune failed", description: e?.message, variant: "destructive" }),
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plug className="h-4 w-4" />
          Admin: Upload-Post slot status
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Upstream profile usage</p>
              <p className="text-xs text-muted-foreground">
                Live count from Upload-Post. Use prune to free slots.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => slotStatus.refetch()}
              disabled={slotStatus.isFetching}
              className="gap-2"
            >
              {slotStatus.isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Refresh
            </Button>
          </div>

          {slotStatus.isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading slot status…
            </div>
          ) : slotStatus.error ? (
            <p className="text-sm text-destructive">{(slotStatus.error as Error).message}</p>
          ) : slotStatus.data ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium">{slotStatus.data.used}</span> upstream profile(s) in use
                {" · "}
                <span className="font-medium">{slotStatus.data.our_rows_count}</span> reserved in our DB
              </div>

              {slotStatus.data.upstream_usernames.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Upstream profiles</p>
                  <div className="space-y-1">
                    {slotStatus.data.upstream_usernames.map((u) => (
                      <div key={u} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                        <code className="text-xs truncate">{u}</code>
                        <div className="flex items-center gap-2">
                          {slotStatus.data!.orphans.includes(u) && (
                            <span className="text-xs text-amber-600">orphan</span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePrune(u)}
                            disabled={pruneMutation.isPending}
                          >
                            Prune
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {slotStatus.data.missing_upstream.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-600 mb-1">
                    Marked ready in DB but missing upstream (will self-heal on next Connect)
                  </p>
                  <ul className="text-xs list-disc pl-4">
                    {slotStatus.data.missing_upstream.map((u) => <li key={u}><code>{u}</code></li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
