import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getStripeEnvironment } from "@/lib/stripe";

export type SubscriptionStatus = {
  subscribed: boolean;
  subscription_tier: "monthly" | "annual" | null;
  subscription_end: string | null;
};

export function useSubscription() {
  const { user } = useAuth();

  return useQuery<SubscriptionStatus>({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      if (!user) {
        return { subscribed: false, subscription_tier: null, subscription_end: null };
      }
      const { data, error } = await supabase.functions.invoke("check-subscription", {
        body: { environment: getStripeEnvironment() },
      });
      if (error) throw error;
      return data as SubscriptionStatus;
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
