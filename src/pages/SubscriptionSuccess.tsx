import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles } from "lucide-react";
import mascot from "@/assets/flurra-mascot.png";
import { OnboardingLogoutButton } from "@/components/OnboardingLogoutButton";

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const qc = useQueryClient();

  useEffect(() => {
    // Force refresh subscription state from Stripe
    (async () => {
      try {
        await supabase.functions.invoke("check-subscription", {
          body: { environment: getStripeEnvironment() },
        });
        qc.invalidateQueries({ queryKey: ["subscription"] });
      } catch {
        // ignore
      }
    })();
  }, [qc, sessionId]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute right-4 top-4">
        <OnboardingLogoutButton />
      </div>
      <div className="w-full max-w-lg space-y-6 text-center animate-fade-in-up">
        <img src={mascot} alt="Flurra" className="mx-auto h-32 w-auto object-contain" />
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight">
          <span className="text-brand-gradient">You're in!</span>
        </h1>
        <p className="text-lg text-muted-foreground">
          Subscription confirmed. Let's start filling your calendar.
        </p>
        <Button
          size="lg"
          className="w-full gap-2"
          onClick={() => navigate("/schedule", { replace: true })}
        >
          <Sparkles className="h-4 w-4" />
          Go to my schedule
        </Button>
      </div>
    </div>
  );
}
