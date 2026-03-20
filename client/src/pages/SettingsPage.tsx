import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getActivePreset, setActivePreset, setCustomThreshold, getCustomThreshold, PRESET_THRESHOLDS, type TrustPreset } from "@/services/trustThreshold";
import PageBackground from "@/components/PageBackground";
import { Button } from "@/components/ui/button";
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
  BookOpen,
  Users,
  Check,
  Loader2,
  ArrowRight,
  Clock,
  RefreshCw,
  Info,
  Code2,
  Mail,
  HelpCircle,
  ExternalLink,
  Globe,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
import { getCurrentUser, logout, signNip85, signNip85Deactivation, publishToRelays, type NostrUser } from "@/services/nostr";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";

export default function SettingsPage() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [nip85ConfirmOpen, setNip85ConfirmOpen] = useState(false);
  const [republishState, setRepublishState] = useState<"idle" | "signing" | "publishing" | "success" | "error">("idle");
  const [republishError, setRepublishError] = useState("");
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [deactivateState, setDeactivateState] = useState<"idle" | "signing" | "publishing" | "success" | "error">("idle");
  const [deactivateError, setDeactivateError] = useState("");
  const [activePreset, setActivePresetState] = useState<TrustPreset>(getActivePreset());
  const [customValue, setCustomValue] = useState<string>(() => {
    const stored = getCustomThreshold();
    return stored !== null ? stored.toFixed(2) : "0.05";
  });
  const { toast } = useToast();

  const currentThreshold = activePreset === "custom"
    ? (getCustomThreshold() ?? PRESET_THRESHOLDS.default)
    : PRESET_THRESHOLDS[activePreset];

  const handlePresetChange = useCallback((preset: Exclude<TrustPreset, "custom">) => {
    setActivePreset(preset);
    setActivePresetState(preset);
    setCustomThreshold(null);
    setCustomValue(PRESET_THRESHOLDS[preset].toFixed(2));
    toast({
      title: "Trust perspective updated",
      description: `Switched to ${preset === "relax" ? "Relax" : preset === "strict" ? "Strict" : "Default"} (verified threshold: ≥ ${PRESET_THRESHOLDS[preset].toFixed(2)})`,
      duration: 2000,
    });
  }, [toast]);

  const handleCustomValueCommit = useCallback((rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
    setCustomThreshold(clamped);
    setActivePreset("custom");
    setActivePresetState("custom");
    setCustomValue(clamped.toFixed(2));
    toast({
      title: "Custom threshold set",
      description: `Verified threshold: ≥ ${clamped.toFixed(2)}`,
      duration: 2000,
    });
  }, [toast]);

  const nip85Activated = localStorage.getItem("brainstorm_nip85_activated") === "true";

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/", { replace: true });
      return;
    }
    setUser(u);
  }, [navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const { data: selfData, isPending: selfLoading } = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: grapeRankData, isPending: grapeRankLoading } = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const triggerGrapeRankMutation = useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: (data) => {
      if (data?.data && typeof data.data === "object") {
        queryClient.setQueryData(["/api/auth/graperankResult"], data);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/graperankResult"] });
      toast({
        title: "Recalculation started",
        description: "Your trust scores are being recalculated. Redirecting to dashboard...",
        duration: 4000,
      });
      setTimeout(() => navigate("/dashboard"), 600);
    },
    onError: () => {
      toast({
        title: "Recalculation failed",
        description: "Something went wrong triggering the recalculation. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const handleRepublishNip85 = async () => {
    setRepublishState("signing");
    setRepublishError("");

    if (!window.nostr) {
      setRepublishState("error");
      setRepublishError("No Nostr extension found. Please install a NIP-07 compatible extension.");
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setRepublishState("error");
      setRepublishError("Not logged in.");
      return;
    }

    if (!taPubkey) {
      setRepublishState("error");
      setRepublishError("Service key not available. Please wait for data to load and try again.");
      return;
    }

    let signedEvent: Record<string, unknown>;
    try {
      signedEvent = await signNip85(taPubkey, "wss://nip85.nosfabrica.com");
    } catch {
      setRepublishState("idle");
      toast({ title: "Signing cancelled", description: "The event was not signed.", duration: 3000 });
      return;
    }

    setRepublishState("publishing");
    const result = await publishToRelays(signedEvent);

    if (result.success) {
      localStorage.setItem("brainstorm_nip85_activated", "true");
      setRepublishState("success");
      toast({ title: "NIP-85 event updated", description: "Your service provider declaration has been re-published.", duration: 4000 });
      setTimeout(() => setRepublishState("idle"), 3000);
    } else {
      setRepublishState("error");
      setRepublishError(result.error || "Failed to publish to relays. Please try again.");
    }
  };

  const handleDeactivateNip85 = async () => {
    setDeactivateState("signing");
    setDeactivateError("");

    if (!window.nostr) {
      setDeactivateState("error");
      setDeactivateError("No Nostr extension found. Please install a NIP-07 compatible extension.");
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setDeactivateState("error");
      setDeactivateError("Not logged in.");
      return;
    }

    let signedEvent: Record<string, unknown>;
    try {
      signedEvent = await signNip85Deactivation();
    } catch {
      setDeactivateState("idle");
      toast({ title: "Signing cancelled", description: "The event was not signed.", duration: 3000 });
      return;
    }

    setDeactivateState("publishing");
    const result = await publishToRelays(signedEvent);

    if (result.success) {
      localStorage.removeItem("brainstorm_nip85_activated");
      setDeactivateState("success");
      toast({ title: "Provider deactivated", description: "Brainstorm has been removed as your WoT service provider.", duration: 4000 });
      setTimeout(() => {
        setDeactivateState("idle");
        window.location.reload();
      }, 2000);
    } else {
      setDeactivateState("error");
      setDeactivateError(result.error || "Failed to publish to relays. Please try again.");
    }
  };

  const calcDone = grapeRankData?.data?.internal_publication_status === "success";
  const isRecalcInProgress = grapeRankData?.data?.internal_publication_status === "waiting" || grapeRankData?.data?.status === "waiting";
  const isGrapeRankFailedState = (typeof grapeRankData?.data?.status === "string" && grapeRankData.data.status.toLowerCase() === "failure") || (typeof grapeRankData?.data?.ta_status === "string" && grapeRankData.data.ta_status.toLowerCase() === "failure");
  const grapeRankStatus = grapeRankData?.data?.ta_status || grapeRankData?.data?.status || null;
  const lastCalculated = selfData?.data?.history?.last_time_calculated_graperank || grapeRankData?.data?.updated_at || null;
  const lastTriggered = selfData?.data?.history?.last_time_triggered_graperank || grapeRankData?.data?.created_at || null;
  const taPubkey = selfData?.data?.history?.ta_pubkey || null;
  const settingsNetwork = selfData?.graph || null;
  const hasNoFollowing = !selfLoading && selfData !== undefined && settingsNetwork !== null && Array.isArray(settingsNetwork?.following) && settingsNetwork.following.length === 0;

  if (!user || isAuthRedirecting()) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-settings">
      <PageBackground />

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
                  <BrainLogo size={20} className="text-indigo-200" />
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
                <BrainLogo size={28} className="text-indigo-500" />
                <span className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">Brainstorm</span>
              </button>

              <div className="hidden lg:flex gap-1" data-testid="nav-settings-tabs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-nav-dashboard"
                >
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                  onClick={() => navigate("/search")}
                  data-testid="button-nav-search"
                >
                  <Search className="h-4 w-4" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`gap-2 rounded-md no-default-hover-elevate no-default-active-elevate transition-all duration-200 ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/[0.06]" : "text-slate-600 opacity-40 cursor-not-allowed"}`}
                  onClick={() => calcDone && navigate("/network")}
                  disabled={!calcDone}
                  title={!calcDone ? "Available after calculation completes" : undefined}
                  data-testid="button-nav-network"
                >
                  <Users className="h-4 w-4" />
                  Network
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
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>FAQ</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
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

      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        currentPath={location}
        navigate={navigate}
        calcDone={calcDone}
        user={user}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">
        <div className="space-y-6 animate-fade-up" data-testid="container-settings">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-settings-header">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit" data-testid="pill-settings-kicker">
                <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
                <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase" data-testid="text-settings-kicker">Brainstorm Settings</p>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-settings-title">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Settings
                </span>
              </h1>
              <p className="text-slate-600 font-medium" data-testid="text-settings-subtitle">
                Manage your Brainstorm service provider and trust calculations.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 relative" data-testid="card-settings-service-provider">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
              <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4 transition-colors duration-500">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                    <BrainLogo size={18} className="text-[#333286]" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sp-title">Service Provider</h2>
                    <p className="text-xs text-slate-500" data-testid="text-sp-subtitle">NIP-85 Web of Trust declaration</p>
                  </div>
                </div>
              </div>

              <div className="p-5">
                {selfLoading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="h-3 w-16 bg-slate-200 rounded" />
                      <div className="h-6 w-20 bg-slate-200 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-full bg-slate-100 rounded" />
                      <div className="h-3 w-3/4 bg-slate-100 rounded" />
                    </div>
                  </div>
                ) : nip85Activated ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between" data-testid="row-sp-status">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200" data-testid="badge-sp-active">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Active</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between" data-testid="row-sp-provider">
                        <span className="text-xs text-slate-500">Provider</span>
                        <span className="text-xs font-semibold text-slate-900">Brainstorm</span>
                      </div>
                      <div className="flex items-center justify-between" data-testid="row-sp-event">
                        <span className="text-xs text-slate-500">Event kind</span>
                        <span className="text-xs font-mono text-slate-600">10040</span>
                      </div>
                      {lastCalculated && (
                        <div className="flex items-center justify-between" data-testid="row-sp-since">
                          <span className="text-xs text-slate-500">Active since</span>
                          <span className="text-xs text-slate-600">
                            {new Date(lastCalculated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between" data-testid="row-sp-supported">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Supported by</span>
                          <div className="relative group/info">
                            <button
                              type="button"
                              className="h-4 w-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/40"
                              onClick={(e) => e.currentTarget.focus()}
                              aria-label="What are Supported Clients?"
                              data-testid="button-supported-by-info"
                            >
                              <Info className="h-2.5 w-2.5" />
                            </button>
                            <div className="fixed left-4 right-4 top-1/2 -translate-y-1/2 sm:absolute sm:top-auto sm:left-0 sm:right-auto sm:translate-y-0 sm:bottom-full sm:mb-2 sm:w-80 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-xs text-slate-200 leading-relaxed opacity-0 invisible group-focus-within/info:opacity-100 group-focus-within/info:visible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 z-[100] pointer-events-none group-focus-within/info:pointer-events-auto group-hover/info:pointer-events-auto" data-testid="tooltip-supported-by">
                              These are Nostr clients that use personalized trust scores calculated by Brainstorm and other Web of Trust Service Providers via NIP-85: Trusted Assertions or other integration methods.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <a href="https://amethyst.social/#" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 transition-colors">Amethyst</a>
                          <span className="text-[10px] text-slate-400">&middot;</span>
                          <a href="https://www.nostria.app/" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors">Nostria</a>
                        </div>
                      </div>
                    </div>

                    {republishState === "error" && republishError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-sp-republish-error">
                        <p className="text-xs text-red-700 font-medium">{republishError}</p>
                      </div>
                    )}

                    {republishState === "success" && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="alert-sp-republish-success">
                        <p className="text-xs text-emerald-700 font-medium">NIP-85 event updated successfully.</p>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <AlertDialog open={nip85ConfirmOpen} onOpenChange={setNip85ConfirmOpen}>
                        <button
                          type="button"
                          onClick={() => setNip85ConfirmOpen(true)}
                          disabled={republishState === "signing" || republishState === "publishing" || republishState === "success" || !taPubkey}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
                          data-testid="button-sp-republish"
                        >
                          {republishState === "signing" || republishState === "publishing" ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {republishState === "signing" ? "Signing..." : "Publishing..."}
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3.5 w-3.5" />
                              Update NIP-85 Event
                            </>
                          )}
                        </button>
                        <AlertDialogContent
                          className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-[#7c86ff]/20 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(124,134,255,0.10)] p-0 overflow-hidden"
                          data-testid="dialog-confirm-nip85-update"
                        >
                          <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
                            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#7c86ff]/15 to-transparent" />
                          </div>
                          <div className="relative p-4 sm:p-5">
                            <AlertDialogHeader className="space-y-2">
                              <div className="flex items-start gap-3">
                                <div className="h-9 w-9 rounded-2xl bg-[#333286]/10 border border-[#333286]/10 flex items-center justify-center shadow-[0_12px_26px_-18px_rgba(124,134,255,0.22)] shrink-0" data-testid="icon-confirm-nip85-update">
                                  <BrainLogo size={18} className="text-[#333286]" />
                                </div>
                                <div className="min-w-0">
                                  <AlertDialogTitle className="text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-nip85-title">
                                    Update NIP-85 Event?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-sm text-slate-600 leading-relaxed" data-testid="text-confirm-nip85-desc">
                                    This will re-sign and republish your Brainstorm service provider event to Nostr relays. This is useful if your previous event wasn't picked up by all relays, or if you want to refresh your service provider status.
                                  </AlertDialogDescription>
                                </div>
                              </div>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
                              <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-nip85-cancel">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl bg-[#3730a3] hover:bg-[#312e81]"
                                onClick={() => {
                                  setNip85ConfirmOpen(false);
                                  handleRepublishNip85();
                                }}
                                data-testid="button-confirm-nip85-continue"
                              >
                                Update
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog open={deactivateConfirmOpen} onOpenChange={setDeactivateConfirmOpen}>
                        <button
                          type="button"
                          onClick={() => setDeactivateConfirmOpen(true)}
                          disabled={deactivateState === "signing" || deactivateState === "publishing" || deactivateState === "success"}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
                          data-testid="button-sp-deactivate"
                        >
                          {deactivateState === "signing" || deactivateState === "publishing" ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {deactivateState === "signing" ? "Signing..." : "Publishing..."}
                            </>
                          ) : (
                            <>
                              <X className="h-3.5 w-3.5" />
                              Deactivate
                            </>
                          )}
                        </button>
                        <AlertDialogContent
                          className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-red-200/40 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(239,68,68,0.10)] p-0 overflow-hidden"
                          data-testid="dialog-confirm-nip85-deactivate"
                        >
                          <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
                            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-red-500/10 to-transparent" />
                          </div>
                          <div className="relative p-4 sm:p-5">
                            <AlertDialogHeader className="space-y-2">
                              <div className="flex items-start gap-3">
                                <div className="h-9 w-9 rounded-2xl bg-red-50 border border-red-200/60 flex items-center justify-center shrink-0" data-testid="icon-confirm-nip85-deactivate">
                                  <X className="h-4 w-4 text-red-500" />
                                </div>
                                <div className="min-w-0">
                                  <AlertDialogTitle className="text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-deactivate-title">
                                    Deactivate Service Provider?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-sm text-slate-600 leading-relaxed" data-testid="text-confirm-deactivate-desc">
                                    This will publish an event to Nostr relays removing Brainstorm as your WoT service provider. Compatible clients like Amethyst and Nostria will no longer use Brainstorm for your trust scores. Your data inside Brainstorm will not be affected.
                                  </AlertDialogDescription>
                                </div>
                              </div>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
                              <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-deactivate-cancel">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                                onClick={() => {
                                  setDeactivateConfirmOpen(false);
                                  handleDeactivateNip85();
                                }}
                                data-testid="button-confirm-deactivate-continue"
                              >
                                Deactivate
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    {deactivateState === "error" && deactivateError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-sp-deactivate-error">
                        <p className="text-xs text-red-700 font-medium">{deactivateError}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between" data-testid="row-sp-status-inactive">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200" data-testid="badge-sp-inactive">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Not active</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed" data-testid="text-sp-inactive-desc">
                      No WoT service provider has been selected. Activate Brainstorm as your provider to publish trust scores across the Nostr ecosystem.
                    </p>

                    {hasNoFollowing && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200/60" data-testid="banner-sp-no-follows">
                        <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <p className="text-xs text-amber-700 font-medium">Follow some people on Nostr first to activate this feature.</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => navigate("/dashboard")}
                      disabled={hasNoFollowing}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      data-testid="button-sp-go-to-dashboard"
                    >
                      Go to Dashboard
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 relative" data-testid="card-settings-graperank">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
              <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4 transition-colors duration-500">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#333286]">
                      <path d="M14.4209 5.63965H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path opacity="0.4" d="M2.2998 5.64062H9.5798" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path opacity="0.4" d="M14.4209 15.3301H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path opacity="0.4" d="M14.4209 21.3896H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M18.0894 9.27V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2.2998 22.0005L9.5798 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9.5798 22.0005L2.2998 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-gr-title">Trust Calculation</h2>
                    <p className="text-xs text-slate-500" data-testid="text-gr-subtitle">GrapeRank network analysis</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {grapeRankLoading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="h-3 w-16 bg-slate-200 rounded" />
                      <div className="h-6 w-24 bg-slate-200 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-full bg-slate-100 rounded" />
                      <div className="h-3 w-2/3 bg-slate-100 rounded" />
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <div className="h-8 w-40 bg-slate-200 rounded-xl" />
                    </div>
                  </div>
                ) : (
                  <>
                <div className="flex items-center justify-between" data-testid="row-gr-status">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                  {grapeRankStatus === "success" ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200" data-testid="badge-gr-success">
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Complete</span>
                    </div>
                  ) : grapeRankStatus ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200" data-testid="badge-gr-pending">
                      <Clock className="h-3 w-3 text-amber-600" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">{grapeRankStatus}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200" data-testid="badge-gr-none">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">No data</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {lastCalculated && (
                    <div className="flex items-center justify-between" data-testid="row-gr-last-calculated">
                      <span className="text-xs text-slate-500">Last calculated</span>
                      <span className="text-xs text-slate-600">
                        {new Date(typeof lastCalculated === "string" && !lastCalculated.endsWith("Z") ? lastCalculated + "Z" : lastCalculated).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  {lastTriggered && (
                    <div className="flex items-center justify-between" data-testid="row-gr-last-triggered">
                      <span className="text-xs text-slate-500">Last triggered</span>
                      <span className="text-xs text-slate-600">
                        {new Date(typeof lastTriggered === "string" && !lastTriggered.endsWith("Z") ? lastTriggered + "Z" : lastTriggered).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between" data-testid="row-gr-algorithm">
                    <span className="text-xs text-slate-500">Algorithm</span>
                    <span className="text-xs font-mono text-slate-600">{grapeRankData?.data?.algorithm || "graperank"}</span>
                  </div>
                </div>

                {isGrapeRankFailedState && !triggerGrapeRankMutation.isSuccess && !isRecalcInProgress && !triggerGrapeRankMutation.isPending && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5" data-testid="alert-gr-failed-state">
                    <p className="text-xs text-amber-800 font-medium">Your last calculation didn't complete successfully. You can try again below.</p>
                  </div>
                )}

                {triggerGrapeRankMutation.isError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-gr-error">
                    <p className="text-xs text-red-700 font-medium">{triggerGrapeRankMutation.error?.message || "Something went wrong."}</p>
                  </div>
                )}

                {triggerGrapeRankMutation.isSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="alert-gr-success">
                    <p className="text-xs text-emerald-700 font-medium">Recalculation triggered. This typically takes 10-20 minutes.</p>
                  </div>
                )}

                {hasNoFollowing && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200/60 mb-3" data-testid="banner-gr-no-follows">
                    <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">Follow some people on Nostr first to calculate trust scores.</p>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100">
                  <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
                    <button
                      type="button"
                      disabled={triggerGrapeRankMutation.isPending || isRecalcInProgress || hasNoFollowing}
                      onClick={() => setRecalcConfirmOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      data-testid="button-gr-recalculate"
                    >
                      {triggerGrapeRankMutation.isPending || isRecalcInProgress ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Recalculating...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
                            <path d="M14.4209 5.63965H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path opacity="0.4" d="M2.2998 5.64062H9.5798" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M18.0894 9.27V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2.2998 22.0005L9.5798 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M9.5798 22.0005L2.2998 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Recalculate GrapeRank
                        </>
                      )}
                    </button>
                    <AlertDialogContent
                      className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-[#7c86ff]/20 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(124,134,255,0.10)] p-0 overflow-hidden"
                      data-testid="dialog-confirm-recalculate-settings"
                    >
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
                        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#7c86ff]/15 to-transparent" />
                      </div>
                      <div className="relative p-4 sm:p-5">
                        <AlertDialogHeader className="space-y-2">
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-2xl bg-[#333286]/10 border border-[#333286]/10 flex items-center justify-center shadow-[0_12px_26px_-18px_rgba(124,134,255,0.22)] shrink-0" data-testid="icon-confirm-recalculate-settings">
                              <BrainLogo size={18} className="text-[#333286]" />
                            </div>
                            <div className="min-w-0">
                              <AlertDialogTitle className="text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-recalculate-settings-title">
                                Recalculate GrapeRank?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-sm text-slate-600 leading-relaxed" data-testid="text-confirm-recalculate-settings-desc">
                                This re-runs your full network trust calculation. It typically takes 10-20 minutes and your current scores will be replaced with updated results.
                              </AlertDialogDescription>
                            </div>
                          </div>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
                          <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-recalculate-settings-cancel">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-xl bg-[#3730a3] hover:bg-[#312e81]"
                            onClick={() => {
                              setRecalcConfirmOpen(false);
                              triggerGrapeRankMutation.mutate();
                            }}
                            data-testid="button-confirm-recalculate-settings-continue"
                          >
                            Recalculate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </div>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 relative" data-testid="card-settings-presets">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
            <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4 transition-colors duration-500">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#333286]">
                    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-presets-title">Trust Perspective</h2>
                  <p className="text-xs text-slate-500" data-testid="text-presets-subtitle">Tune how Brainstorm weights trust signals</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed" data-testid="text-presets-desc">
                Adjust how strict the verified threshold is across Brainstorm. This controls which accounts appear as "verified" on Dashboard, Network, and Profile pages.
              </p>

              <div className="grid grid-cols-3 gap-2" data-testid="row-presets-chips">
                {([
                  { key: "relax" as const, label: "Relax", desc: "More trusting" },
                  { key: "default" as const, label: "Default", desc: "Balanced" },
                  { key: "strict" as const, label: "Strict", desc: "Safety-first" },
                ]).map((preset) => {
                  const isActive = activePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => handlePresetChange(preset.key)}
                      className={
                        "rounded-xl border px-3 py-2.5 text-center transition-all duration-200 cursor-pointer " +
                        (isActive
                          ? "border-[#7c86ff]/30 bg-[#333286]/5 ring-1 ring-[#7c86ff]/20"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100")
                      }
                      data-testid={`chip-preset-${preset.key}`}
                    >
                      <span className={
                        "text-xs font-bold block " +
                        (isActive ? "text-[#333286]" : "text-slate-500")
                      }>{preset.label}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{preset.desc}</span>
                      <span className={
                        "text-[10px] font-mono block mt-1 " +
                        (isActive ? "text-[#7c86ff]" : "text-slate-400")
                      }>≥ {PRESET_THRESHOLDS[preset.key].toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3" data-testid="input-custom-threshold-section">
                <label className="text-xs font-semibold text-slate-700 block mb-2">Custom Threshold</label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-mono shrink-0">≥</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onBlur={(e) => handleCustomValueCommit(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCustomValueCommit((e.target as HTMLInputElement).value); }}
                    className={
                      "w-24 rounded-lg border px-3 py-1.5 text-sm font-mono text-center transition-all outline-none " +
                      (activePreset === "custom"
                        ? "border-[#7c86ff]/40 bg-[#333286]/5 text-[#333286] ring-1 ring-[#7c86ff]/20 focus:ring-2 focus:ring-[#7c86ff]/30"
                        : "border-slate-200 bg-slate-50 text-slate-600 focus:border-[#7c86ff]/40 focus:ring-1 focus:ring-[#7c86ff]/20")
                    }
                    data-testid="input-custom-threshold"
                  />
                  <span className="text-[11px] text-slate-400">Enter a value between 0.00 and 1.00</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" data-testid="callout-presets-detail">
                <p className="text-xs text-slate-500 leading-relaxed">
                  <span className="font-semibold text-slate-700">Current verified threshold:</span> ≥ {currentThreshold.toFixed(2)}{activePreset === "custom" ? " (custom)" : ""} — accounts with a trust assertion score below this are marked as unverified.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 relative" data-testid="section-contact-support">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
            <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4 transition-colors duration-500">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-[#333286]" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-contact-support-title">Contact & Support</h2>
                  <p className="text-xs text-slate-500" data-testid="text-contact-support-subtitle">Developer outreach and general inquiries</p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#7c86ff]/15 bg-white/80 backdrop-blur-sm p-5 hover:border-[#7c86ff]/30 hover:shadow-sm transition-all duration-300" data-testid="card-list-your-client">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                      <Code2 className="h-4 w-4 text-[#333286]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-list-client-title">List Your Client</h3>
                      <p className="text-xs text-slate-500" data-testid="text-list-client-subtitle">Get featured on Brainstorm</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-4" data-testid="text-list-client-description">
                    Built a Nostr client that supports NIP-85? Get your app featured on our Supported Clients showcase — free promotion to our growing user base.
                  </p>
                  <a
                    href="mailto:support@nosfabrica.com?subject=NIP-85%20Client%20Listing"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#333286] hover:text-[#7c86ff] transition-colors"
                    data-testid="link-list-client-email"
                  >
                    <Mail className="h-4 w-4" />
                    support@nosfabrica.com
                  </a>
                  <p className="text-xs text-slate-400 mt-2" data-testid="text-list-client-helper">Include your client name, platform, and a brief description</p>
                </div>

                <div className="rounded-xl border border-[#7c86ff]/15 bg-white/80 backdrop-blur-sm p-5 hover:border-[#7c86ff]/30 hover:shadow-sm transition-all duration-300" data-testid="card-get-in-touch">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                      <Mail className="h-4 w-4 text-[#333286]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-get-in-touch-title">Get in Touch</h3>
                      <p className="text-xs text-slate-500" data-testid="text-get-in-touch-subtitle">Questions, feedback, or support</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-4" data-testid="text-get-in-touch-description">
                    Have questions, feedback, or need help with Brainstorm? We'd love to hear from you.
                  </p>
                  <a
                    href="mailto:support@nosfabrica.com?subject=Brainstorm%20Support"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#333286] hover:text-[#7c86ff] transition-colors"
                    data-testid="link-get-in-touch-email"
                  >
                    <Mail className="h-4 w-4" />
                    support@nosfabrica.com
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 relative" data-testid="section-about">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
            <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4 transition-colors duration-500">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                  <BrainLogo size={18} className="text-[#333286]" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-about-title">About Brainstorm</h2>
                  <p className="text-xs text-slate-500" data-testid="text-about-subtitle">Open-source Web of Trust by NosFabrica</p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <a
                  href="https://github.com/NosFabrica"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-[#7c86ff]/15 bg-white/80 backdrop-blur-sm px-4 py-3.5 hover:border-[#7c86ff]/30 hover:shadow-sm transition-all duration-300 group/link"
                  data-testid="link-github"
                >
                  <div className="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 group-hover/link:bg-slate-800 transition-colors">
                    <SiGithub className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-slate-900 block" data-testid="text-github-label">GitHub</span>
                    <span className="text-[11px] text-slate-400">Source code & contributions</span>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover/link:text-[#7c86ff] transition-colors shrink-0" />
                </a>

                <a
                  href="https://brainstorm.nosfabrica.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-[#7c86ff]/15 bg-white/80 backdrop-blur-sm px-4 py-3.5 hover:border-[#7c86ff]/30 hover:shadow-sm transition-all duration-300 group/link"
                  data-testid="link-website"
                >
                  <div className="h-9 w-9 rounded-xl bg-[#333286] flex items-center justify-center shrink-0 group-hover/link:bg-[#7c86ff] transition-colors">
                    <Globe className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-slate-900 block" data-testid="text-website-label">Website</span>
                    <span className="text-[11px] text-slate-400">Learn about Brainstorm</span>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover/link:text-[#7c86ff] transition-colors shrink-0" />
                </a>

                <a
                  href="https://njump.me/npub1qlkwmzmrhzpuak7c2g9akvcrh8wt0grczp5rz0af5v9wmwlnz8pszfhsev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-[#7c86ff]/15 bg-white/80 backdrop-blur-sm px-4 py-3.5 hover:border-[#7c86ff]/30 hover:shadow-sm transition-all duration-300 group/link"
                  data-testid="link-nostr"
                >
                  <div className="h-9 w-9 rounded-xl bg-purple-600 flex items-center justify-center shrink-0 group-hover/link:bg-purple-500 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-slate-900 block" data-testid="text-nostr-label">Nostr</span>
                    <span className="text-[11px] text-slate-400">Follow us on Nostr</span>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover/link:text-[#7c86ff] transition-colors shrink-0" />
                </a>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] text-slate-400" data-testid="text-about-copyright">
                  Built by <span className="font-semibold text-slate-500">NosFabrica</span> — open-source under MIT license
                </p>
                <span className="text-[10px] font-mono text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100" data-testid="text-about-version">v1.0</span>
              </div>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
}
