import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
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
  Lock,
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
import { getCurrentUser, logout, fetchProfile, type NostrUser } from "@/services/nostr";
import { useToast } from "@/hooks/use-toast";
import { isAdminPubkey } from "@/config/adminAccess";
import { AdminBadge } from "@/components/AdminBadge";
import { apiClient, isAuthRedirecting, hasSessionToken } from "@/services/api";
import { queryClient } from "@/lib/queryClient";
import { setProfileSeed, setStoredSearchSeed, type ProfileSeed } from "@/lib/profileSeed";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { openMobileMenu } from "@/lib/mobileMenuStore";
import { PovBadge } from "@/components/PovBadge";
import { SignInButton } from "@/components/SignInButton";
import { CleanBackground } from "@/components/CleanBackground";
import { useActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import {
  type SearchPov,
  type SearchResult,
  searchByText,
  getDisplayLabel,
  isLikelyNpub,
  isHexPubkey,
  isNip05Handle,
} from "@/lib/profileSearch";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";

function truncateAbout(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

export default function SearchPage() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const { toast } = useToast();

  const [query, setQuery] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; }
  });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [filterRank, setFilterRank] = useState<[number, number] | null>(null);
  const [filterMinFollowers, setFilterMinFollowers] = useState<number | null>(null);
  const [filterHasLightning, setFilterHasLightning] = useState(false);
  const [filterHasWebsite, setFilterHasWebsite] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  useEffect(() => {
    if (activeSuggestion < 0) return;
    document.getElementById(`suggestion-opt-${activeSuggestion}`)?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestion]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef(0);
  const suggestAbortRef = useRef(0);
  const suggestTimerRef = useRef<number | undefined>(undefined);
  const typedSinceSearchRef = useRef(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [suggestMaxH, setSuggestMaxH] = useState<number | null>(null);
  const [storedPov, setPov] = useActivePov();
  const { hasMywot } = useHasMywot();
  const pov: SearchPov = storedPov === "mywot" && !hasMywot ? "nosfabrica" : storedPov;
  useEffect(() => {
    if (storedPov === "mywot" && !hasMywot) {
      setPov("nosfabrica");
    }
  }, [storedPov, hasMywot, setPov]);
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
    // getSelf() goes through authenticatedFetch (wipes + redirects to "/" on
    // 401). Search is a public page, so only run it with a real session token
    // to avoid hijacking anonymous browsing when `nostr_user` is stale.
    enabled: !!user && hasSessionToken(),
    staleTime: 60_000,
  });

  const taPubkey = selfData?.data?.history?.ta_pubkey;
  const hasPovOption = !!taPubkey;

  const prefetchTimersRef = useRef<Map<string, number>>(new Map());

  const seedAndPrefetchProfile = useCallback((result: SearchResult) => {
    const hex = (result.pubkey || "").toLowerCase();
    if (!hex) return;
    const seed: ProfileSeed = {
      pubkey: hex,
      npub: result.npub,
      name: result.name,
      displayName: result.displayName,
      picture: result.picture,
      about: result.about,
      nip05: result.nip05,
      banner: result.banner,
      website: result.website,
      lud16: result.lud16,
      wotRank: result.wotRank ?? null,
      wotFollowers: result.wotFollowers ?? null,
      wotRankNosfabrica: result.wotRankNosfabrica ?? null,
      wotRankMywot: result.wotRankMywot ?? null,
      povFromSearch: pov,
    };
    setProfileSeed(hex, seed);
    queryClient.prefetchQuery({
      queryKey: ["profile", hex],
      queryFn: async () => {
        const res = await apiClient.getUserByPubkey(hex);
        return res?.data ?? null;
      },
      staleTime: 5 * 60_000,
    }).catch(() => {});
    queryClient.prefetchQuery({
      queryKey: ["nostr-profile", hex],
      queryFn: async () => (await fetchProfile(hex)) ?? null,
      staleTime: 5 * 60_000,
    }).catch(() => {});
  }, [pov]);

  const goToProfile = useCallback((result: SearchResult) => {
    seedAndPrefetchProfile(result);
    const hex = (result.pubkey || "").toLowerCase();
    const hasNosfabricaRank =
      typeof result.wotRankNosfabrica === "number" &&
      Number.isFinite(result.wotRankNosfabrica);
    const persistNosfabrica = pov === "nosfabrica" && hasNosfabricaRank && !!hex;
    if (persistNosfabrica) {
      setStoredSearchSeed(hex, {
        pubkey: hex,
        npub: result.npub,
        name: result.name,
        displayName: result.displayName,
        picture: result.picture,
        about: result.about,
        nip05: result.nip05,
        banner: result.banner,
        website: result.website,
        lud16: result.lud16,
        wotRank: result.wotRank ?? null,
        wotFollowers: result.wotFollowers ?? null,
        wotRankNosfabrica: result.wotRankNosfabrica ?? null,
        wotRankMywot: result.wotRankMywot ?? null,
        povFromSearch: pov,
      });
    }
    const suffix = persistNosfabrica ? "&showNosfabricaResult=1" : "";
    navigate(`/profile/${result.npub}?fromSearch=1&pov=${pov}${suffix}`);
  }, [seedAndPrefetchProfile, pov, navigate]);

  const handlePrefetchEnter = useCallback((result: SearchResult) => {
    const key = result.pubkey;
    if (!key || prefetchTimersRef.current.has(key)) return;
    const timer = window.setTimeout(() => {
      prefetchTimersRef.current.delete(key);
      seedAndPrefetchProfile(result);
    }, 150);
    prefetchTimersRef.current.set(key, timer);
  }, [seedAndPrefetchProfile]);

  const handlePrefetchLeave = useCallback((result: SearchResult) => {
    const t = prefetchTimersRef.current.get(result.pubkey);
    if (t !== undefined) {
      window.clearTimeout(t);
      prefetchTimersRef.current.delete(result.pubkey);
    }
  }, []);

  useEffect(() => {
    return () => {
      prefetchTimersRef.current.forEach((t) => window.clearTimeout(t));
      prefetchTimersRef.current.clear();
    };
  }, []);

  const didInitFromUrlRef = useRef(false);

  useEffect(() => {
    // Anonymous-friendly: search is public. Set the user when present so the
    // header shows the account menu, but do NOT redirect anon visitors away.
    setUser(getCurrentUser());

    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("npub");
    const group = params.get("fromGroup");
    if (prefill) {
      const target = group ? `/profile/${prefill}?fromGroup=${group}` : `/profile/${prefill}`;
      navigate(target, { replace: true });
    }
  }, [navigate]);

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
    // Running a full search cancels any pending/in-flight suggestion request and
    // closes the dropdown so it can't reopen on top of the results list.
    window.clearTimeout(suggestTimerRef.current);
    suggestAbortRef.current++;
    typedSinceSearchRef.current = false;
    setShowSuggestions(false);
    setIsSuggesting(false);
    resetFilters();

    if (isLikelyNpub(q)) {
      try {
        const decoded = nip19.decode(q);
        if (decoded.type === "npub" && typeof decoded.data === "string") {
          navigate(`/profile/${q}?pov=${pov}`);
          return;
        }
      } catch {}
    }

    if (isHexPubkey(q)) {
      const npub = nip19.npubEncode(q.toLowerCase());
      navigate(`/profile/${npub}?pov=${pov}`);
      return;
    }

    if (isNip05Handle(q)) {
      const searchId = ++searchAbortRef.current;
      setIsSearching(true);
      try {
        const hexPubkey = await resolveNip05(q);
        if (searchAbortRef.current !== searchId) return;
        const npub = nip19.npubEncode(hexPubkey);
        navigate(`/profile/${npub}?pov=${pov}`);
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
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get("q") !== q) {
        currentUrl.searchParams.set("q", q);
        window.history.pushState({}, "", currentUrl.pathname + currentUrl.search);
      }
    } catch {}

    try {
      const { results: searchResults, timeMs } = await searchByText(q, pov, user?.pubkey);
      if (searchAbortRef.current !== searchId) return;
      setResults(searchResults);
      setSearchTime(timeMs || Math.round(performance.now() - start));
    } catch (err) {
      if (searchAbortRef.current !== searchId) return;
      setResults([]);
      const message = err instanceof Error ? err.message : String(err ?? "");
      toast({
        title: "Search failed",
        description: message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      if (searchAbortRef.current === searchId) {
        setIsSearching(false);
      }
    }
  }, [query, pov, user?.pubkey, navigate, resetFilters, toast]);

  useEffect(() => {
    const onPopState = () => {
      const q = new URLSearchParams(window.location.search).get("q") || "";
      setQuery(q);
      didInitFromUrlRef.current = true;
      if (q.trim()) {
        handleSearch(q);
      } else {
        searchAbortRef.current++;
        setResults([]);
        setHasSearched(false);
        setIsSearching(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handleSearch]);

  useEffect(() => {
    // Run the URL-seeded search for everyone, including anonymous visitors
    // (search is public). Previously gated on `user`, which left anon `/search?q=`
    // links showing the empty state.
    if (didInitFromUrlRef.current) return;
    const q = new URLSearchParams(window.location.search).get("q") || "";
    if (q.trim()) {
      didInitFromUrlRef.current = true;
      handleSearch(q);
    }
  }, [handleSearch]);

  // Google-style live suggestions: fetch a few matches as the user types
  // (debounced). Driven by the input's onChange (not a query-watching effect)
  // so programmatic query changes (URL load, back button, POV re-search) never
  // pop the dropdown on top of the full results list. Skip direct identifiers
  // (npub / hex / NIP-05) since those navigate straight to a profile on Enter.
  const scheduleSuggest = useCallback((value: string) => {
    window.clearTimeout(suggestTimerRef.current);
    // Invalidate any prior pending/in-flight suggestion request *immediately*
    // (on every keystroke), so a slow earlier request can never resolve and
    // overwrite the dropdown with stale results for an older query.
    const reqId = ++suggestAbortRef.current;
    const q = value.trim();
    if (q.length < 2 || isLikelyNpub(q) || isHexPubkey(q) || isNip05Handle(q)) {
      typedSinceSearchRef.current = false;
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSuggesting(false);
      return;
    }
    typedSinceSearchRef.current = true;
    setIsSuggesting(true);
    setShowSuggestions(true);
    suggestTimerRef.current = window.setTimeout(async () => {
      try {
        const { results: suggestResults } = await searchByText(q, pov, user?.pubkey);
        if (suggestAbortRef.current !== reqId) return;
        setSuggestions(suggestResults.slice(0, 7));
        setActiveSuggestion(-1);
        setShowSuggestions(true);
      } catch {
        if (suggestAbortRef.current !== reqId) return;
        setSuggestions([]);
      } finally {
        if (suggestAbortRef.current === reqId) setIsSuggesting(false);
      }
    }, 120);
  }, [pov, user?.pubkey]);

  useEffect(() => {
    return () => window.clearTimeout(suggestTimerRef.current);
  }, []);

  // Close the suggestions dropdown when clicking outside the search box.
  useEffect(() => {
    if (!showSuggestions) return;
    const onDown = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSuggestions]);

  // Cap the suggestions dropdown to the space actually available below the input.
  // The search box is vertically centered, so a fixed max-height would push the
  // lower rows + the "See all" footer below the fold where they can't be reached.
  useEffect(() => {
    if (!showSuggestions) return;
    const recompute = () => {
      const el = searchContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 8px gap (mt-2) below the input, 16px breathing room above the viewport edge.
      // Never exceed the space available below the input — the page is overflow-hidden,
      // so any height beyond this would clip the lower rows / sticky CTA off-screen.
      const available = window.innerHeight - rect.bottom - 8 - 16;
      setSuggestMaxH(Math.max(0, Math.floor(available)));
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [showSuggestions, suggestions.length]);

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

  if (isAuthRedirecting()) return null;

  const isAnon = !user;

  const showEmptyState = !hasSearched && results.length === 0 && !isSearching;
  const showNoResults = hasSearched && results.length === 0 && !isSearching;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-search">
      <CleanBackground />

      {isAnon ? (
        <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-4" data-testid="header-search-anon">
          <button
            type="button"
            onClick={() => navigate("/about")}
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            data-testid="link-search-about"
          >
            About
          </button>
          <SignInButton
            variant="primary"
            label="Sign in"
            className="!rounded-full sm:px-5"
            data-testid="button-search-sign-in"
          />
        </header>
      ) : (
      <AppHeader user={user} onLogout={handleLogout} calcDone={calcDone} active="home" variant="light" />
      )}


      <main className="relative z-10 w-full flex-1 flex flex-col">
        <div className={`transition-all duration-500 ${hasSearched ? "pt-6 sm:pt-8" : "flex-1 flex flex-col justify-center -mt-12 sm:-mt-16"}`}>
          <div className={`max-w-2xl mx-auto px-3 sm:px-6 w-full transition-all duration-500 ${hasSearched ? "mb-4 sm:mb-6" : "mb-0"}`}>
            {!hasSearched && (
              <div className="text-center mb-6 sm:mb-10" data-testid="section-search-hero">
                <div className={`inline-flex flex-col items-center ${firstVisit ? "animate-[staggerUp_0.6s_ease-out_0.1s_both]" : "animate-fade-up"}`}>
                  <div className="relative flex items-center justify-center mb-2">
                    <div
                      aria-hidden="true"
                      className="motion-safe:animate-blob-morph motion-reduce:hidden absolute -z-10 h-20 w-20 sm:h-28 sm:w-28 bg-gradient-to-br from-indigo-300/50 via-violet-300/40 to-indigo-200/30 blur-2xl"
                      data-testid="shape-hero-blob"
                    />
                    <BrainLogo size={36} clickable className="text-indigo-600 sm:hidden" />
                    <BrainLogo size={44} clickable className="text-indigo-600 hidden sm:block" />
                  </div>
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

            <div ref={searchContainerRef} className={`relative ${firstVisit ? "animate-[staggerUp_0.7s_ease-out_0.8s_both]" : ""}`} data-testid="container-search-input">
              <div className="relative flex items-center bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-[0_1px_6px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] focus-within:shadow-[0_2px_12px_rgba(99,102,241,0.1)] focus-within:border-indigo-200 transition-all duration-300">
                <div className="pl-4 text-slate-400">
                  <SearchIcon className="h-5 w-5" />
                </div>
                <Input
                  ref={inputRef}
                  placeholder="Search by name, bio, website..."
                  className={`border-0 shadow-none focus-visible:ring-0 h-11 sm:h-14 text-[13px] sm:text-base bg-transparent placeholder:text-slate-400/70 min-w-0 ${isSearching ? "cursor-wait opacity-60" : ""}`}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    scheduleSuggest(e.target.value);
                  }}
                  onFocus={() => {
                    if (typedSinceSearchRef.current && suggestions.length > 0 && query.trim().length >= 2) setShowSuggestions(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" && showSuggestions && suggestions.length > 0) {
                      e.preventDefault();
                      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
                    } else if (e.key === "ArrowUp" && showSuggestions && suggestions.length > 0) {
                      e.preventDefault();
                      setActiveSuggestion((i) => Math.max(i - 1, -1));
                    } else if (e.key === "Enter") {
                      if (showSuggestions && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
                        e.preventDefault();
                        goToProfile(suggestions[activeSuggestion]);
                      } else {
                        setShowSuggestions(false);
                        handleSearch();
                      }
                    } else if (e.key === "Escape") {
                      setShowSuggestions(false);
                      setActiveSuggestion(-1);
                    }
                  }}
                  disabled={isSearching}
                  aria-busy={isSearching}
                  autoFocus={!hasSearched}
                  role="combobox"
                  aria-expanded={showSuggestions}
                  aria-controls="search-suggestions"
                  aria-autocomplete="list"
                  aria-activedescendant={showSuggestions && activeSuggestion >= 0 ? `suggestion-opt-${activeSuggestion}` : undefined}
                  data-testid="input-search"
                />
                {query && (
                  <button
                    className="px-2 text-slate-300 hover:text-slate-500 transition-colors"
                    onClick={() => {
                      searchAbortRef.current++;
                      suggestAbortRef.current++;
                      window.clearTimeout(suggestTimerRef.current);
                      setIsSearching(false);
                      setSuggestions([]); setShowSuggestions(false); setIsSuggesting(false);
                      setQuery(""); setResults([]); setHasSearched(false); inputRef.current?.focus();
                      try {
                        const url = new URL(window.location.href);
                        if (url.searchParams.has("q")) {
                          url.searchParams.delete("q");
                          window.history.pushState({}, "", url.pathname + (url.search ? url.search : ""));
                        }
                      } catch {}
                    }}
                    data-testid="button-clear-search"
                  >
                    <span className="text-lg">&times;</span>
                  </button>
                )}
                <Button
                  onClick={() => { setShowSuggestions(false); handleSearch(); }}
                  disabled={isSearching || !query.trim()}
                  className="h-8 sm:h-10 px-3 sm:px-6 mr-1 sm:mr-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg sm:rounded-xl font-medium text-xs sm:text-sm shrink-0 transition-all"
                  data-testid="button-search"
                >
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <><SearchIcon className="h-3.5 w-3.5 sm:hidden" /><span className="hidden sm:inline">Search</span></>}
                </Button>
              </div>

              {showSuggestions && (suggestions.length > 0 || isSuggesting) && (
                <div
                  id="search-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-xl border border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden animate-fade-up"
                  style={{ maxHeight: suggestMaxH ? `${suggestMaxH}px` : "min(28rem, calc(100vh - 9rem))" }}
                  data-testid="container-suggestions"
                >
                  {isSuggesting && suggestions.length === 0 ? (
                    <div className="px-4 py-3 flex items-center gap-2 text-slate-400 text-xs" data-testid="suggestions-loading">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0" data-testid="list-suggestions">
                      {suggestions.map((s, i) => {
                        const handle = s.nip05 ? s.nip05.replace(/^_@/, "") : null;
                        return (
                          <button
                            key={s.pubkey}
                            id={`suggestion-opt-${i}`}
                            type="button"
                            role="option"
                            aria-selected={i === activeSuggestion}
                            className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left transition-colors ${i === activeSuggestion ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                            onMouseEnter={() => { setActiveSuggestion(i); handlePrefetchEnter(s); }}
                            onMouseLeave={() => handlePrefetchLeave(s)}
                            onClick={() => goToProfile(s)}
                            data-testid={`suggestion-${i}`}
                          >
                            <Avatar className="h-8 w-8 border border-slate-200/80 shrink-0">
                              {s.picture ? <AvatarImage src={s.picture} alt={getDisplayLabel(s)} className="object-cover" /> : null}
                              <AvatarFallback className="bg-indigo-50 text-indigo-600 font-bold text-xs">
                                {(s.name || s.displayName || "?").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-slate-900 truncate" data-testid={`suggestion-name-${i}`}>
                                {getDisplayLabel(s)}
                              </p>
                              {handle && (
                                <p className="text-[11px] text-indigo-600 truncate flex items-center gap-0.5">
                                  <Check className="h-2.5 w-2.5 shrink-0 text-indigo-500" />
                                  {handle}
                                </p>
                              )}
                            </div>
                            {s.wotRank != null && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0" data-testid={`suggestion-rank-${i}`}>
                                <BrainLogo size={10} className="shrink-0" />
                                {s.wotRank}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      </div>
                      <button
                        type="button"
                        className={`shrink-0 w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 text-left border-t border-slate-100 text-[12px] font-medium transition-colors ${activeSuggestion === -1 ? "bg-slate-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"}`}
                        onMouseEnter={() => setActiveSuggestion(-1)}
                        onClick={() => { setShowSuggestions(false); handleSearch(); }}
                        data-testid="suggestion-see-all"
                      >
                        <SearchIcon className="h-3.5 w-3.5 shrink-0" />
                        See all results for "{query.trim()}"
                      </button>
                    </>
                  )}
                </div>
              )}
              {hasSearched && isAnon && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5 px-1" data-testid="text-pov-indicator-anon">
                  <Telescope className="h-3 w-3 text-slate-400" />
                  <span className="text-[11px] text-slate-400">Viewing as</span>
                  <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5 ml-0.5" role="tablist" aria-label="Trust perspective">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white text-indigo-500 shadow-sm"
                      data-testid="pill-pov-nosfabrica-anon"
                    >
                      NosFabrica
                    </span>
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full text-slate-300 cursor-not-allowed"
                      title="Create an account to unlock your personalized Web of Trust"
                      data-testid="pill-pov-mywot-anon"
                    >
                      <Lock className="h-2.5 w-2.5" />
                      Create account
                    </span>
                  </div>
                  <SignInButton
                    variant="link"
                    label="Sign in to unlock"
                    data-testid="link-pov-signin"
                  />
                </div>
              )}
              {hasSearched && !isAnon && hasPovOption && (
                <div className="flex items-center gap-1.5 mt-2.5 px-1" data-testid="text-pov-indicator">
                  <Telescope className="h-3 w-3 text-slate-400" />
                  <span className="text-[11px] text-slate-400">Viewing as</span>
                  <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5 ml-0.5" role="tablist" aria-label="Trust perspective">
                    <button
                      type="button"
                      onClick={() => handlePovSwitch("nosfabrica")}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${
                        pov === "nosfabrica"
                          ? "bg-white text-indigo-500 shadow-sm"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                      aria-pressed={pov === "nosfabrica"}
                      data-testid="pill-pov-nosfabrica"
                    >
                      NosFabrica
                    </button>
                    <button
                      type="button"
                      onClick={() => hasMywot && handlePovSwitch("mywot")}
                      disabled={!hasMywot}
                      title={hasMywot ? undefined : "Calculate your trust graph first"}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${
                        pov === "mywot"
                          ? "bg-white text-emerald-600 shadow-sm"
                          : hasMywot
                            ? "text-slate-400 hover:text-slate-600"
                            : "text-slate-300 cursor-not-allowed"
                      }`}
                      aria-pressed={pov === "mywot"}
                      data-testid="pill-pov-mywot"
                    >
                      {user?.displayName || "My WoT"}
                    </button>
                  </div>
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
                      onMouseEnter={() => handlePrefetchEnter(result)}
                      onMouseLeave={() => handlePrefetchLeave(result)}
                      onFocus={() => handlePrefetchEnter(result)}
                      onBlur={() => handlePrefetchLeave(result)}
                      onClick={() => goToProfile(result)}
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
                          {result.nip05 && (
                            <p className="text-[10px] sm:text-[11px] text-indigo-600 truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-nip05-${idx}`}>
                              <Check className="h-2.5 w-2.5 shrink-0 text-indigo-500" />
                              {result.nip05.replace(/^_@/, "")}
                            </p>
                          )}
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

      {!isAnon && (
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
      )}

      {isAnon ? (
        <footer
          className="relative z-10 mt-auto flex items-center justify-between px-4 sm:px-8 py-4 text-xs"
          data-testid="footer-search-anon"
        >
          <button
            type="button"
            onClick={() => navigate("/developers")}
            className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            data-testid="link-search-developers"
          >
            Developers
          </button>
          <button
            type="button"
            onClick={() => navigate("/how-search-works")}
            className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            data-testid="link-search-how-search-works"
          >
            How search works
          </button>
        </footer>
      ) : (
        <Footer />
      )}
    </div>
  );
}
