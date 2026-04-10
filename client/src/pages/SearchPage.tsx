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
  Shield,
  Copy,
  Users,
  CheckCircle2,
  TrendingUp,
  ExternalLink,
  Clock,
  Eye,
  Check,
  ChevronDown,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
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
import { getTier, freshnessScore, getRelativeTime } from "@/utils/trustTiers";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";

type SearchPov = "nosfabrica" | "mywot";

const SEARCH_RELAY = "wss://nous-clawds4.tapestry.ninja/relay";

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
}

interface RankedSearchResult extends SearchResult {
  composite: number;
  trustInfluence: number | null;
}

function parseProfileEvent(event: any): SearchResult | null {
  try {
    const content = JSON.parse(event.content);
    const npub = nip19.npubEncode(event.pubkey);
    return {
      pubkey: event.pubkey,
      npub,
      name: content.name,
      displayName: content.display_name || content.displayName,
      picture: content.picture,
      about: content.about,
      nip05: content.nip05,
      website: content.website,
      lud16: content.lud16,
      banner: content.banner,
      createdAt: event.created_at,
    };
  } catch {
    return null;
  }
}

function searchRelay(query: string, observerPubkey?: string, limit = 30): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    let ws: WebSocket | null = null;
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      try { ws?.close(); } catch {}
      resolve(results);
    };

    const timeout = setTimeout(finish, 6000);

    try {
      ws = new WebSocket(SEARCH_RELAY);

      ws.onopen = () => {
        let searchStr = query;
        if (observerPubkey) {
          searchStr += ` observer:${observerPubkey}`;
        }
        searchStr += ` sort:followers:desc`;
        const req = JSON.stringify(["REQ", "bs-search", {
          kinds: [0],
          search: searchStr,
          limit,
        }]);
        ws!.send(req);
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === "EVENT" && data[1] === "bs-search") {
            const event = data[2];
            if (!seen.has(event.pubkey)) {
              seen.add(event.pubkey);
              const parsed = parseProfileEvent(event);
              if (parsed) results.push(parsed);
            }
          } else if (data[0] === "EOSE" && data[1] === "bs-search") {
            clearTimeout(timeout);
            finish();
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        finish();
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        finish();
      };
    } catch {
      clearTimeout(timeout);
      finish();
    }
  });
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

  const trustScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    const following = selfData?.data?.graph?.following;
    if (!Array.isArray(following)) return map;
    for (const entry of following) {
      const pubkey = typeof entry === "string" ? entry : entry.pubkey;
      const influence = typeof entry === "object" ? (entry.influence ?? 0) : 0;
      if (pubkey) map.set(pubkey, influence);
    }
    return map;
  }, [selfData]);

  const taPubkey = selfData?.data?.history?.ta_pubkey;
  const hasPovOption = !!taPubkey;

  const observerPubkey = useMemo(() => {
    if (pov === "nosfabrica" && taPubkey) return taPubkey;
    return user?.pubkey;
  }, [pov, taPubkey, user?.pubkey]);

  const sortedResults = useMemo((): RankedSearchResult[] => {
    if (results.length === 0) return [];
    const RELAY_WEIGHT = 0.5;
    const FRESHNESS_WEIGHT = 0.3;
    const TRUST_WEIGHT = 0.2;
    const maxIdx = results.length;

    return [...results]
      .map((r, idx) => {
        const relayScore = 1 - idx / maxIdx;
        const fresh = freshnessScore(r.createdAt);
        const trust = Math.min(1, Math.max(0, trustScoreMap.get(r.pubkey) ?? 0));
        const composite = RELAY_WEIGHT * relayScore + FRESHNESS_WEIGHT * fresh + TRUST_WEIGHT * trust;
        return { ...r, composite, trustInfluence: trust > 0 ? trust : null } as RankedSearchResult;
      })
      .sort((a, b) => b.composite - a.composite);
  }, [results, trustScoreMap]);

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

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

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
      const searchResults = await searchRelay(q, observerPubkey, 30);
      if (searchAbortRef.current !== searchId) return;
      setResults(searchResults);
      setSearchTime(Math.round(performance.now() - start));
    } catch {
      if (searchAbortRef.current !== searchId) return;
      setResults([]);
    } finally {
      if (searchAbortRef.current === searchId) {
        setIsSearching(false);
      }
    }
  }, [query, observerPubkey, navigate]);

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

  const showEmptyState = !hasSearched && sortedResults.length === 0 && !isSearching;
  const showNoResults = hasSearched && sortedResults.length === 0 && !isSearching;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-search">
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] ${firstVisit ? "animate-[gridReveal_1.2s_ease-out_forwards]" : "opacity-[0.15]"}`} />
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[600px] sm:w-[800px] h-[400px] sm:h-[600px] bg-gradient-to-b from-indigo-200/30 via-violet-100/20 to-transparent rounded-full blur-3xl ${firstVisit ? "animate-[orbFloat_8s_ease-in-out_infinite,orbFadeIn_1.5s_ease-out_forwards]" : ""}`} />
        <div className={`absolute top-40 -left-40 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-gradient-to-br from-indigo-100/40 to-transparent rounded-full blur-3xl ${firstVisit ? "animate-[orbDriftLeft_12s_ease-in-out_infinite,orbFadeIn_2s_ease-out_forwards]" : ""}`} />
        <div className={`absolute top-60 -right-40 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-gradient-to-bl from-violet-100/30 to-transparent rounded-full blur-3xl ${firstVisit ? "animate-[orbDriftRight_10s_ease-in-out_infinite,orbFadeIn_2.5s_ease-out_forwards]" : ""}`} />
      </div>

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-search">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="lg:hidden">
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
              <button type="button" className="flex items-center gap-2" onClick={() => navigate("/dashboard")} data-testid="button-brand">
                <BrainLogo size={28} className="text-indigo-500" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">Brainstorm</h1>
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
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/agentsuite")} data-testid="button-nav-agentsuite">
                  <AgentIcon className="h-4 w-4" />
                  <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">Agent Suite</span>
                </Button>
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
                    <DropdownMenuItem className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800" onClick={() => navigate("/admin")} data-testid="dropdown-admin">
                      <Shield className="mr-2 h-4 w-4" /> <span>Admin Dashboard</span>
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

      <main className="relative z-10 w-full flex-1">
        <div className={`transition-all duration-500 ${hasSearched ? "pt-6 sm:pt-8" : "pt-16 sm:pt-28"}`}>
          <div className={`max-w-2xl mx-auto px-4 sm:px-6 transition-all duration-500 ${hasSearched ? "mb-6" : "mb-0"}`}>
            {!hasSearched && (
              <div className="text-center mb-8" data-testid="section-search-hero">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 border border-indigo-200/30 shadow-sm shadow-indigo-100/30 backdrop-blur-sm mb-4 ${firstVisit ? "animate-[staggerUp_0.6s_ease-out_0.2s_both]" : "animate-fade-up"}`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 shadow-[0_0_6px_#6366f1] animate-pulse" />
                  <span className="text-[10px] font-semibold tracking-[0.12em] text-indigo-700 uppercase">Open Protocol</span>
                </div>
                <h1 className={`text-3xl sm:text-4xl font-bold tracking-tight mb-3 ${firstVisit ? "animate-[staggerUp_0.7s_ease-out_0.4s_both]" : "animate-fade-up"}`} style={{ fontFamily: "var(--font-display)" }} data-testid="text-search-title">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x">
                    Brainstorm
                  </span>
                </h1>
                <p className={`text-slate-500 text-sm max-w-lg mx-auto ${firstVisit ? "animate-[staggerUp_0.6s_ease-out_0.6s_both]" : "animate-fade-up"}`} data-testid="text-search-subtitle">
                  Search the decentralized web, ranked by trust.
                </p>
              </div>
            )}

            <div className={`relative group/search ${firstVisit ? "animate-[staggerUp_0.7s_ease-out_0.8s_both]" : ""}`} data-testid="container-search-input">
              <div className={`absolute -inset-0.5 bg-gradient-to-r from-indigo-300/10 via-violet-300/8 to-indigo-300/10 rounded-xl blur-md opacity-0 group-hover/search:opacity-100 transition-opacity duration-700 ${isSearching ? "opacity-100 animate-pulse" : ""}`} />
              {firstVisit && (
                <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 animate-[shimmer_2s_ease-in-out_1.2s_both]" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.08) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
                </div>
              )}
              <div className="relative flex items-center bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/80 shadow-sm shadow-slate-200/30 hover:shadow-md hover:shadow-indigo-100/15 hover:border-indigo-200/40 transition-all duration-300 overflow-hidden">
                {hasPovOption ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="pl-3 pr-1 flex items-center gap-1 shrink-0 group/pov focus:outline-none"
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
                        <Eye className="h-3 w-3" />
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
                  <div className="w-px h-6 bg-slate-200 mx-1 shrink-0" />
                )}
                {hasPovOption && (
                  <div className="pl-1 text-slate-400">
                    <SearchIcon className="h-5 w-5" />
                  </div>
                )}
                <Input
                  ref={inputRef}
                  placeholder="Signal Engine Optimization — rank signals, not pages."
                  className="border-0 shadow-none focus-visible:ring-0 h-12 sm:h-14 text-sm sm:text-base bg-transparent placeholder:text-slate-400"
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
                    className="px-2 text-slate-400 hover:text-slate-600 transition-colors"
                    onClick={() => { setQuery(""); setResults([]); setHasSearched(false); inputRef.current?.focus(); }}
                    data-testid="button-clear-search"
                  >
                    <span className="text-lg">&times;</span>
                  </button>
                )}
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || !query.trim()}
                  className="h-9 sm:h-10 px-4 sm:px-6 mr-1.5 sm:mr-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs sm:text-sm gap-1.5 shrink-0 transition-all"
                  data-testid="button-search"
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </div>
              <div className="flex items-center mt-2 px-1">
                {hasPovOption ? (
                  <div className="flex items-center gap-1.5" data-testid="text-pov-indicator">
                    <Eye className="h-3 w-3 text-slate-400" />
                    <p className="text-[10px] text-slate-400">
                      Viewing as <span className={`font-semibold ${pov === "nosfabrica" ? "text-indigo-500" : "text-emerald-600"}`}>{pov === "nosfabrica" ? "NosFabrica" : user.displayName || "My WoT"}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400">
                    Accepts names, npubs, hex keys, or NIP-05 handles
                  </p>
                )}
                {hasSearched && sortedResults.length > 0 && (
                  <p className="text-[10px] text-slate-400 ml-auto" data-testid="text-search-stats">
                    {sortedResults.length} result{sortedResults.length !== 1 ? "s" : ""} in {(searchTime / 1000).toFixed(2)}s
                  </p>
                )}
              </div>
            </div>
          </div>

          {isSearching && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-6">
              <div className="space-y-3" data-testid="container-search-loading">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/70 border border-slate-100 animate-pulse" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div className="h-11 w-11 rounded-full bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3.5 bg-slate-200 rounded-full w-36" />
                      <div className="h-2.5 bg-slate-100 rounded-full w-full max-w-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isSearching && hasSearched && sortedResults.length > 0 && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <div className="space-y-1" data-testid="container-search-results">
                {sortedResults.map((result, idx) => {
                  const trustInfo = result.trustInfluence !== null ? getTier(result.trustInfluence) : null;
                  const isStale = result.createdAt ? (Date.now() / 1000 - result.createdAt) > 365 * 86400 : false;
                  return (
                    <button
                      key={result.pubkey}
                      className={`w-full flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl hover:bg-white/90 hover:shadow-md hover:border-indigo-200/50 border border-transparent transition-all duration-200 text-left group cursor-pointer ${isStale ? "opacity-80" : ""}`}
                      onClick={() => navigate(`/profile/${result.npub}`)}
                      data-testid={`result-profile-${idx}`}
                    >
                      <Avatar className="h-10 w-10 sm:h-11 sm:w-11 border border-slate-200 shadow-sm shrink-0 mt-0.5">
                        {result.picture ? <AvatarImage src={result.picture} alt={getDisplayLabel(result)} className="object-cover" /> : null}
                        <AvatarFallback className="bg-indigo-50 text-indigo-700 font-bold text-xs">
                          {(result.name || result.displayName || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate" data-testid={`text-result-name-${idx}`}>
                            {getDisplayLabel(result)}
                          </span>
                          {trustInfo && trustInfo.name !== "Unverified" && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${trustInfo.badgeClass}`} data-testid={`badge-trust-${idx}`}>
                              <Shield className="h-2.5 w-2.5" />
                              {trustInfo.name}
                            </span>
                          )}
                          {result.nip05 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-full shrink-0" data-testid={`badge-nip05-${idx}`}>
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              <span className="truncate max-w-[120px] sm:max-w-[180px]">{result.nip05}</span>
                            </span>
                          )}
                          {isStale && result.createdAt && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 font-medium shrink-0" data-testid={`badge-stale-${idx}`}>
                              <Clock className="h-2.5 w-2.5" />
                              {getRelativeTime(result.createdAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5" data-testid={`text-result-npub-${idx}`}>
                          {result.npub.slice(0, 16)}...{result.npub.slice(-6)}
                        </p>
                        {result.about && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2" data-testid={`text-result-about-${idx}`}>
                            {truncateAbout(result.about)}
                          </p>
                        )}
                      </div>
                      <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0 mt-1.5 hidden sm:block" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showNoResults && (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-12 text-center" data-testid="container-no-results">
              <div className="p-8 rounded-2xl bg-white/60 border border-slate-100">
                <SearchIcon className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-700 mb-1">No profiles found</h3>
                <p className="text-xs text-slate-500">Try a different name or paste an npub directly.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="w-full py-5 mt-auto relative">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200/40 to-transparent" />
        <div className="max-w-xl mx-auto flex items-center justify-center gap-6 text-slate-400" data-testid="section-search-features">
          <div className="flex items-center gap-1.5" data-testid="card-search-feature-0">
            <Users className="h-3.5 w-3.5 text-indigo-300" />
            <span className="text-[11px] tracking-wide">Profile search</span>
          </div>
          <div className="w-px h-3 bg-slate-200/60" />
          <div className="flex items-center gap-1.5" data-testid="card-search-feature-1">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-300" />
            <span className="text-[11px] tracking-wide">Trust ranked</span>
          </div>
          <div className="w-px h-3 bg-slate-200/60" />
          <div className="flex items-center gap-1.5" data-testid="card-search-feature-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-300" />
            <span className="text-[11px] tracking-wide">Identity verified</span>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
