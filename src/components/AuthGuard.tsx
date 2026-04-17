import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Navigate, useLocation } from "react-router-dom";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();

  if (authLoading || (user && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Force onboarding for new users (unless already on the onboarding route)
  const isOnOnboarding = location.pathname === "/onboarding";
  if (profile && !profile.onboarding_completed && !isOnOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
