import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import {
  Sparkles,
  Check,
  ArrowLeft,
  Music2,
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  AtSign,
  Image as PinIcon,
  MessageCircle,
  Cloud,
  Infinity as InfinityIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import mascot from "@/assets/flurra-mascot.png";
import { OnboardingLogoutButton } from "@/components/OnboardingLogoutButton";

const PLATFORM_ICONS = [
  { Icon: Music2, label: "TikTok", color: "text-foreground" },
  { Icon: Instagram, label: "Instagram", color: "text-pink-500" },
  { Icon: Youtube, label: "YouTube", color: "text-red-500" },
  { Icon: Linkedin, label: "LinkedIn", color: "text-blue-500" },
  { Icon: Facebook, label: "Facebook", color: "text-blue-600" },
  { Icon: Twitter, label: "X", color: "text-foreground" },
  { Icon: AtSign, label: "Threads", color: "text-foreground" },
  { Icon: PinIcon, label: "Pinterest", color: "text-red-600" },
  { Icon: MessageCircle, label: "Reddit", color: "text-[#FF4500]" },
  { Icon: Cloud, label: "Bluesky", color: "text-[#0085FF]" },
];

const VALUE_PROPS = [
  "Unlimited AI-generated scripts and captions",
  "Unlimited posts to all 10 platforms — TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest, Reddit, Bluesky",
  "Smart scheduling — drop a date, I queue it",
  "Auto-publishing when the time hits",
  "Bulk idea import from CSV",
  "Long-form scripts auto-split into Shorts",
];

export default function OnboardingSubscribe() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [opening, setOpening] = useState<"monthly" | "annual" | null>(null);

  // AuthGuard handles redirecting users who become subscribed.

  const openCheckout = async (priceId: string, tier: "monthly" | "annual") => {
    if (!user) {
      navigate("/login");
      return;
    }
    setOpening(tier);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          customerEmail: user.email,
          userId: user.id,
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        },
      });
      if (error || !data?.clientSecret) {
        throw new Error(error?.message || "Could not start checkout");
      }
      setClientSecret(data.clientSecret);
    } catch (e) {
      toast({
        title: "Couldn't open checkout",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/onboarding")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <img src={mascot} alt="Flurra" className="h-16 w-auto object-contain" />
            <OnboardingLogoutButton />
          </div>
        </div>

        {/* Hero */}
        <div className="mb-12 text-center space-y-4 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            One plan. Everything included.
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            <span className="text-brand-gradient">Unlimited posting.</span>
            <br />
            Every platform. One price.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            I'll handle scripts, captions, scheduling, and publishing across all 10 platforms —
            as much as you want, every day, forever.
          </p>
        </div>

        {/* Platform value bar */}
        <div className="mb-12 rounded-3xl border border-border surface-elevated p-6">
          <p className="mb-4 text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Post unlimited times to all of these
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {PLATFORM_ICONS.map(({ Icon, label, color }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <Icon className={`h-7 w-7 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing cards */}
        <div className="mb-12 grid gap-6 md:grid-cols-2">
          {/* Monthly */}
          <div className="flex flex-col rounded-3xl border border-border surface-elevated p-8">
            <div className="mb-6">
              <h3 className="font-display text-xl font-semibold">Monthly</h3>
              <p className="mt-1 text-sm text-muted-foreground">Flexibility, no commitment.</p>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-5xl font-bold">$15</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Billed monthly</p>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => openCheckout("flurra_monthly_15", "monthly")}
              disabled={opening !== null}
            >
              {opening === "monthly" ? "Opening…" : "Start monthly"}
            </Button>
          </div>

          {/* Annual */}
          <div className="relative flex flex-col rounded-3xl border-2 border-primary bg-primary/5 p-8 shadow-[0_0_60px_-15px_hsl(var(--primary)/0.4)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-gradient-to-r from-primary to-primary/70 px-3 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
                MOST POPULAR · SAVE 33%
              </span>
            </div>
            <div className="mb-6">
              <h3 className="font-display text-xl font-semibold text-brand-gradient">Annual</h3>
              <p className="mt-1 text-sm text-muted-foreground">Best value. Lock in your rate.</p>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-5xl font-bold">$9.99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                $119.88/year · <span className="font-semibold text-primary">Save $60/year</span>
              </p>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => openCheckout("flurra_annual_11988", "annual")}
              disabled={opening !== null}
            >
              {opening === "annual" ? "Opening…" : "Start annual — Save 33%"}
            </Button>
          </div>
        </div>

        {/* What you get */}
        <div className="mb-10 rounded-3xl border border-border surface-elevated p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <InfinityIcon className="h-5 w-5" />
            </div>
            <h2 className="font-display text-2xl font-bold">What you actually get</h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {VALUE_PROPS.map((prop) => (
              <li key={prop} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-3 w-3 text-primary" />
                </div>
                <span className="text-sm text-foreground">{prop}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Reassurance */}
        <p className="text-center text-sm text-muted-foreground">
          Cancel anytime · No per-post fees · No platform limits
        </p>
      </div>

      {/* Embedded Checkout dialog */}
      <Dialog
        open={!!clientSecret}
        onOpenChange={(open) => !open && setClientSecret(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Complete your subscription</DialogTitle>
          </DialogHeader>
          <div className="p-6 pt-2">
            {clientSecret && (
              <EmbeddedCheckoutProvider
                stripe={getStripe()}
                options={{ fetchClientSecret: async () => clientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
