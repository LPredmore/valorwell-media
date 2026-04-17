import { Navigate } from "react-router-dom";

export default function Instructions() {
  return <Navigate to="/settings?tab=instructions" replace />;
}
