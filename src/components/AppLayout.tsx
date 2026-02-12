import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Briefcase, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/jobs" className="text-xl font-extrabold tracking-tight text-foreground">
              Content<span className="text-primary">Hub</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link to="/jobs">
                <Button
                  variant={location.pathname.startsWith("/jobs") ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Briefcase className="h-4 w-4" />
                  Jobs
                </Button>
              </Link>
              {isAdmin && (
                <Link to="/instructions">
                  <Button
                    variant={location.pathname === "/instructions" ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Instructions
                  </Button>
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
