import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Youtube, Loader2, CheckCircle2, Unlink } from "lucide-react";

interface YouTubeConnection {
  id: string;
  google_email: string | null;
  channel_id: string | null;
  channel_title: string | null;
  created_at: string;
}

export default function Settings() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [connection, setConnection] = useState<YouTubeConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Fetch existing connection
  const fetchConnection = async () => {
    const { data } = await supabase
      .from("youtube_connections")
      .select("id, google_email, channel_id, channel_title, created_at")
      .maybeSingle();
    setConnection(data);
    setLoading(false);
  };

  // On mount: check for provider tokens from OAuth redirect, then fetch connection
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

  const handleConnect = async () => {
    const redirectTo = `${window.location.origin}/settings`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
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
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Youtube className="h-6 w-6 text-destructive" />
              <div>
                <CardTitle>YouTube Connection</CardTitle>
                <CardDescription>
                  Connect your YouTube account to publish videos directly
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                    <p className="font-medium text-foreground">Connected</p>
                    {connection.channel_title && (
                      <p className="text-sm text-muted-foreground">
                        Channel: <span className="font-medium text-foreground">{connection.channel_title}</span>
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
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={handleConnect} className="gap-2">
                <Youtube className="h-4 w-4" />
                Connect YouTube Account
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
