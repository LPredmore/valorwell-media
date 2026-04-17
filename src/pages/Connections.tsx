import { Navigate, useLocation } from "react-router-dom";

export default function Connections() {
  // Preserve any OAuth provider tokens in the URL hash so the redirect target can capture them.
  const location = useLocation();
  return <Navigate to={`/settings?tab=connections${location.hash}`} replace />;
}
