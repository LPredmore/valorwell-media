import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "@/hooks/use-toast";
import { CreditCard, ExternalLink, Sparkles, Gift, Lock } from "lucide-react";
import { PAYMENTS_ENABLED } from "@/lib/featureFlags";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BillingView() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useSubscription();
  const [opening, setOpening] = useState(false);

  const openPortal = async () => {
    setOpening(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("customer-portal", {
        body: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/settings?tab=billing`,
        },
      });
      if (error || !result?.url) throw new Error(error?.message || "Could not open portal");
      window.open(result.url, "_blank");
    } catch (e) {
      toast({
        title: "Couldn't open billing portal",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOpening(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isComp = data?.subscription_tier === "comp";

  const tierLabel =
    data?.subscription_tier === "annual"
      ? "Annual ($9.99/mo, billed yearly)"
      : data?.subscription_tier === "monthly"
        ? "Monthly ($15/mo)"
        : "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Billing</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription, payment method, and invoices.
        </p>
      </div>

      {!PAYMENTS_ENABLED ? (
        <div className="rounded-2xl border border-border surface-elevated p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Lock className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="text-lg font-semibold">Free access</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Payments aren't enabled yet. The app is currently free to use for invited accounts.
                When billing is turned on, you'll be able to manage your subscription here.
              </p>
            </div>
          </div>
        </div>
      ) : isComp ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Gift className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="text-lg font-semibold">Complimentary access</p>
              <p className="mt-2 text-sm text-muted-foreground">
                You have complimentary access to Flurra. No payment method or subscription required —
                everything is unlocked, with no expiration.
              </p>
            </div>
          </div>
        </div>
      ) : data?.subscribed ? (
        <div className="rounded-2xl border border-border surface-elevated p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="text-lg font-semibold">{tierLabel}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 border-t border-border pt-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Renews on</p>
              <p className="mt-1 text-sm font-medium">{formatDate(data.subscription_end)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
              <p className="mt-1 text-sm font-medium text-primary">Active</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-5">
            <Button onClick={openPortal} disabled={opening} className="gap-2">
              <CreditCard className="h-4 w-4" />
              {opening ? "Opening…" : "Manage subscription"}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" onClick={() => refetch()}>
              Refresh status
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border surface-elevated p-6 space-y-4 text-center">
          <p className="text-sm text-muted-foreground">You don't have an active subscription.</p>
          <Button onClick={() => navigate("/onboarding/subscribe")} className="gap-2">
            <Sparkles className="h-4 w-4" />
            See plans
          </Button>
        </div>
      )}
    </div>
  );
}
