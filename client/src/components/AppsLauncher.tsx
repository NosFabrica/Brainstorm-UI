import { useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LayoutGrid } from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";

import { FEATURES } from "@/config/featureFlags";

export type AppKey =
  | "home"
  | "dashboard"
  | "network"
  | "settings"
  | "faq"
  | "agentsuite"
  | "admin"
  | "reviews"
  | "communities"
  | "music"
  | "events";

interface AppTile {
  key: AppKey;
  label: string;
  path: string;
  /** Lucide/React icon component (interface tiles). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Sub-brand SVG served from /public (product-family tiles). */
  iconSrc?: string;
  disabled?: boolean;
  disabledTitle?: string;
  comingSoon?: boolean;
  tone?: "default" | "special" | "admin" | "product";
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

  // The Brainstorm apps grid holds the product family only. The interface
  // destinations (Search / Dashboard / Network) live in the account menu.
  const tiles: AppTile[] = [
    ...(FEATURES.agentSuite
      ? [{ key: "agentsuite" as const, label: "Agent Suite", path: "/agentsuite", icon: AgentIcon, tone: "special" as const }]
      : []),
    // Product family (Design System v1.0, p.12) — Signal · Communities · Music ·
    // Events. Product icons read in Aurora Cyan (distinct from the purple
    // toolbar/interface icons), even while coming soon.
    { key: "reviews", label: "Signal", path: "/", iconSrc: "/brand/sub-brands/signal.svg", comingSoon: true, tone: "product" },
    { key: "communities", label: "Communities", path: "/", iconSrc: "/brand/sub-brands/communities.svg", comingSoon: true, tone: "product" },
    { key: "music", label: "Music", path: "/", iconSrc: "/brand/sub-brands/music.svg", comingSoon: true, tone: "product" },
    { key: "events", label: "Events", path: "/", iconSrc: "/brand/sub-brands/events.svg", comingSoon: true, tone: "product" },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={
            (isLight
              ? "text-slate-500 dark:text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-indigo-600 hover:bg-slate-900/5 dark:hover:bg-white/10 rounded-xl "
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
        className="w-72 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-indigo-500/20 shadow-xl"
        data-testid="panel-apps-launcher"
      >
        <p
          className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500"
          data-testid="text-apps-launcher-heading"
        >
          Brainstorm apps
        </p>
        <div className="grid grid-cols-3 gap-1">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const isActive = active === tile.key;
            const inactive = tile.disabled || tile.comingSoon;
            return (
              <button
                key={tile.key}
                type="button"
                disabled={inactive}
                title={
                  tile.comingSoon
                    ? "Coming soon"
                    : tile.disabled
                      ? tile.disabledTitle
                      : undefined
                }
                onClick={() => {
                  if (inactive) return;
                  setOpen(false);
                  navigate(tile.path);
                }}
                className={
                  "relative flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50 " +
                  (tile.comingSoon
                    ? "cursor-default "
                    : tile.disabled
                      ? "opacity-40 cursor-not-allowed "
                      : "cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-500/10 ") +
                  (isActive && !inactive ? "bg-indigo-50/70 dark:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/20 dark:ring-indigo-400/20 " : "")
                }
                data-testid={`app-tile-${tile.key}`}
              >
                <span
                  className={
                    "h-10 w-10 rounded-xl flex items-center justify-center " +
                    (tile.tone === "product"
                      ? "bg-brand-accent/[0.08] border border-brand-accent/20 "
                      : tile.comingSoon
                        ? "bg-slate-400/[0.07] dark:bg-slate-500/[0.12] border border-slate-300/40 dark:border-slate-700/40 "
                        : "bg-gradient-to-br from-indigo-500/10 to-indigo-500/[0.04] " +
                          (tile.tone === "special"
                            ? "border border-indigo-500/30 animate-pulse-glow"
                            : "border border-indigo-500/10"))
                  }
                >
                  {tile.iconSrc ? (
                    <img
                      src={tile.iconSrc}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="max-h-5 w-auto max-w-[26px] select-none object-contain"
                    />
                  ) : Icon ? (
                    <Icon
                      className={
                        "h-5 w-5 " +
                        (tile.tone === "product"
                          ? "text-brand-accent"
                          : tile.comingSoon
                            ? "text-slate-400 dark:text-slate-500"
                            : tile.tone === "admin"
                              ? "text-amber-600"
                              : "text-indigo-600")
                      }
                    />
                  ) : null}
                </span>
                <span
                  className={
                    "text-[11px] font-medium leading-tight " +
                    (tile.comingSoon ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300")
                  }
                >
                  {tile.label}
                </span>
                {tile.comingSoon && (
                  <span
                    className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400/80 dark:text-slate-500/80 leading-none"
                    data-testid={`text-soon-${tile.key}`}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
