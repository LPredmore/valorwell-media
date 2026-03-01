import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { LogOut, FileText, Settings, CalendarDays, Cog, Lightbulb } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link to="/content" className="text-xl font-extrabold tracking-tight text-foreground">
              Content<span className="text-primary">Hub</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link to="/content">
                <Button
                  variant={location.pathname.startsWith("/content") ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Content</span>
                </Button>
              </Link>
              <Link to="/schedule">
                <Button
                  variant={location.pathname.startsWith("/schedule") ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">Schedule</span>
                </Button>
              </Link>
              <Link to="/ideas">
                <Button
                  variant={location.pathname.startsWith("/ideas") ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Lightbulb className="h-4 w-4" />
                  <span className="hidden sm:inline">Ideas</span>
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
                    <span className="hidden sm:inline">Instructions</span>
                  </Button>
                </Link>
              )}
              <Link to="/settings">
                <Button
                  variant={location.pathname === "/settings" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Cog className="h-4 w-4" />
                  <span className="hidden sm:inline">Settings</span>
                </Button>
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
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
