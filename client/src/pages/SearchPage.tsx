import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import {
  Search as SearchIcon,
  User,
  Home,
  LogOut,
  Menu,
  Info,
  Loader2,
  Settings as SettingsIcon,
  HelpCircle,
  Copy,
  Zap,
  Globe,
  Users,
  Telescope,
  Check,
  ChevronDown,
  Radar,
  SlidersHorizontal,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { FEATURES } from "@/config/featureFlags";
import { AdminIcon } from "@/components/AdminIcon";
import { TrustRankIcon } from "@/components/TrustRankIcon";
import { ProfileCardIcon } from "@/components/ProfileCardIcon";
import { UserPovIcon } from "@/components/UserPovIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { useToast } from "@/hooks/use-toast";
import { isAdminPubkey } from "@/config/adminAccess";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";

type SearchPov = "nosfabrica" | "mywot";

const MEILI_API = "https://brainstorm.world/api/search/profiles/meili";

interface SearchResult {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  website?: string;
  lud16?: string;
  banner?: string;
  createdAt?: number;
  wotRank?: number | null;
  wotFollowers?: number | null;
}

interface MeiliResponse {
  success: boolean;
  hits: MeiliHit[];
  estimatedTotalHits?: number;
  processingTimeMs?: number;
  povSuffix?: string;
  nip05Result?: { pubkey: string; npub: string } | null;
}

interface MeiliHit {
  pubkey: string;
  npub: string;
  name?: string;
  display_name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  website?: string;
  lud16?: string;
  banner?: string;
  created_at?: number;
  wot_rank?: number;
  wot_followers?: number;
}

function meiliHitToResult(hit: MeiliHit): SearchResult {
  return {
    pubkey: hit.pubkey,
    npub: hit.npub,
    name: hit.name,
    displayName: hit.display_name || hit.displayName,
    picture: hit.picture,
    about: hit.about,
    nip05: hit.nip05,
    website: hit.website,
    lud16: hit.lud16,
    banner: hit.banner,
    createdAt: hit.created_at,
    wotRank: hit.wot_rank ?? null,
    wotFollowers: hit.wot_followers ?? null,
  };
}

async function searchMeili(
  query: string,
  pov: SearchPov,
  userPubkey?: string,
  limit = 30,
  offset = 0,
): Promise<{ results: SearchResult[]; total: number; timeMs: number }> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    offset: String(offset),
    wotPov: pov === "nosfabrica" ? "house" : "user",
  });

  if (pov === "mywot" && userPubkey) {
    params.set("userPubkey", userPubkey);
  }

  const resp = await fetch(`${MEILI_API}?${params.toString()}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    throw new Error(`Search failed: ${resp.status}`);
  }

  const data: MeiliResponse = await resp.json();
  if (!data.success) {
    throw new Error("Search service unavailable");
  }

  return {
    results: (data.hits || []).map(meiliHitToResult),
    total: data.estimatedTotalHits || 0,
    timeMs: data.processingTimeMs || 0,
  };
}

function getDisplayLabel(result: SearchResult): string {
  return result.displayName || result.name || result.npub.slice(0, 12) + "...";
}

function truncateAbout(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

export default function SearchPage() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [filterRank, setFilterRank] = useState<[number, number] | null>(null);
  const [filterMinFollowers, setFilterMinFollowers] = useState<number | null>(null);
  const [filterHasLightning, setFilterHasLightning] = useState(false);
  const [filterHasWebsite, setFilterHasWebsite] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef(0);
  const [pov, setPov] = useState<SearchPov>("nosfabrica");
  const [firstVisit] = useState(() => {
    if (sessionStorage.getItem("bs_visited")) return false;
    sessionStorage.setItem("bs_visited", "1");
    return true;
  });

  const { data: grapeRankData } = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
  const calcDone = useMemo(() => {
    if (calcDoneNow) {
      try { localStorage.setItem("brainstorm_calc_completed", "true"); } catch {}
      return true;
    }
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  }, [calcDoneNow]);

  const { data: selfData } = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const taPubkey = selfData?.data?.history?.ta_pubkey;
  const hasPovOption = !!taPubkey;

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/", { replace: true });
      return;
    }
    setUser(u);

    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("npub");
    const group = params.get("fromGroup");
    if (prefill) {
      const target = group ? `/profile/${prefill}?fromGroup=${group}` : `/profile/${prefill}`;
      navigate(target, { replace: true });
    }
  }, [navigate]);

  const isLikelyNpub = (value: string) =>
    /^npub1[02-9ac-hj-np-z]{20,}$/i.test(value.trim());

  const isHexPubkey = (value: string) =>
    /^[0-9a-f]{64}$/i.test(value.trim());

  const isNip05Handle = (value: string) => {
    const v = value.trim();
    if (v.includes("@")) {
      const parts = v.split("@");
      return parts.length === 2 && parts[0].length > 0 && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(parts[1]);
    }
    return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
  };

  const resolveNip05 = async (handle: string): Promise<string> => {
    const trimmed = handle.trim();
    let name: string;
    let domain: string;
    if (trimmed.includes("@")) {
      [name, domain] = trimmed.split("@");
    } else {
      name = "_";
      domain = trimmed;
    }
    const resp = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error("Could not resolve handle");
    const data = await resp.json();
    const pubkey = data?.names?.[name] || data?.names?.[name.toLowerCase()];
    if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) throw new Error("Handle not found");
    return pubkey;
  };

  const resetFilters = useCallback(() => {
    setFilterRank(null);
    setFilterMinFollowers(null);
    setFilterHasLightning(false);
    setFilterHasWebsite(false);
  }, []);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    resetFilters();

    if (isLikelyNpub(q)) {
      try {
        const decoded = nip19.decode(q);
        if (decoded.type === "npub" && typeof decoded.data === "string") {
          navigate(`/profile/${q}`);
          return;
        }
      } catch {}
    }

    if (isHexPubkey(q)) {
      const npub = nip19.npubEncode(q.toLowerCase());
      navigate(`/profile/${npub}`);
      return;
    }

    if (isNip05Handle(q)) {
      const searchId = ++searchAbortRef.current;
      setIsSearching(true);
      try {
        const hexPubkey = await resolveNip05(q);
        if (searchAbortRef.current !== searchId) return;
        const npub = nip19.npubEncode(hexPubkey);
        navigate(`/profile/${npub}`);
        return;
      } catch {
        if (searchAbortRef.current !== searchId) return;
      }
    }

    const searchId = ++searchAbortRef.current;
    setIsSearching(true);
    setHasSearched(true);
    const start = performance.now();

    try {
      const { results: searchResults, timeMs } = await searchMeili(q, pov, user?.pubkey, 30);
      if (searchAbortRef.current !== searchId) return;
      setResults(searchResults);
      setSearchTime(timeMs || Math.round(performance.now() - start));
    } catch {
      if (searchAbortRef.current !== searchId) return;
      setResults([]);
    } finally {
      if (searchAbortRef.current === searchId) {
        setIsSearching(false);
      }
    }
  }, [query, pov, user?.pubkey, navigate, resetFilters]);

  const prevPovRef = useRef(pov);
  const handlePovSwitch = useCallback((newPov: SearchPov) => {
    if (newPov === pov) return;
    setPov(newPov);
  }, [pov]);

  useEffect(() => {
    if (prevPovRef.current !== pov) {
      prevPovRef.current = pov;
      if (hasSearched && query.trim()) {
        handleSearch();
      }
    }
  }, [pov, hasSearched, query, handleSearch]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user || isAuthRedirecting()) return null;

  const showEmptyState = !hasSearched && results.length === 0 && !isSearching;
  const showNoResults = hasSearched && results.length === 0 && !isSearching;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-search">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F010_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F010_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute -top-[30%] left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-100/20 blur-[160px]" />
        <div className="absolute top-[20%] -right-[15%] w-[50%] h-[50%] rounded-full bg-violet-100/15 blur-[140px]" />
        <div className="absolute -bottom-[20%] left-[30%] w-[40%] h-[40%] rounded-full bg-slate-200/20 blur-[120px]" />
      </div>

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-search">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="lg:hidden">
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10 h-8 w-8" data-testid="button-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
              <button type="button" className="flex items-center gap-1.5 sm:gap-2" onClick={() => navigate("/dashboard")} data-testid="button-brand">
                <BrainLogo size={24} className="text-indigo-500 sm:hidden" />
                <BrainLogo size={28} className="text-indigo-500 hidden sm:block" />
                <h1 className="text-base sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">Brainstorm</h1>
              </button>
              <div className="hidden lg:flex gap-1" data-testid="row-nav-links">
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/dashboard")} data-testid="button-nav-dashboard">
                  <Home className="h-4 w-4" /> Dashboard
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-white bg-white/[0.12] rounded-md no-default-hover-elevate no-default-active-elevate" data-testid="button-nav-search">
                  <SearchIcon className="h-4 w-4" /> Search
                </Button>
                <Button variant="ghost" size="sm" className={`gap-2 rounded-md no-default-hover-elevate no-default-active-elevate transition-all duration-200 ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/[0.06]" : "text-slate-600 opacity-40 cursor-not-allowed"}`} onClick={() => calcDone && navigate("/network")} disabled={!calcDone} data-testid="button-nav-network">
                  <User className="h-4 w-4" /> Network
                </Button>
                {FEATURES.agentSuite && (
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/agentsuite")} data-testid="button-nav-agentsuite">
                    <AgentIcon className="h-4 w-4" />
                    <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">Agent Suite</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-user-menu">
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                      {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "Profile"} className="object-cover" /> : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2">
                      <span className="text-sm font-bold text-white leading-none mb-0.5">{user.displayName || "Anon"}</span>
                      <span className="text-xs text-indigo-300 font-mono leading-none">{user.npub.slice(0, 8)}...</span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900">{user.displayName || "Anonymous"}</p>
                      <button className="flex items-center gap-1 text-xs leading-none text-slate-500 hover:text-indigo-600 transition-colors" onClick={() => { navigator.clipboard.writeText(user.npub); toast({ title: "Copied!", description: "npub copied to clipboard" }); }} data-testid="button-copy-npub">
                        <span>{user.npub.slice(0, 16)}...</span>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq">
                    <HelpCircle className="mr-2 h-4 w-4" /> <span>FAQ</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                    <SettingsIcon className="mr-2 h-4 w-4" /> <span>Settings</span>
                  </DropdownMenuItem>
                  {isAdminPubkey(user?.pubkey) && (
                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={() => navigate("/admin")} data-testid="dropdown-admin">
                      <AdminIcon className="mr-2 h-4 w-4" /> <span>Admin</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleLogout} data-testid="dropdown-logout">
                    <LogOut className="mr-2 h-4 w-4" /> <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} currentPath={location} navigate={navigate} calcDone={calcDone} user={user} onLogout={handleLogout} isAdmin={isAdminPubkey(user?.pubkey)} />

      <main className="relative z-10 w-full flex-1 flex flex-col">
        <div className={`transition-all duration-500 ${hasSearched ? "pt-6 sm:pt-8" : "flex-1 flex flex-col justify-center -mt-12 sm:-mt-16"}`}>
          <div className={`max-w-2xl mx-auto px-3 sm:px-6 w-full transition-all duration-500 ${hasSearched ? "mb-4 sm:mb-6" : "mb-0"}`}>
            {!hasSearched && (
              <div className="text-center mb-6 sm:mb-10" data-testid="section-search-hero">
                <div className={`inline-flex flex-col items-center ${firstVisit ? "animate-[staggerUp_0.6s_ease-out_0.1s_both]" : "animate-fade-up"}`}>
                  <BrainLogo size={36} className="text-indigo-600 mb-2 sm:hidden" />
                  <BrainLogo size={44} className="text-indigo-600 mb-2 hidden sm:block" />
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-search-title">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x">
                      Brainstorm
                    </span>
                  </h1>
                </div>
                <p className={`text-slate-400/70 text-[10px] sm:text-xs mt-2 sm:mt-3 px-1 sm:px-2 tracking-wide leading-relaxed ${firstVisit ? "animate-[staggerUp_0.6s_ease-out_0.4s_both]" : "animate-fade-up"}`} data-testid="text-search-subtitle">
                  The future of <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400 font-medium">Signal Engine Optimization</span> — search by trust, not pages.
                </p>
              </div>
            )}

            <div className={`relative ${firstVisit ? "animate-[staggerUp_0.7s_ease-out_0.8s_both]" : ""}`} data-testid="container-search-input">
              <div className="relative flex items-center bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-[0_1px_6px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] focus-within:shadow-[0_2px_12px_rgba(99,102,241,0.1)] focus-within:border-indigo-200 transition-all duration-300">
                {hasPovOption ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="pl-3.5 pr-1 flex items-center gap-1 shrink-0 group/pov focus:outline-none"
                        data-testid="button-pov-switcher"
                      >
                        <div className="relative">
                          <Avatar className={`h-7 w-7 border transition-all duration-300 ${pov === "nosfabrica" ? "border-indigo-200 ring-1 ring-indigo-100/60" : "border-emerald-200 ring-1 ring-emerald-100/60"}`}>
                            {pov === "nosfabrica" ? (
                              <AvatarImage src={nosFabricaLogo} alt="NosFabrica" className="object-cover" />
                            ) : (
                              <>
                                {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "You"} className="object-cover" /> : null}
                                <AvatarFallback className="bg-emerald-50 text-emerald-700 font-bold text-[10px]">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                              </>
                            )}
                          </Avatar>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${pov === "nosfabrica" ? "bg-indigo-400" : "bg-emerald-400"}`} />
                        </div>
                        <ChevronDown className="h-3 w-3 text-slate-400 group-hover/pov:text-slate-600 transition-colors" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[200px] bg-white border-slate-200/60 shadow-md shadow-slate-100/50 p-1 rounded-lg" data-testid="dropdown-pov">
                      <DropdownMenuItem
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors focus:bg-indigo-50/40 focus:text-slate-800 ${pov === "nosfabrica" ? "bg-indigo-50/40" : ""}`}
                        onClick={() => handlePovSwitch("nosfabrica")}
                        data-testid="pov-option-nosfabrica"
                      >
                        <Avatar className="h-5 w-5 shrink-0">
                          <AvatarImage src={nosFabricaLogo} alt="NosFabrica" className="object-cover" />
                        </Avatar>
                        <span className="text-[13px] text-slate-700">NosFabrica</span>
                        {pov === "nosfabrica" && <Check className="h-3 w-3 text-indigo-400 ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors focus:bg-emerald-50/40 focus:text-slate-800 ${pov === "mywot" ? "bg-emerald-50/40" : ""}`}
                        onClick={() => handlePovSwitch("mywot")}
                        data-testid="pov-option-mywot"
                      >
                        <Avatar className="h-5 w-5 shrink-0">
                          {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "You"} className="object-cover" /> : null}
                          <AvatarFallback className="bg-slate-100 text-slate-500 font-medium text-[8px]">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                        </Avatar>
                        <span className="text-[13px] text-slate-700 truncate">{user.displayName || "My WoT"}</span>
                        {pov === "mywot" && <Check className="h-3 w-3 text-emerald-400 ml-auto" />}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-0.5 bg-slate-100/60" />
                      <DropdownMenuItem
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer focus:bg-slate-50/60 focus:text-slate-500 text-slate-400"
                        onClick={() => navigate("/personalization")}
                        data-testid="link-learn-more"
                      >
                        <Telescope className="h-3 w-3" />
                        <span className="text-xs">Learn more</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="pl-4 text-slate-400">
                    <SearchIcon className="h-5 w-5" />
                  </div>
                )}
                {hasPovOption && (
                  <div className="w-px h-6 bg-slate-200/60 mx-1 shrink-0" />
                )}
                {hasPovOption && (
                  <div className="pl-1 text-slate-400">
                    <SearchIcon className="h-5 w-5" />
                  </div>
                )}
                <Input
                  ref={inputRef}
                  placeholder="Search by name or npub..."
                  className="border-0 shadow-none focus-visible:ring-0 h-11 sm:h-14 text-[13px] sm:text-base bg-transparent placeholder:text-slate-400/70 min-w-0"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  autoFocus={!hasSearched}
                  data-testid="input-search"
                />
                {query && (
                  <button
                    className="px-2 text-slate-300 hover:text-slate-500 transition-colors"
                    onClick={() => { setQuery(""); setResults([]); setHasSearched(false); inputRef.current?.focus(); }}
                    data-testid="button-clear-search"
                  >
                    <span className="text-lg">&times;</span>
                  </button>
                )}
                <Button
                  onClick={() => handleSearch()}
                  disabled={isSearching || !query.trim()}
                  className="h-8 sm:h-10 px-3 sm:px-6 mr-1 sm:mr-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm shrink-0 transition-all"
                  data-testid="button-search"
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <><SearchIcon className="h-3.5 w-3.5 sm:hidden" /><span className="hidden sm:inline">Search</span></>}
                </Button>
              </div>
              {!hasSearched && (
                <div className={`flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-3 sm:mt-5 ${firstVisit ? "animate-[staggerUp_0.6s_ease-out_1s_both]" : ""}`} data-testid="container-suggestions">
                  {["bitcoin", "nostr", "privacy", "developers", "clients", "podcasts"].map((term, i) => (
                    <button
                      key={term}
                      className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs text-slate-500 bg-white/80 border border-slate-200/80 rounded-full hover:bg-white hover:border-slate-300 hover:text-slate-700 active:bg-slate-50 transition-all ${i >= 4 ? "hidden sm:inline-flex" : ""}`}
                      onClick={() => { setQuery(term); handleSearch(term); }}
                      data-testid={`suggestion-${term}`}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              )}
              {hasSearched && (
                <div className="flex items-center mt-2.5 px-1">
                  {hasPovOption && (
                    <div className="flex items-center gap-1.5" data-testid="text-pov-indicator">
                      <Telescope className="h-3 w-3 text-slate-400" />
                      <p className="text-[11px] text-slate-400">
                        Viewing as <span className={`font-medium ${pov === "nosfabrica" ? "text-indigo-500" : "text-emerald-600"}`}>{pov === "nosfabrica" ? "NosFabrica" : user.displayName || "My WoT"}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isSearching && (
            <div className="max-w-3xl mx-auto px-3 sm:px-6 mt-4 sm:mt-6">
              <div className="space-y-2 sm:space-y-3" data-testid="container-search-loading">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-white/70 border border-slate-100 animate-pulse" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 sm:h-3.5 bg-slate-200 rounded-full w-28 sm:w-36" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-full max-w-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isSearching && hasSearched && results.length > 0 && (() => {
            const hasActiveFilters = filterRank !== null || filterMinFollowers !== null || filterHasLightning || filterHasWebsite;
            const filteredResults = results.filter((r) => {
              if (filterRank !== null) {
                if (r.wotRank == null) return false;
                if (r.wotRank < filterRank[0] || r.wotRank > filterRank[1]) return false;
              }
              if (filterMinFollowers !== null && (r.wotFollowers == null || r.wotFollowers < filterMinFollowers)) return false;
              if (filterHasLightning && !r.lud16) return false;
              if (filterHasWebsite && !r.website) return false;
              return true;
            });
            return (
            <div className="max-w-3xl mx-auto px-3 sm:px-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 px-1">
                <p className="text-[10px] sm:text-[11px] text-slate-400" data-testid="text-search-stats">
                  {hasActiveFilters
                    ? `Showing ${filteredResults.length} of ${results.length} result${results.length !== 1 ? "s" : ""}`
                    : `About ${results.length} result${results.length !== 1 ? "s" : ""}`
                  } ({(searchTime / 1000).toFixed(2)} seconds)
                </p>
                <button
                  className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${showFilters || hasActiveFilters ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent"}`}
                  onClick={() => setShowFilters(!showFilters)}
                  data-testid="button-toggle-filters"
                >
                  <SlidersHorizontal className="h-2.5 w-2.5" />
                  Filters{hasActiveFilters ? " ●" : ""}
                </button>
              </div>
              {showFilters && (
                <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-white/80 border border-slate-100 rounded-xl space-y-2.5 relative" data-testid="container-filters">
                  {hasActiveFilters && (
                    <button
                      className="absolute bottom-2 right-2 sm:top-2.5 sm:bottom-auto sm:right-2.5 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] sm:text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-colors border border-slate-200"
                      onClick={resetFilters}
                      data-testid="button-clear-filters"
                    >
                      Clear all
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-[11px] text-slate-500 font-medium w-14 sm:w-16 shrink-0"><BrainLogo size={10} className="shrink-0 text-slate-400" />Trust</span>
                    {([["All", null], ["100–76", [76, 100]], ["75–51", [51, 75]], ["50–26", [26, 50]], ["25–0", [0, 25]]] as [string, [number, number] | null][]).map(([label, val]) => {
                      const isActive = filterRank === null ? val === null : val !== null && filterRank[0] === val[0] && filterRank[1] === val[1];
                      return (
                      <button
                        key={label}
                        className={`px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-[11px] font-medium rounded-full border transition-colors ${isActive ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"}`}
                        onClick={() => setFilterRank(val)}
                        data-testid={`filter-rank-${label.toLowerCase().replace(/[–\s]/g, "")}`}
                      >
                        {label}
                      </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-[11px] text-slate-500 font-medium w-14 sm:w-16 shrink-0"><Users className="h-2.5 w-2.5 shrink-0 text-slate-400" />Followers</span>
                    {([["Any", null], ["1K+", 1000], ["5K+", 5000], ["10K+", 10000]] as [string, number | null][]).map(([label, val]) => (
                      <button
                        key={label}
                        className={`px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-[11px] font-medium rounded-full border transition-colors ${filterMinFollowers === val ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"}`}
                        onClick={() => setFilterMinFollowers(val)}
                        data-testid={`filter-followers-${label.toLowerCase().replace(/[+\s]/g, "")}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-[11px] text-slate-500 font-medium w-14 sm:w-16 shrink-0"><ProfileCardIcon className="h-2.5 w-2.5 shrink-0 text-slate-400" />Profile</span>
                    <button
                      className={`inline-flex items-center gap-0.5 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-[11px] font-medium rounded-full border transition-colors ${filterHasLightning ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"}`}
                      onClick={() => setFilterHasLightning(!filterHasLightning)}
                      data-testid="filter-has-lightning"
                    >
                      <Zap className="h-2.5 w-2.5" />
                      Lightning
                    </button>
                    <button
                      className={`inline-flex items-center gap-0.5 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-[11px] font-medium rounded-full border transition-colors ${filterHasWebsite ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"}`}
                      onClick={() => setFilterHasWebsite(!filterHasWebsite)}
                      data-testid="filter-has-website"
                    >
                      <Globe className="h-2.5 w-2.5" />
                      Website
                    </button>
                  </div>
                </div>
              )}
              {hasActiveFilters && filteredResults.length === 0 && (
                <div className="text-center py-6 sm:py-8" data-testid="container-no-filter-results">
                  <p className="text-sm text-slate-500 font-medium">No profiles match these filters</p>
                  <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search for different terms</p>
                  <button
                    className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-100"
                    onClick={resetFilters}
                    data-testid="button-clear-filters-empty"
                  >
                    Clear filters
                  </button>
                </div>
              )}
              <div className="space-y-2 sm:space-y-3" data-testid="container-search-results">
                {filteredResults.map((result, idx) => {
                  const formatFollowers = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
                  const websiteDisplay = result.website ? result.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
                  return (
                    <button
                      key={result.pubkey}
                      className="w-full bg-white/70 hover:bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm active:bg-slate-50 rounded-xl transition-all duration-150 text-left group cursor-pointer overflow-hidden"
                      onClick={() => navigate(`/profile/${result.npub}`)}
                      data-testid={`result-profile-${idx}`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4">
                        <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border-2 shrink-0 border-slate-200/80">
                          {result.picture ? <AvatarImage src={result.picture} alt={getDisplayLabel(result)} className="object-cover" /> : null}
                          <AvatarFallback className="bg-indigo-50 text-indigo-600 font-bold text-sm">
                            {(result.name || result.displayName || "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] sm:text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate" data-testid={`text-result-name-${idx}`}>
                              {getDisplayLabel(result)}
                            </span>
                          </div>
                          {result.lud16 && (
                            <p className="text-[10px] sm:text-[11px] text-amber-600 truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-lightning-${idx}`}>
                              <Zap className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-500" />
                              {result.lud16}
                            </p>
                          )}
                          {websiteDisplay && (
                            <p className="text-[10px] sm:text-[11px] text-emerald-600 truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-website-${idx}`}>
                              <Globe className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
                              <a
                                href={result.website!.startsWith("http") ? result.website! : `https://${result.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline truncate"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {websiteDisplay}
                              </a>
                            </p>
                          )}
                          {result.about && (
                            <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2" data-testid={`text-result-about-${idx}`}>
                              {truncateAbout(result.about)}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 sm:gap-2 mt-2 flex-wrap">
                            {result.wotRank != null && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100" data-testid={`badge-rank-${idx}`}>
                                <BrainLogo size={10} className="shrink-0" />
                                {result.wotRank}
                              </span>
                            )}
                            {result.wotFollowers != null && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100" data-testid={`badge-followers-${idx}`}>
                                <Users className="h-2.5 w-2.5" />
                                {formatFollowers(result.wotFollowers)}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-300 font-mono hidden sm:inline" data-testid={`text-result-npub-${idx}`}>
                              {result.npub.slice(0, 12)}...
                              <span
                                role="button"
                                tabIndex={0}
                                className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
                                data-testid={`button-copy-npub-${idx}`}
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(result.npub); }}
                              >
                                <Copy className="h-2.5 w-2.5 text-slate-400 hover:text-slate-600" />
                              </span>
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0 mt-1 hidden sm:inline font-medium">
                          View →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {showNoResults && (
            <div className="max-w-2xl mx-auto px-3 sm:px-6 mt-8 sm:mt-12 text-center" data-testid="container-no-results">
              <div className="p-6 sm:p-8 rounded-xl sm:rounded-2xl bg-white/60 border border-slate-100">
                <Radar className="h-8 w-8 sm:h-10 sm:w-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-700 mb-1">No profiles found</h3>
                <p className="text-xs text-slate-500">Try a different name or paste an npub directly.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="w-full py-4 sm:py-5 mt-auto relative">
        <div className="absolute inset-x-0 top-0 h-px bg-slate-200/40" />
        <div className="max-w-xl mx-auto flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-5 gap-y-1 px-3 sm:px-4" data-testid="section-search-features">
          <span className="inline-flex items-center gap-1 text-[9px] sm:text-[11px] text-slate-400 font-medium tracking-wide" data-testid="card-search-feature-0"><TrustRankIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-slate-300" />Trust ranked</span>
          <span className="text-[9px] sm:text-[11px] text-slate-300">·</span>
          <span className="inline-flex items-center gap-1 text-[9px] sm:text-[11px] text-slate-400 font-medium tracking-wide" data-testid="card-search-feature-1"><ProfileCardIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-slate-300" />Profile search</span>
          <span className="text-[9px] sm:text-[11px] text-slate-300">·</span>
          <span className="inline-flex items-center gap-1 text-[9px] sm:text-[11px] text-slate-400 font-medium tracking-wide" data-testid="card-search-feature-2"><UserPovIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-slate-300" />Identity verified</span>
          <span className="text-[9px] sm:text-[11px] text-slate-300">·</span>
          <span className="inline-flex items-center gap-1 text-[9px] sm:text-[11px] text-slate-400 font-medium tracking-wide"><Telescope className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-slate-300" />Open protocol</span>
        </div>
      </div>

      <Footer />
    </div>
  );
}
