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
      const searchResults = await searchRelay(q, user?.pubkey, 30);
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
  }, [query, user, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user || isAuthRedirecting()) return null;

  const showEmptyState = !hasSearched && results.length === 0 && !isSearching;
  const showNoResults = hasSearched && results.length === 0 && !isSearching;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-search">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.18] pointer-events-none" />

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
                  <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">Agent HQ</span>
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
              <div className="text-center mb-8 animate-fade-up" data-testid="section-search-hero">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-indigo-500/10 shadow-sm backdrop-blur-sm mb-4">
                  <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1] animate-pulse" />
                  <span className="text-[10px] font-bold tracking-[0.15em] text-indigo-900 uppercase">Web of Trust Search</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3" style={{ fontFamily: "var(--font-display)" }} data-testid="text-search-title">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x">
                    Brainstorm Search
                  </span>
                </h1>
                <p className="text-slate-500 text-sm max-w-lg mx-auto" data-testid="text-search-subtitle">
                  Find anyone on Nostr. Search by name, enter an npub, or paste a NIP-05 handle.
                </p>
              </div>
            )}

            <div className="relative group/search" data-testid="container-search-input">
              <div className={`absolute -inset-1 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-indigo-500/20 rounded-2xl blur-lg opacity-0 group-hover/search:opacity-100 transition-opacity duration-500 ${isSearching ? "opacity-100 animate-pulse" : ""}`} />
              <div className="relative flex items-center bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:border-indigo-300/50 transition-all duration-300 overflow-hidden">
                <div className="pl-4 text-slate-400">
                  <SearchIcon className="h-5 w-5" />
                </div>
                <Input
                  ref={inputRef}
                  placeholder="Search people on Nostr..."
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
              <div className="flex items-center gap-3 mt-2 px-1">
                <p className="text-[10px] text-slate-400">
                  Accepts names, npubs, hex keys, or NIP-05 handles
                </p>
                {hasSearched && results.length > 0 && (
                  <p className="text-[10px] text-slate-400 ml-auto" data-testid="text-search-stats">
                    {results.length} result{results.length !== 1 ? "s" : ""} in {(searchTime / 1000).toFixed(2)}s
                  </p>
                )}
              </div>
            </div>
          </div>

          {!hasSearched && (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-10 animate-fade-up" style={{ animationDelay: "0.15s" }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="section-search-features">
                {[
                  { icon: Users, title: "Profile Discovery", desc: "Search across millions of indexed Nostr profiles by name or handle." },
                  { icon: TrendingUp, title: "Trust Ranked", desc: "Results scored by your Web of Trust — see who your network trusts." },
                  { icon: CheckCircle2, title: "Identity Verified", desc: "NIP-05 verification and trust signals shown at a glance." },
                ].map((f, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/60 border border-slate-100 hover:border-indigo-200/50 transition-colors" data-testid={`card-search-feature-${i}`}>
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
                      <f.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-700">{f.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {!isSearching && hasSearched && results.length > 0 && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <div className="space-y-1" data-testid="container-search-results">
                {results.map((result, idx) => (
                  <button
                    key={result.pubkey}
                    className="w-full flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl hover:bg-white/90 hover:shadow-md hover:border-indigo-200/50 border border-transparent transition-all duration-200 text-left group cursor-pointer"
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
                        {result.nip05 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-full shrink-0" data-testid={`badge-nip05-${idx}`}>
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            <span className="truncate max-w-[120px] sm:max-w-[180px]">{result.nip05}</span>
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
                ))}
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

      <Footer />
    </div>
  );
}
