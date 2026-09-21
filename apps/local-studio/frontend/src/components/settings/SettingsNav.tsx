import { KeyRound, Plug } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/settings/integrations", label: "Integrations", icon: Plug },
  { to: "/settings/keys", label: "API keys", icon: KeyRound },
] as const;

export function SettingsNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav
      aria-label="Settings"
      className="grid shrink-0 grid-cols-2 gap-1 border-b border-border p-2 md:w-52 md:grid-cols-1 md:content-start md:border-r md:border-b-0 md:p-3"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-[color,background-color] duration-150",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
