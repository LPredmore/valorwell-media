import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { useSubscription } from "./useSubscription";

export type RegistrationStatus =
  | "loading"
  | "unauthenticated"
  | "needs_onboarding"
  | "needs_subscription"
  | "active";

export function useRegistrationStatus() {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: subscription, isLoading: subLoading } = useSubscription();

  let status: RegistrationStatus = "loading";

  if (authLoading) {
    status = "loading";
  } else if (!user) {
    status = "unauthenticated";
  } else if (profileLoading) {
    status = "loading";
  } else if (profile && !profile.onboarding_completed) {
    status = "needs_onboarding";
  } else if (subLoading) {
    status = "loading";
  } else if (!subscription?.subscribed) {
    status = "needs_subscription";
  } else {
    status = "active";
  }

  return { status, user, profile, subscription };
}
