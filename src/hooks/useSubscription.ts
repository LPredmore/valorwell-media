import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type SubscriptionTier = "monthly" | "annual" | "comp" | null;

export type SubscriptionStatus = {
  subscribed: boolean;
  subscription_tier: SubscriptionTier;
  subscription_end: string | null;
};

/**
 * Reads subscription status directly from the `subscribers` table.
 *
 * The `subscribers` row is the source of truth for routing decisions. It is
 * written by the `check-subscription` and Stripe webhook edge functions
 * whenever a real subscription event happens. Reading it directly (rather
 * than invoking `check-subscription` on every page load) avoids a class of
 * bugs where calling the edge function from the wrong Stripe environment
 * (e.g. sandbox vs live) would overwrite a valid row with `subscribed: false`.
 */
export function useSubscription() {
  const { user } = useAuth();

  return useQuery<SubscriptionStatus>({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      if (!user) {
        return { subscribed: false, subscription_tier: null, subscription_end: null };
      }
      const { data, error } = await supabase
        .from("subscribers")
        .select("subscribed, subscription_tier, subscription_end")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return { subscribed: false, subscription_tier: null, subscription_end: null };
      }
      return {
        subscribed: !!data.subscribed,
        subscription_tier: (data.subscription_tier as SubscriptionTier) ?? null,
        subscription_end: data.subscription_end ?? null,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
