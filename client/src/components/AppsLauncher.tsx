import { useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  Search,
  Home,
  Users,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { FEATURES } from "@/config/featureFlags";

export type AppKey =
  | "home"
  | "dashboard"
  | "network"
  | "settings"
  | "faq"
  | "agentsuite"
  | "admin";

interface AppTile {
  key: AppKey;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  disabledTitle?: string;
  tone?: "default" | "special" | "admin";
}

interface AppsLauncherProps {
  user: { pubkey?: string } | null;
  calcDone?: boolean;
  active?: AppKey;
  className?: string;
  /** Matches AppHeader: "dark" banner vs "light" transparent header. */
  variant?: "dark" | "light";
}

export function AppsLauncher({ user, calcDone = false, active, className, variant = "dark" }: AppsLauncherProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const isLight = variant === "light";

  const tiles: AppTile[] = [
    { key: "dashboard", label: "Dashboard", path: "/dashboard", icon: Home },
    { key: "home", label: "Search", path: "/", icon: Search, tone: "special" },
    {
      key: "network",
      label: "Network",
      path: "/network",
      icon: Users,
      disabled: !calcDone,
      disabledTitle: "Available after calculation completes",
    },
    ...(FEATURES.agentSuite
      ? [{ key: "agentsuite" as const, label: "Agent Suite", path: "/agentsuite", icon: AgentIcon, tone: "special" as const }]
      : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={
            (isLight
              ? "text-slate-500 no-default-hover-elevate no-default-active-elevate hover:text-indigo-600 hover:bg-slate-900/5 rounded-xl "
              : "text-slate-300 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10 rounded-xl ") +
            (className ?? "")
          }
          title="Apps"
          aria-label="Open apps menu"
          data-testid="button-apps-launcher"
        >
          <LayoutGrid className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 p-3 bg-white/95 backdrop-blur-xl border-indigo-500/20 shadow-xl"
        data-testid="panel-apps-launcher"
      >
        <p
          className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400"
          data-testid="text-apps-launcher-heading"
        >
          Brainstorm apps
        </p>
        <div className="grid grid-cols-3 gap-1">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const isActive = active === tile.key;
            return (
              <button
                key={tile.key}
                type="button"
                disabled={tile.disabled}
                title={tile.disabled ? tile.disabledTitle : undefined}
                onClick={() => {
                  if (tile.disabled) return;
                  setOpen(false);
                  navigate(tile.path);
                }}
                className={
                  "flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition-colors " +
                  (tile.disabled
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-pointer hover:bg-indigo-50 ") +
                  (isActive && !tile.disabled ? "bg-indigo-50/70 " : "")
                }
                data-testid={`app-tile-${tile.key}`}
              >
                <span
                  className={
                    "h-10 w-10 rounded-xl flex items-center justify-center " +
                    (tile.tone === "special"
                      ? "bg-gradient-to-br from-indigo-500 to-violet-600 border border-indigo-400/40 shadow-[0_4px_14px_rgba(99,102,241,0.35)]"
                      : "bg-gradient-to-br from-indigo-500/10 to-indigo-500/[0.04] border border-indigo-500/10")
                  }
                >
                  <Icon
                    className={
                      "h-5 w-5 " +
                      (tile.tone === "admin"
                        ? "text-amber-600"
                        : tile.tone === "special"
                          ? "text-white"
                          : "text-indigo-600")
                    }
                  />
                </span>
                <span
                  className={
                    "text-[11px] leading-tight " +
                    (tile.tone === "special"
                      ? "font-semibold text-indigo-700"
                      : "font-medium text-slate-700")
                  }
                >
                  {tile.label}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
