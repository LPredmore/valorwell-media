import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  className?: string;
}

export function OnboardingLogoutButton({ className }: Props) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      className={`gap-2 ${className ?? ""}`}
    >
      <LogOut className="h-4 w-4" />
      Log out
    </Button>
  );
}
