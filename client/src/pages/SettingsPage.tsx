import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  Search,
  Menu,
  LogOut,
  Settings as SettingsIcon,
  X,
  Info,
  BookOpen,
} from "lucide-react";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";

const BRAIN_SVG_PATHS = [
  "M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z",
  "M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z",
  "M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z",
  "M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z",
  "M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z",
  "M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z",
];

function BrainIcon({ size = 28, className = "text-indigo-400" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <g clipPath="url(#clip0_settings_brain)">
        {BRAIN_SVG_PATHS.map((d, i) => (
          <path key={i} d={d} stroke="currentColor" strokeMiterlimit="10" />
        ))}
      </g>
      <defs>
        <clipPath id="clip0_settings_brain">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

type PresetKey = "permissive" | "balanced" | "restrictive";

const PRESETS: Record<
  PresetKey,
  {
    label: string;
    short: string;
    description: string;
    defaults: {
      hopMin: number;
      hopMax: number;
      flaggedPenalty: "low" | "medium" | "high";
      allowNip05Boost: boolean;
      requireGraphSignal: boolean;
    };
    education: {
      howItFeels: string;
      whatChanges: string[];
    };
  }
> = {
  permissive: {
    label: "Relax",
    short: "More trusting by default",
    description:
      "Optimizes for discovery. You\u2019ll see more profiles treated as \u201Ctrusted\u201D unless there are strong negative signals.",
    defaults: {
      hopMin: 1,
      hopMax: 5,
      flaggedPenalty: "low",
      allowNip05Boost: true,
      requireGraphSignal: false,
    },
    education: {
      howItFeels:
        "You\u2019ll be more likely to give new or distant accounts the benefit of the doubt\u2014useful when exploring unfamiliar communities.",
      whatChanges: [
        "Distant hops contribute more to the final perspective.",
        "Negative signals are down-weighted unless repeated.",
        "Identity hints (like NIP-05) get a little extra influence.",
      ],
    },
  },
  balanced: {
    label: "Default",
    short: "Recommended baseline",
    description:
      "A neutral starting point. Balances discovery with caution and aligns with how most users interpret Web of Trust signals.",
    defaults: {
      hopMin: 1,
      hopMax: 3,
      flaggedPenalty: "medium",
      allowNip05Boost: true,
      requireGraphSignal: true,
    },
    education: {
      howItFeels:
        "You\u2019ll generally agree with what your trusted neighborhood would conclude, without being overly optimistic or pessimistic.",
      whatChanges: [
        "Nearby hops have the most influence; distant hops fade out.",
        "Negative signals matter, but don\u2019t dominate unless strong.",
        "Missing network evidence reduces confidence (not necessarily reputation).",
      ],
    },
  },
  restrictive: {
    label: "Strict",
    short: "Safety-first interpretation",
    description:
      "Optimizes for caution. You\u2019ll need stronger network evidence before treating a profile as \u201Ctrusted.\u201D",
    defaults: {
      hopMin: 1,
      hopMax: 2,
      flaggedPenalty: "high",
      allowNip05Boost: false,
      requireGraphSignal: true,
    },
    education: {
      howItFeels:
        "You\u2019ll be less likely to trust accounts outside your immediate graph\u2014great for high-signal environments and avoiding edge-case risks.",
      whatChanges: [
        "Only close hops meaningfully influence your view.",
        "Negative signals are amplified to protect against scams/impersonation.",
        "Identity hints don\u2019t override weak graph evidence.",
      ],
    },
  },
};

function EducationCallout({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)]"
      data-testid={testId}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-32 h-56 w-56 rounded-full bg-indigo-500/10 blur-[52px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.06),_transparent_55%)]" />
      </div>
      <div className="relative p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-2xl bg-slate-950 border border-white/10 shadow-[0_12px_22px_-18px_rgba(15,23,42,0.7)] flex items-center justify-center shrink-0">
            <Info className="h-4 w-4 text-indigo-200" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid={`${testId}-title`}>
              {title}
            </h3>
            <div className="mt-1.5 text-[13px] text-slate-600 leading-relaxed" data-testid={`${testId}-body`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [savedPreset, setSavedPreset] = useState<PresetKey>("balanced");
  const [draftPreset, setDraftPreset] = useState<PresetKey>("balanced");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activePreset = useMemo(() => PRESETS[draftPreset], [draftPreset]);
  const hasUnsavedChanges = draftPreset !== savedPreset;

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/");
      return;
    }
    setUser(u);
  }, [navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-settings">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-52 h-[560px] w-[560px] rounded-full bg-indigo-500/12 blur-[120px]" />
        <div className="absolute -bottom-56 -left-56 h-[620px] w-[620px] rounded-full bg-indigo-800/10 blur-[130px]" />
      </div>

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-settings">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <div className="lg:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(true)}
                  className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                  data-testid="button-open-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>

              <button
                type="button"
                className="flex items-center gap-3 min-w-0 lg:hidden"
                onClick={() => navigate("/dashboard")}
                data-testid="button-settings-mobile-brand"
              >
                <div className="h-9 w-9 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center shrink-0">
                  <BrainIcon size={20} className="text-indigo-200" />
                </div>
                <div className="leading-tight text-left min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-settings-mobile-nav-kicker">Brainstorm</p>
                  <p className="text-sm font-bold text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-settings-mobile-nav-title">Settings</p>
                </div>
              </button>

              <button
                type="button"
                className="hidden lg:flex items-center gap-2"
                onClick={() => navigate("/dashboard")}
                data-testid="button-desktop-brand"
              >
                <BrainIcon size={28} className="text-indigo-500" />
                <span className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">Brainstorm</span>
              </button>

              <div className="hidden lg:flex gap-2" data-testid="nav-settings-tabs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-nav-dashboard"
                >
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/search")}
                  data-testid="button-nav-search"
                >
                  <Search className="h-4 w-4" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-white bg-white/10 no-default-hover-elevate no-default-active-elevate"
                  data-testid="button-nav-settings"
                >
                  <SettingsIcon className="h-4 w-4" />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/what-is-wot")}
                  data-testid="button-nav-wot"
                >
                  <BookOpen className="h-4 w-4" />
                  What is WoT?
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-settings-profile-menu">
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md" data-testid="img-settings-avatar">
                      {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2" data-testid="text-settings-profile-meta">
                      <span className="text-sm font-bold text-white leading-none mb-0.5" data-testid="text-settings-profile-name">{user.displayName || "Anon"}</span>
                      <span className="text-[10px] text-indigo-300 font-mono leading-none" data-testid="text-settings-profile-npub">{user.npub.slice(0, 8)}...</span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20" data-testid="menu-settings-profile">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900" data-testid="text-settings-menu-name">{user.displayName || "Anon"}</p>
                      <p className="text-xs leading-none text-slate-500" data-testid="text-settings-menu-npub">{user.npub.slice(0, 16)}...</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={handleLogout}
                    data-testid="dropdown-signout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            data-testid="overlay-mobile-menu"
          />
          <div
            className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-xl flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950"
            data-testid="panel-mobile-menu"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-[90px]" />
              <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-indigo-900/18 blur-[110px]" />
            </div>

            <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center">
                  <BrainIcon size={22} className="text-indigo-200" />
                </div>
                <div className="leading-tight">
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-mobile-menu-kicker">Brainstorm</p>
                  <h2 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mobile-menu-title">Menu</h2>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-200/80 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                data-testid="button-close-mobile-menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative flex-1 overflow-y-auto py-4 px-3 space-y-6">
              <div className="space-y-2">
                <p className="px-3 text-[10px] font-semibold text-slate-300/70 uppercase tracking-[0.22em]" data-testid="text-mobile-menu-section-nav">Navigation</p>
                {[
                  { path: "/dashboard", label: "Dashboard", icon: Home },
                  { path: "/search", label: "Search", icon: Search },
                  { path: "/settings", label: "Settings", icon: SettingsIcon },
                  { path: "/what-is-wot", label: "What is WoT?", icon: BookOpen },
                ].map((item) => {
                  const active = location === item.path;
                  return (
                    <Button
                      key={item.path}
                      variant="ghost"
                      className={
                        "w-full justify-start gap-3 text-[15px] rounded-2xl transition-colors no-default-hover-elevate no-default-active-elevate " +
                        (active
                          ? "font-semibold text-white bg-white/10 border border-white/10 shadow-[0_12px_26px_-18px_rgba(99,102,241,0.35)]"
                          : "font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10")
                      }
                      onClick={() => { setMobileMenuOpen(false); navigate(item.path); }}
                      data-testid={`button-mobile-nav-${item.label.toLowerCase()}`}
                    >
                      <item.icon className={"h-5 w-5 " + (active ? "text-indigo-200" : "text-slate-200/80")} />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
                <Avatar className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]" data-testid="img-mobile-menu-avatar">
                  {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
                  <AvatarFallback className="rounded-2xl bg-white/5 text-white font-bold text-lg">{(user.displayName?.slice(0, 1) || "U").toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate" data-testid="text-mobile-menu-user-label">{user.displayName || "Anon"}</p>
                  <p className="text-xs text-slate-300/70 font-mono truncate" data-testid="text-mobile-menu-user-npub">{user.npub}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-center gap-2 text-red-200 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl"
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                data-testid="button-mobile-sign-out"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">
        <div className="space-y-6 animate-fade-up" data-testid="container-settings">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-settings-header">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-indigo-500/12 shadow-sm backdrop-blur-sm w-fit" data-testid="pill-settings-kicker">
                <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1]" />
                <p className="text-[9px] font-bold tracking-[0.15em] text-indigo-900 uppercase" data-testid="text-settings-kicker">Brainstorm Settings</p>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3" style={{ fontFamily: "var(--font-display)" }} data-testid="text-settings-title">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Tune your trust perspective
                </span>
              </h1>
              <div className="flex items-center gap-3">
                <p className="text-slate-600 font-medium" data-testid="text-settings-subtitle">
                  These controls don&apos;t change Nostr itself&mdash;only how Brainstorm weights trust signals when presenting context and risk.
                </p>
              </div>
            </div>
          </div>

          <Card
            className="bg-white/90 backdrop-blur-xl border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.07)] overflow-hidden rounded-xl relative"
            data-testid="card-settings-presets"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />
            </div>

            <div className="relative p-4 sm:p-5">
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-indigo-500/15 to-transparent pointer-events-none" />

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-indigo-800/60" data-testid="text-settings-presets-kicker">Preset</p>
                  <div className="mt-1">
                    <h2 className="inline-flex items-center text-[15px] sm:text-base font-bold text-slate-900 tracking-tight border-b border-indigo-500/35 pb-1" style={{ fontFamily: "var(--font-display)" }} data-testid="text-settings-presets-title">
                      Trust perspective
                    </h2>
                  </div>
                  <div className="mt-2 space-y-2" data-testid="row-settings-presets-subtitle">
                    <p className="text-[13px] text-slate-700 font-medium" data-testid="text-settings-presets-subtitle">Choose how Brainstorm interprets your Nostr social graph.</p>
                    <div className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 shadow-[0_12px_28px_-22px_rgba(99,102,241,0.25)]" data-testid="callout-settings-presets-why">
                      <p className="text-[12px] text-slate-600 leading-relaxed" data-testid="text-settings-presets-subtitle-detail">
                        <span className="font-semibold text-slate-900">Why presets matter:</span> the same network can feel different depending on whether you prioritize discovery or caution.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2" data-testid="row-settings-preset-actions">
                  {hasUnsavedChanges || saveState === "saved" ? (
                    <div className="flex items-center gap-2">
                      <div
                        className={
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
                          (hasUnsavedChanges
                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-900"
                            : "bg-emerald-50 border-emerald-100 text-emerald-700")
                        }
                        data-testid="badge-settings-save-status"
                      >
                        <span className={"h-1 w-1 rounded-full " + (hasUnsavedChanges ? "bg-indigo-900" : "bg-emerald-500")} />
                        <span data-testid="text-settings-save-status">{hasUnsavedChanges ? "Unsaved" : "Saved"}</span>
                      </div>

                      {hasUnsavedChanges ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 rounded-lg text-[11px] font-bold text-slate-600 no-default-hover-elevate no-default-active-elevate hover:text-indigo-800 hover:bg-indigo-800/5"
                            onClick={() => { setDraftPreset(savedPreset); setSaveState("idle"); }}
                            data-testid="button-settings-reset"
                          >
                            Reset
                          </Button>
                          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                            <Button
                              className="h-8 px-4 rounded-lg bg-indigo-800 hover:bg-indigo-900 shadow-lg shadow-indigo-800/15"
                              disabled={saveState === "saving"}
                              onClick={() => setConfirmOpen(true)}
                              data-testid="button-settings-save"
                            >
                              {saveState === "saving" ? "Saving\u2026" : "Save"}
                            </Button>
                            <AlertDialogContent
                              className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-indigo-500/25 bg-white/92 backdrop-blur-xl shadow-[0_44px_120px_-60px_rgba(15,23,42,0.55)] p-0 overflow-hidden"
                              data-testid="dialog-confirm-recalculate"
                            >
                              <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute -top-28 -right-28 h-[320px] w-[320px] rounded-full bg-indigo-500/18 blur-[80px]" />
                                <div className="absolute -bottom-28 -left-28 h-[340px] w-[340px] rounded-full bg-indigo-800/12 blur-[90px]" />
                                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500" />
                              </div>
                              <div className="relative p-4 sm:p-5">
                                <AlertDialogHeader className="space-y-2">
                                  <div className="flex items-start gap-3">
                                    <div className="h-9 w-9 rounded-2xl bg-indigo-800/10 border border-indigo-800/10 flex items-center justify-center shadow-[0_12px_26px_-18px_rgba(99,102,241,0.22)] shrink-0" data-testid="icon-confirm-recalculate">
                                      <BrainIcon size={18} className="text-indigo-800" />
                                    </div>
                                    <div className="min-w-0">
                                      <AlertDialogTitle className="text-[15px] sm:text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-recalculate-title">
                                        Recalculate GrapeRank?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription className="text-[12px] sm:text-[13px] text-slate-600 leading-relaxed" data-testid="text-confirm-recalculate-desc">
                                        This will re-run your network calculation.
                                      </AlertDialogDescription>
                                    </div>
                                  </div>
                                </AlertDialogHeader>

                                <div className="mt-3 rounded-xl border border-indigo-500/18 bg-white/70 px-3 py-2 shadow-[0_12px_28px_-22px_rgba(99,102,241,0.18)]" data-testid="card-confirm-recalculate-summary">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-slate-500" data-testid="text-confirm-recalculate-kicker">Applying</div>
                                      <div className="mt-1 text-[13px] font-semibold text-slate-900" data-testid="text-confirm-recalculate-preset">{activePreset.label}</div>
                                    </div>
                                    <div className="shrink-0 inline-flex items-center rounded-full bg-indigo-800 text-white px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] uppercase" data-testid="badge-confirm-recalculate-impact">Recalculate</div>
                                  </div>
                                  <p className="mt-2 text-[11px] text-slate-500 leading-relaxed" data-testid="text-confirm-recalculate-disclaimer">By clicking &quot;Apply preset,&quot; you will run and save new calculation scores.</p>
                                </div>

                                <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
                                  <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-recalculate-cancel">Keep current</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-xl bg-indigo-800 hover:bg-indigo-900"
                                    onClick={() => {
                                      setConfirmOpen(false);
                                      setSaveState("saving");
                                      window.setTimeout(() => {
                                        setSavedPreset(draftPreset);
                                        setSaveState("saved");
                                        window.setTimeout(() => setSaveState("idle"), 900);
                                      }, 450);
                                    }}
                                    data-testid="button-confirm-recalculate-continue"
                                  >
                                    Apply preset
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </div>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 space-y-3" data-testid="section-settings-preset-selector">
                <div
                  className="mt-6 w-full grid grid-cols-3 h-auto p-1 bg-slate-100/50 rounded-lg border border-slate-200/50"
                  role="radiogroup"
                  aria-label="Trust perspective preset"
                  data-testid="segmented-settings-presets"
                >
                  {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
                    const selected = draftPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setDraftPreset(key); setSaveState("idle"); }}
                        className={
                          "py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 rounded-md " +
                          (selected ? "bg-indigo-800 text-white shadow-sm" : "text-slate-500 hover:bg-white")
                        }
                        role="radio"
                        aria-checked={selected}
                        data-testid={`toggle-preset-${key}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide">
                              {key === "permissive" ? "Relax" : key === "balanced" ? "Default" : "Strict"}
                            </span>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            {selected ? (
                              <div className="h-6 w-6 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center" data-testid={`icon-toggle-selected-${key}`}>
                                <BrainIcon size={14} className="text-white" />
                              </div>
                            ) : (
                              <div className="h-6 w-6 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm" data-testid={`icon-toggle-unselected-${key}`}>
                                <span className="h-2 w-2 rounded-full bg-slate-300" />
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-indigo-500/20 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(99,102,241,0.10)] overflow-hidden relative" data-testid="card-settings-preset-details">
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />
                    <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-indigo-500/15 to-transparent" />
                  </div>
                  <div className="p-3.5 sm:p-4 relative">
                    <div className="relative">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold tracking-wider uppercase text-slate-500" data-testid="text-preset-details-kicker">Current preset</p>
                          <h3 className="mt-1 text-[15px] font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-preset-details-title">{activePreset.label}</h3>
                          <p className="mt-1 text-[13px] text-slate-600 leading-relaxed" data-testid="text-preset-details-desc">{activePreset.description}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2" data-testid="row-preset-details-indicator">
                          <div className="h-8 w-8 rounded-2xl bg-indigo-800/10 border border-indigo-800/10 flex items-center justify-center shadow-[0_12px_26px_-18px_rgba(99,102,241,0.22)]" data-testid="icon-preset-details-selected">
                            <BrainIcon size={18} className="text-indigo-800" />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-indigo-500/22 bg-white/70 p-3 shadow-[0_0_0_1px_rgba(99,102,241,0.06),0_14px_32px_-26px_rgba(99,102,241,0.25)] relative overflow-hidden" data-testid="panel-preset-details-what-it-does">
                        <div className="relative">
                          <p className="text-[10px] font-bold tracking-wider uppercase text-indigo-800" data-testid="text-preset-details-short">{activePreset.short}</p>
                          <p className="mt-1 text-[12px] text-slate-600 leading-relaxed" data-testid="text-preset-details-feels">{activePreset.education.howItFeels}</p>
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" data-testid="row-preset-details-chips">
                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-800 border border-indigo-800/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(99,102,241,0.45)]" data-testid="chip-preset-details-graph">Graph signal: {activePreset.defaults.requireGraphSignal ? "required" : "optional"}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-800 border border-indigo-800/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(99,102,241,0.45)]" data-testid="chip-preset-details-flags">Flag penalty: {activePreset.defaults.flaggedPenalty}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-800 border border-indigo-800/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(99,102,241,0.45)]" data-testid="chip-preset-details-hops">Hops: {activePreset.defaults.hopMin}&ndash;{activePreset.defaults.hopMax}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-800 border border-indigo-800/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(99,102,241,0.45)]" data-testid="chip-preset-details-nip05">NIP-05: {activePreset.defaults.allowNip05Boost ? "on" : "off"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3" data-testid="section-settings-perspective">
                <div className="rounded-2xl border border-indigo-500/20 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(99,102,241,0.10)] overflow-hidden relative p-3.5" data-testid="card-settings-perspective">
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />
                    <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-indigo-500/15 to-transparent" />
                  </div>
                  <div className="flex items-start gap-3 relative">
                    <div className="h-9 w-9 rounded-2xl bg-indigo-800 border border-indigo-800/40 flex items-center justify-center shrink-0 shadow-[0_18px_40px_-24px_rgba(99,102,241,0.55)]">
                      <BrainIcon size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-500" data-testid="text-settings-perspective-kicker">What changes with this preset</p>
                      <ul className="mt-2 space-y-1.5 text-[13px] text-slate-700" data-testid="list-settings-perspective">
                        {activePreset.education.whatChanges.map((line, idx) => (
                          <li key={idx} className="flex items-start gap-2" data-testid={`item-settings-perspective-${idx}`}>
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.55)]" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
