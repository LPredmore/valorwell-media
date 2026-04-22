import { Navigate, useLocation } from "react-router-dom";
import { useRegistrationStatus } from "@/hooks/useRegistrationStatus";

// Routes accessible while in `needs_subscription` state.
const SUBSCRIPTION_FLOW_PATHS = [
  "/onboarding/subscribe",
  "/subscription/success",
];

function isSettingsPath(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useRegistrationStatus();
  const location = useLocation();
  const path = location.pathname;

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (status === "needs_onboarding") {
    if (path !== "/onboarding") {
      return <Navigate to="/onboarding" replace />;
    }
    return <>{children}</>;
  }

  if (status === "needs_subscription") {
    const allowed =
      SUBSCRIPTION_FLOW_PATHS.includes(path) || isSettingsPath(path);
    if (!allowed) {
      return <Navigate to="/onboarding/subscribe" replace />;
    }
    return <>{children}</>;
  }

  // status === "active"
  if (path === "/onboarding" || path === "/onboarding/subscribe") {
    return <Navigate to="/schedule" replace />;
  }

  return <>{children}</>;
}
