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

const MusicLibraryIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path d="M22 13V22H2V8H22V13Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="square" />
    <path d="M19 7V8H5V5H19V7Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="square" />
    <path d="M16 2H8V5H16V2Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="square" />
    <path d="M9.07977 19.4498C9.80879 19.4498 10.3998 18.8588 10.3998 18.1298C10.3998 17.4008 9.80879 16.8098 9.07977 16.8098C8.35076 16.8098 7.75977 17.4008 7.75977 18.1298C7.75977 18.8588 8.35076 19.4498 9.07977 19.4498Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    <path d="M15.2499 17.2494V12.0795V11L10.3999 12.2095V13.7294V14.3494V18.1395" stroke="currentColor" strokeWidth="1.5" />
    <path d="M13.9298 18.5699C14.6588 18.5699 15.2498 17.979 15.2498 17.2499C15.2498 16.5209 14.6588 15.9299 13.9298 15.9299C13.2008 15.9299 12.6099 16.5209 12.6099 17.2499C12.6099 17.979 13.2008 18.5699 13.9298 18.5699Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    <path d="M10.6499 14.35L14.9995 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
  </svg>
);

const RankingIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    className={className}
  >
    <path d="M12 7.37012L14.33 12.0401L19 12.8201L15.5 16.3201L16.67 21.3801L12 18.6201L7.32999 21.3801L8.5 16.3201L5 12.8201L9.66998 12.0401L12 7.37012Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    <path d="M6 9V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    <path d="M18 9V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    <path d="M12 4V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
  </svg>
);

const CategoriesShapeIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M17.7196 22.63C16.6096 22.63 15.4996 22.21 14.6596 21.36C13.8396 20.54 13.3896 19.45 13.3896 18.3C13.3896 17.15 13.8396 16.05 14.6596 15.24C15.4796 14.42 16.5696 13.97 17.7196 13.97C18.8696 13.97 19.9596 14.42 20.7796 15.24C21.5996 16.06 22.0496 17.15 22.0496 18.3C22.0496 19.45 21.5996 20.55 20.7796 21.36C19.9396 22.2 18.8296 22.63 17.7196 22.63ZM17.7196 15.47C16.9596 15.47 16.2496 15.76 15.7196 16.3C15.1896 16.84 14.8896 17.55 14.8896 18.3C14.8896 19.05 15.1796 19.77 15.7196 20.3C16.7896 21.36 18.6596 21.36 19.7196 20.3C20.2596 19.77 20.5496 19.06 20.5496 18.3C20.5496 17.54 20.2596 16.83 19.7196 16.3C19.1896 15.77 18.4796 15.47 17.7196 15.47Z" />
    <path d="M17.7197 11.31C17.2197 11.31 16.7197 11.12 16.3397 10.74L13.2497 7.64999C12.4897 6.88999 12.4897 5.65999 13.2497 4.89999L16.3397 1.80999C17.0997 1.04999 18.3297 1.04999 19.0897 1.80999L22.1797 4.89999C22.9397 5.65999 22.9397 6.88999 22.1797 7.64999L19.0897 10.74C18.7097 11.12 18.2097 11.31 17.7197 11.31ZM17.7197 2.74999C17.6097 2.74999 17.4897 2.78999 17.4097 2.87999L14.3197 5.96999C14.1497 6.13999 14.1497 6.41999 14.3197 6.59999L17.4097 9.68999C17.5797 9.85999 17.8697 9.85999 18.0397 9.68999L21.1297 6.59999C21.2997 6.42999 21.2997 6.14999 21.1297 5.96999L18.0397 2.87999C17.9597 2.79999 17.8397 2.74999 17.7197 2.74999Z" />
    <path d="M7.96992 10.41H3.60992C2.53992 10.41 1.66992 9.54003 1.66992 8.47003V4.10003C1.66992 3.03003 2.53992 2.16003 3.60992 2.16003H7.96992C9.03992 2.16003 9.90992 3.03003 9.90992 4.10003V8.47003C9.90992 9.54003 9.03992 10.41 7.96992 10.41ZM3.60992 3.65003C3.35992 3.65003 3.16992 3.85003 3.16992 4.09003V8.46003C3.16992 8.71003 3.36992 8.90003 3.60992 8.90003H7.96992C8.21992 8.90003 8.40992 8.70003 8.40992 8.46003V4.10003C8.40992 3.85003 8.20992 3.66003 7.96992 3.66003H3.60992V3.65003Z" />
    <path d="M8.43991 22.5699H3.13991C2.39991 22.5699 1.73991 22.1799 1.37991 21.5299C1.01991 20.8799 1.03991 20.1199 1.42991 19.4899L4.07991 15.2499C4.44991 14.6599 5.08991 14.3099 5.77991 14.3099C6.47991 14.3099 7.10991 14.6599 7.47991 15.2499L10.1299 19.4899C10.5199 20.1199 10.5399 20.8799 10.1799 21.5299C9.81991 22.1799 9.15991 22.5699 8.41991 22.5699H8.43991ZM5.35991 16.0499L2.70991 20.2899C2.56991 20.5199 2.64991 20.7299 2.69991 20.8099C2.73991 20.8899 2.86991 21.0699 3.14991 21.0699H8.44991C8.71991 21.0699 8.84991 20.8899 8.89991 20.8099C8.93991 20.7299 9.01991 20.5199 8.87991 20.2899L6.22991 16.0499C6.08991 15.8199 5.86991 15.8099 5.77991 15.8099C5.68991 15.8099 5.46991 15.8199 5.35991 16.0499Z" />
  </svg>
);
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
  | "music";

interface AppTile {
  key: AppKey;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  disabledTitle?: string;
  comingSoon?: boolean;
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
    { key: "reviews", label: "Reviews", path: "/", icon: RankingIcon, comingSoon: true },
    { key: "communities", label: "Communities", path: "/", icon: CategoriesShapeIcon, comingSoon: true },
    { key: "music", label: "Music", path: "/", icon: MusicLibraryIcon, comingSoon: true },
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
                  "relative flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition-colors " +
                  (tile.comingSoon
                    ? "cursor-default "
                    : tile.disabled
                      ? "opacity-40 cursor-not-allowed "
                      : "cursor-pointer hover:bg-indigo-50 ") +
                  (isActive && !inactive ? "bg-indigo-50/70 " : "")
                }
                data-testid={`app-tile-${tile.key}`}
              >
                <span
                  className={
                    "h-10 w-10 rounded-xl flex items-center justify-center " +
                    (tile.comingSoon
                      ? "bg-slate-400/[0.07] border border-slate-300/40 "
                      : "bg-gradient-to-br from-indigo-500/10 to-indigo-500/[0.04] " +
                        (tile.tone === "special"
                          ? "border border-indigo-500/30 animate-pulse-glow"
                          : "border border-indigo-500/10"))
                  }
                >
                  <Icon
                    className={
                      "h-5 w-5 " +
                      (tile.comingSoon
                        ? "text-slate-400"
                        : tile.tone === "admin"
                          ? "text-amber-600"
                          : "text-indigo-600")
                    }
                  />
                </span>
                <span
                  className={
                    "text-[11px] font-medium leading-tight " +
                    (tile.comingSoon ? "text-slate-400" : "text-slate-700")
                  }
                >
                  {tile.label}
                </span>
                {tile.comingSoon && (
                  <span
                    className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400/80 leading-none"
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
