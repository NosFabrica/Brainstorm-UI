import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Zap,
  LogOut,
  User as UserIcon,
  Copy,
  Check,
  Loader2,
  TrendingUp,
  Users,
  UserPlus,
  UserMinus,
  VolumeX,
  ShieldAlert,
  Star,
  Play,
  Settings,
  Home,
  Info,
  RefreshCw,
  Network,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { apiClient } from "@/services/api";

function BrainIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-indigo-400">
      <g clipPath="url(#clip0_dash)">
        <path d="M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z" stroke="currentColor" strokeMiterlimit="10" />
        <path d="M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
        <path d="M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
        <path d="M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z" stroke="currentColor" strokeMiterlimit="10" />
        <path d="M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z" stroke="currentColor" strokeMiterlimit="10" />
        <path d="M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z" stroke="currentColor" strokeMiterlimit="10" />
        <path d="M11.9492 2.5V2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.9492 21.5508V21.5508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M1.5 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22.4492 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id="clip0_dash">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

const NETWORK_METRICS = [
  { key: "followed_by", label: "Followers", icon: UserPlus, color: "text-emerald-500" },
  { key: "following", label: "Following", icon: Users, color: "text-indigo-500" },
  { key: "muted_by", label: "Muted By", icon: VolumeX, color: "text-amber-500" },
  { key: "muting", label: "Muting", icon: UserMinus, color: "text-slate-500" },
  { key: "reported_by", label: "Reported By", icon: ShieldAlert, color: "text-red-500" },
  { key: "reporting", label: "Reporting", icon: ShieldAlert, color: "text-orange-500" },
] as const;

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/");
      return;
    }
    setUser(u);
  }, [navigate]);

  const hasToken = !!localStorage.getItem("brainstorm_session_token");

  const selfQuery = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user && hasToken,
    retry: false,
  });

  const grapeRankQuery = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user && hasToken,
    retry: false,
  });

  const triggerGrapeRankMutation = useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/graperankResult"] });
      setTimeout(() => triggerGrapeRankMutation.reset(), 5000);
    },
    onError: () => {
      setTimeout(() => triggerGrapeRankMutation.reset(), 5000);
    },
  });

  const selfData = selfQuery.data?.data;
  const network = selfData?.graph || user?.userData?.data?.graph || null;
  const grapeRankRaw = grapeRankQuery.data?.data;
  const grapeRank = grapeRankRaw && typeof grapeRankRaw === "object" ? grapeRankRaw : null;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleCopyNpub = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.npub);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";

  if (!user) return null;

  const followersCount = network?.followed_by?.length ?? 0;
  const followingCount = network?.following?.length ?? 0;
  const influence = network?.influence ?? 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative" data-testid="page-dashboard">
      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="lg:hidden">
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <BrainIcon size={28} />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">
                  Brainstorm
                </h1>
              </div>
              <div className="hidden lg:flex gap-2">
                <Button variant="ghost" size="sm" className="gap-2 text-white bg-white/10 no-default-hover-elevate no-default-active-elevate" data-testid="button-dashboard-nav">
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-user-menu">
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                      {user.picture ? (
                        <AvatarImage src={user.picture} alt={user.displayName || "Profile"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                        {user.displayName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2">
                      <span className="text-sm font-bold text-white leading-none mb-0.5">{user.displayName || "Anon"}</span>
                      <span className="text-[10px] text-indigo-300 font-mono leading-none">{user.npub.slice(0, 8)}...</span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.displayName || "Anonymous"}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.npub.slice(0, 16)}...</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-destructive" onClick={handleLogout} data-testid="dropdown-logout">
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
          <div className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} data-testid="overlay-mobile-menu" />
          <div className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-xl flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950" data-testid="panel-mobile-menu">
            <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BrainIcon size={22} />
                <h2 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Menu</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-slate-200/80 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-close-mobile-menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
              <Button variant="ghost" className="w-full justify-start gap-3 text-white bg-white/10 border border-white/10 rounded-md no-default-hover-elevate no-default-active-elevate" onClick={() => setMobileMenuOpen(false)} data-testid="button-mobile-nav-dashboard">
                <Home className="h-5 w-5 text-indigo-200" />
                Dashboard
              </Button>
            </div>
            <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-10 w-10 border border-white/10">
                  {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "Profile"} /> : null}
                  <AvatarFallback className="bg-indigo-900 text-white font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user.displayName || "Anonymous"}</p>
                  <p className="text-xs text-slate-300/70 font-mono truncate">{truncatedNpub}</p>
                </div>
              </div>
              <Button variant="outline" className="w-full justify-center gap-2 text-red-200 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-md" onClick={() => { setMobileMenuOpen(false); handleLogout(); }} data-testid="button-mobile-sign-out">
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full">
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2" data-testid="section-dashboard-header">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-indigo-500/12 shadow-sm backdrop-blur-sm w-fit">
                <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1]" />
                <p className="text-[9px] font-bold tracking-[0.15em] text-indigo-900 uppercase">Brainstorm Dashboard</p>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-dashboard-title">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Welcome back, {user.displayName || "Traveler"}
                </span>
              </h1>
              <p className="text-slate-600 font-medium" data-testid="text-dashboard-subtitle">
                Your trust network overview.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 border-indigo-500/10 shadow-sm relative overflow-hidden" data-testid="card-user-profile">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x absolute top-0 left-0" />
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 border-2 border-indigo-200 shadow-sm" data-testid="img-user-avatar">
                  {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "Profile"} /> : null}
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold text-lg">
                    <UserIcon className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-slate-900 truncate" data-testid="text-display-name">{user.displayName || "Anonymous"}</h2>
                  {user.nip05 && (
                    <p className="text-[10px] text-indigo-600 truncate" data-testid="text-nip05">{user.nip05}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    <code className="text-[10px] text-slate-400 font-mono" data-testid="text-npub">{truncatedNpub}</code>
                    <button onClick={handleCopyNpub} className="p-0.5 text-slate-400 hover:text-indigo-500 transition-colors" data-testid="button-copy-npub">
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
              {user.about && (
                <p className="text-[11px] text-slate-500 mt-3 leading-relaxed line-clamp-2" data-testid="text-about">{user.about}</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white/95 via-white/80 to-emerald-50/40 border-emerald-500/10 shadow-sm relative overflow-hidden" data-testid="card-followers">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-500 animate-gradient-x absolute top-0 left-0" />
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-md bg-white border border-emerald-100 shadow-sm text-emerald-600">
                  <UserPlus className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Followers</span>
              </div>
              {selfQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight" data-testid="stat-followers">{followersCount.toLocaleString()}</div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">People following you</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white/95 via-white/80 to-blue-50/40 border-blue-500/10 shadow-sm relative overflow-hidden" data-testid="card-following">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-500 animate-gradient-x absolute top-0 left-0" />
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-md bg-white border border-blue-100 shadow-sm text-blue-600">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Following</span>
              </div>
              {selfQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight" data-testid="stat-following">{followingCount.toLocaleString()}</div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">Accounts you follow</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white/95 via-white/80 to-amber-50/40 border-amber-500/10 shadow-sm relative overflow-hidden" data-testid="card-influence">
            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 animate-gradient-x absolute top-0 left-0" />
            <CardContent className="pt-5 pb-4 px-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-md bg-white border border-amber-100 shadow-sm text-amber-600">
                  <Star className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Influence</span>
              </div>
              {selfQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight" data-testid="stat-influence">{influence}</div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">Network influence score</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 border-indigo-500/10 shadow-sm relative overflow-hidden" data-testid="card-network">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x absolute top-0 left-0" />
            <CardHeader className="pb-3">
              <div className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-white border border-indigo-100 shadow-sm text-indigo-600">
                    <Network className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-sm font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    Social Graph
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => selfQuery.refetch()}
                  disabled={selfQuery.isFetching}
                  data-testid="button-refresh-network"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${selfQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <CardDescription className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mt-1">
                Your Nostr network connections
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selfQuery.isLoading ? (
                <div className="flex items-center gap-2 py-6" data-testid="network-loading">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <p className="text-sm text-slate-500">Loading network data...</p>
                </div>
              ) : network ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="network-data">
                  {NETWORK_METRICS.map((metric) => {
                    const value = (network as any)[metric.key];
                    const count = Array.isArray(value) ? value.length : (value ?? 0);
                    return (
                      <div key={metric.key} className="flex items-center gap-2.5 p-2.5 rounded-md bg-slate-50/80 border border-slate-100">
                        <metric.icon className={`w-4 h-4 ${metric.color} shrink-0`} />
                        <div>
                          <p className="text-lg font-bold text-slate-900 leading-none font-mono" data-testid={`network-${metric.key}`}>{count}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{metric.label}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2.5 p-2.5 rounded-md bg-slate-50/80 border border-slate-100">
                    <Star className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-lg font-bold text-slate-900 leading-none font-mono" data-testid="network-influence">{influence}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Influence</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-4" data-testid="network-empty">
                  No network data available yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white/95 via-white/80 to-violet-50/40 border-violet-500/10 shadow-sm relative overflow-hidden" data-testid="card-graperank">
            <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-purple-600 to-violet-500 animate-gradient-x absolute top-0 left-0" />
            <CardHeader className="pb-3">
              <div className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-white border border-violet-100 shadow-sm text-violet-600">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-sm font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    GrapeRank
                  </CardTitle>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => triggerGrapeRankMutation.mutate()}
                  disabled={triggerGrapeRankMutation.isPending}
                  data-testid="button-trigger-graperank"
                >
                  {triggerGrapeRankMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {triggerGrapeRankMutation.isPending ? "Calculating..." : "Calculate"}
                </Button>
              </div>
              <CardDescription className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mt-1">
                Reputation scoring via your trust graph
              </CardDescription>
            </CardHeader>
            <CardContent>
              {triggerGrapeRankMutation.isSuccess && (
                <div className="flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-3 mb-3" data-testid="graperank-triggered">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-700">GrapeRank calculation triggered. Results may take a few minutes.</p>
                </div>
              )}
              {triggerGrapeRankMutation.isError && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 mb-3" data-testid="graperank-trigger-error">
                  <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-600">{triggerGrapeRankMutation.error?.message || "Failed to trigger. Try again."}</p>
                </div>
              )}
              {grapeRankQuery.isLoading ? (
                <div className="flex items-center gap-2 py-6" data-testid="graperank-loading">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  <p className="text-sm text-slate-500">Loading GrapeRank data...</p>
                </div>
              ) : grapeRankQuery.isError ? (
                <p className="text-sm text-slate-500 py-4" data-testid="graperank-error">
                  Could not load GrapeRank data.
                </p>
              ) : grapeRank ? (
                <div className="flex flex-col gap-3" data-testid="graperank-data">
                  <div className="grid grid-cols-2 gap-3">
                    {grapeRank.status && (
                      <div className="p-2.5 rounded-md bg-slate-50/80 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Status</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5" data-testid="graperank-status">{grapeRank.status}</p>
                      </div>
                    )}
                    {grapeRank.ta_status && (
                      <div className="p-2.5 rounded-md bg-slate-50/80 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">TA Status</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5" data-testid="graperank-ta-status">{grapeRank.ta_status}</p>
                      </div>
                    )}
                  </div>
                  {grapeRank.internal_publication_status && (
                    <div className="p-2.5 rounded-md bg-slate-50/80 border border-slate-100">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Publication</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5" data-testid="graperank-publication-status">{grapeRank.internal_publication_status}</p>
                    </div>
                  )}
                  {grapeRank.result && (
                    <div className="p-2.5 rounded-md bg-slate-50/80 border border-slate-100">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mb-1">Result</p>
                      <pre className="text-xs font-mono text-slate-700 overflow-auto max-h-48 bg-white p-2 rounded border border-slate-100" data-testid="graperank-result">
                        {typeof grapeRank.result === "string" ? grapeRank.result : JSON.stringify(grapeRank.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center" data-testid="graperank-empty">
                  <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No GrapeRank results yet.</p>
                  <p className="text-[10px] text-slate-400 mt-1">Click Calculate to generate your reputation score.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gradient-to-br from-white/95 via-white/80 to-slate-50/40 border-slate-200/60 shadow-sm relative overflow-hidden" data-testid="card-raw-data">
          <div className="h-1 w-full bg-gradient-to-r from-slate-400 via-slate-600 to-slate-400 animate-gradient-x absolute top-0 left-0" />
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-white border border-slate-100 shadow-sm text-slate-600">
                <Info className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                Raw User Data
              </CardTitle>
            </div>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mt-1">
              Complete data from brainstorm backend
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.userData ? (
              <pre className="text-xs font-mono text-slate-700 bg-white p-4 rounded-md border border-slate-100 overflow-auto max-h-96" data-testid="text-user-data">
                {JSON.stringify(user.userData, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-slate-500" data-testid="text-auth-status">
                Signed in via Nostr. Backend user data is not yet available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
