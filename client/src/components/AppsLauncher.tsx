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
  | "messages"
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

export function AppsLauncher({ active, className, variant = "dark" }: AppsLauncherProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const isLight = variant === "light";

  // The Brainstorm apps grid holds the product family only. The interface
  // destinations (Search / Dashboard / Network) live in the account menu.
  const tiles: AppTile[] = [
    ...(FEATURES.agentSuite
      ? [
          {
            key: "agentsuite" as const,
            label: "Agent Suite",
            path: "/agentsuite",
            icon: AgentIcon,
            tone: "special" as const,
          },
        ]
      : []),
    // Product family (Design System v1.0, p.12) — Signal · Communities · Music ·
    // Events. Product icons read in Aurora Cyan (distinct from the purple
    // toolbar/interface icons), even while coming soon.
    {
      key: "reviews",
      label: "Signal",
      path: "/",
      iconSrc: "/brand/sub-brands/signal.svg",
      comingSoon: true,
      tone: "product",
    },
    {
      key: "communities",
      label: "Communities",
      path: "/",
      iconSrc: "/brand/sub-brands/communities.svg",
      comingSoon: true,
      tone: "product",
    },
    {
      key: "music",
      label: "Music",
      path: "/",
      iconSrc: "/brand/sub-brands/music.svg",
      comingSoon: true,
      tone: "product",
    },
    {
      key: "events",
      label: "Events",
      path: "/",
      iconSrc: "/brand/sub-brands/events.svg",
      comingSoon: true,
      tone: "product",
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={
            (isLight
              ? "no-default-hover-elevate no-default-active-elevate rounded-xl text-slate-500 hover:bg-slate-900/5 hover:text-brand-primary dark:text-slate-400 dark:hover:bg-white/10 "
              : "no-default-hover-elevate no-default-active-elevate rounded-xl text-slate-300 hover:bg-white/10 hover:text-white ") +
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
        className="w-60 border-slate-200/80 bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] dark:border-slate-800 dark:bg-slate-900"
        data-testid="panel-apps-launcher"
      >
        <p
          className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500"
          data-testid="text-apps-launcher-heading"
        >
          Brainstorm apps
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const isActive = active === tile.key;
            const inactive = tile.disabled || tile.comingSoon;
            return (
              <button
                key={tile.key}
                type="button"
                disabled={inactive}
                title={tile.comingSoon ? "Coming soon" : tile.disabled ? tile.disabledTitle : undefined}
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
                      ? "cursor-not-allowed opacity-40 "
                      : "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10 ") +
                  (isActive && !inactive
                    ? "bg-brand-primary/10 ring-1 ring-inset ring-brand-primary/20 dark:bg-brand-primary/15 dark:ring-brand-primary/20"
                    : "")
                }
                data-testid={`app-tile-${tile.key}`}
              >
                <span
                  className={
                    "flex h-10 w-10 items-center justify-center rounded-xl " +
                    (tile.tone === "product"
                      ? "border border-brand-accent/20 bg-brand-accent/[0.08]"
                      : tile.comingSoon
                        ? "border border-slate-300/40 bg-slate-400/[0.07] dark:border-slate-700/40 dark:bg-slate-500/[0.12]"
                        : "bg-gradient-to-br from-brand-primary/10 to-brand-primary/[0.04] " +
                          (tile.tone === "special"
                            ? "animate-pulse-glow border border-brand-primary/[0.3]"
                            : "border border-brand-primary/10"))
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
                              : "text-brand-primary")
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
                    className="text-[8px] font-semibold uppercase leading-none tracking-[0.12em] text-slate-400/80 dark:text-slate-500/80"
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
