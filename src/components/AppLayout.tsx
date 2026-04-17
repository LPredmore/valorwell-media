import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { LogOut, FileText, Settings, Cog, Lightbulb, Link2 } from "lucide-react";
import mascot from "@/assets/flurra-mascot.png";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const location = useLocation();

  const navItems = [
    { to: "/schedule", label: "Content", icon: FileText, match: (p: string) => p.startsWith("/schedule") },
    { to: "/ideas", label: "Ideas", icon: Lightbulb, match: (p: string) => p.startsWith("/ideas") },
    { to: "/instructions", label: "Instructions", icon: Settings, match: (p: string) => p === "/instructions" },
    { to: "/connections", label: "Connections", icon: Link2, match: (p: string) => p === "/connections" },
    { to: "/settings", label: "Settings", icon: Cog, match: (p: string) => p === "/settings" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link to="/schedule" className="flex items-center gap-2.5 group">
              <img
                src={mascot}
                alt="Flurra"
                className="h-9 w-9 rounded-full ring-1 ring-border object-cover bg-brand-navy-2 transition-transform group-hover:scale-105"
              />
              <span className="font-display text-2xl font-bold tracking-tight text-brand-gradient">
                Flurra
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active = item.match(location.pathname);
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`gap-2 rounded-full px-3 transition-all ${
                        active
                          ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              title="Sign out"
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8 animate-fade-in-up">{children}</main>
    </div>
  );
}
