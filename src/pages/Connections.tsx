import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Youtube, Loader2, CheckCircle2, Unlink, Linkedin, Music2, Instagram, Facebook } from "lucide-react";
import { ConnectionCard } from "@/components/connections/ConnectionCard";

interface YouTubeConnection {
  id: string;
  google_email: string | null;
  channel_id: string | null;
  channel_title: string | null;
  created_at: string;
}

export default function Connections() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [connection, setConnection] = useState<YouTubeConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchConnection = async () => {
    const { data } = await supabase
      .from("youtube_connections")
      .select("id, google_email, channel_id, channel_title, created_at")
      .maybeSingle();
    setConnection(data);
    setLoading(false);
  };

  useEffect(() => {
    const handleTokenCapture = async () => {
      if (!session) return;

      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;

      if (providerToken && providerRefreshToken) {
        setConnecting(true);
        try {
          const { data, error } = await supabase.functions.invoke("youtube-save-connection", {
            body: { providerToken, providerRefreshToken },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          toast({
            title: "YouTube Connected",
            description: `Connected to ${data.channelTitle || "your YouTube channel"}`,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to save connection";
          toast({ title: "Connection Error", description: message, variant: "destructive" });
        } finally {
          setConnecting(false);
        }
      }

      await fetchConnection();
    };

    handleTokenCapture();
  }, [session]);

  const handleConnectYouTube = async () => {
    const redirectTo = `${window.location.origin}/connections`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes:
          "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo,
      },
    });
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    setDisconnecting(true);
    const { error } = await supabase
      .from("youtube_connections")
      .delete()
      .eq("id", connection.id);
    if (error) {
      toast({ title: "Error", description: "Failed to disconnect", variant: "destructive" });
    } else {
      setConnection(null);
      toast({ title: "Disconnected", description: "YouTube account disconnected" });
    }
    setDisconnecting(false);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground mt-1">
            Connect your social media accounts to publish content directly from ContentHub.
          </p>
        </div>

        <div className="grid gap-4">
          {/* YouTube — live */}
          <ConnectionCard
            icon={Youtube}
            iconClassName="h-6 w-6 text-destructive"
            title="YouTube"
            description="Publish videos and Shorts directly to your channel"
            status={connection ? "connected" : "available"}
          >
            {loading || connecting ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {connecting ? "Saving connection…" : "Loading…"}
              </div>
            ) : connection ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    {connection.channel_title && (
                      <p className="text-sm">
                        Channel:{" "}
                        <span className="font-medium text-foreground">
                          {connection.channel_title}
                        </span>
                      </p>
                    )}
                    {connection.google_email && (
                      <p className="text-sm text-muted-foreground truncate">
                        {connection.google_email}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="gap-2"
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unlink className="h-4 w-4" />
                  )}
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={handleConnectYouTube} className="gap-2">
                <Youtube className="h-4 w-4" />
                Connect YouTube Account
              </Button>
            )}
          </ConnectionCard>

          {/* Coming soon platforms */}
          <ConnectionCard
            icon={Linkedin}
            iconClassName="h-6 w-6 text-[#0A66C2]"
            title="LinkedIn"
            description="Share long-form posts and articles to your LinkedIn profile"
            status="coming-soon"
          />

          <ConnectionCard
            icon={Music2}
            iconClassName="h-6 w-6 text-foreground"
            title="TikTok"
            description="Cross-post Shorts as TikTok videos"
            status="coming-soon"
          />

          <ConnectionCard
            icon={Instagram}
            iconClassName="h-6 w-6 text-pink-500"
            title="Instagram"
            description="Publish Reels and posts to your Instagram account"
            status="coming-soon"
          />

          <ConnectionCard
            icon={Facebook}
            iconClassName="h-6 w-6 text-[#1877F2]"
            title="Facebook"
            description="Share videos and posts to your Facebook Page"
            status="coming-soon"
          />
        </div>
      </div>
    </AppLayout>
  );
}
