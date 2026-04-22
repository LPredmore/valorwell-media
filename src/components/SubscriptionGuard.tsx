import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";

export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSubscription();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data?.subscribed) {
    return <Navigate to="/onboarding/subscribe" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
