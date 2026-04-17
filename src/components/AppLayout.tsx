import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import mascot from "@/assets/flurra-mascot.png";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const navItems = [
    {
      to: "/schedule",
      label: "Content",
      match: (p: string) => p.startsWith("/schedule") || p.startsWith("/content") || p.startsWith("/ideas"),
    },
    {
      to: "/settings",
      label: "Settings",
      match: (p: string) =>
        p.startsWith("/settings") || p.startsWith("/instructions") || p.startsWith("/connections"),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="container flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 sm:gap-12">
            <Link to="/schedule" className="flex items-center group -my-6" aria-label="Flurra home">
              <img
                src={mascot}
                alt="Flurra"
                className="h-[13rem] w-auto object-contain transition-transform group-hover:scale-105"
              />
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active = item.match(location.pathname);
                return (
                  <Link key={item.to} to={item.to}>
                    <Button
                      variant="ghost"
                      className={`relative h-10 rounded-none px-5 font-display text-sm font-medium tracking-wide transition-colors hover:bg-transparent ${
                        active
                          ? "text-foreground after:absolute after:inset-x-3 after:-bottom-[1px] after:h-[2px] after:rounded-full after:bg-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
      <main className="container py-8 animate-fade-in-up">{children}</main>
    </div>
  );
}
