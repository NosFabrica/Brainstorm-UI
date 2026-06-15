import { useLocation } from "wouter";
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type FormEvent } from "react";
import { nip19 } from "nostr-tools";
import {
  Search,
  ArrowRight,
  Loader2,
  Check,
  X,
  SlidersHorizontal,
  Zap,
  Globe,
  Users,
  Radar,
  Copy,
} from "lucide-react";
import { ComputingBackground } from "@/components/ComputingBackground";
import { BrainLogo } from "@/components/BrainLogo";
import { ProfileCardIcon } from "@/components/ProfileCardIcon";
import { SignInButton } from "@/components/SignInButton";
import { AppHeader } from "@/components/AppHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getCurrentUser, fetchProfile, logout, type NostrUser } from "@/services/nostr";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { queryClient } from "@/lib/queryClient";
import { apiClient } from "@/services/api";
import { useActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";
import { useToast } from "@/hooks/use-toast";
import { setProfileSeed, setStoredSearchSeed, type ProfileSeed } from "@/lib/profileSeed";
import {
  searchByText,
  getDisplayLabel,
  isLikelyNpub,
  isHexPubkey,
  isNip05Handle,
  type SearchResult,
} from "@/lib/profileSearch";

// Anonymous visitors search from the NosFabrica ("house") POV. Logged-in users
// stay on this search-first home and search from their active trust perspective.
const ANON_POV = "nosfabrica" as const;

// Example prompts the empty search box gently cycles through to teach
// visitors what they can search for. The first entry is the static
// fallback (used as-is when the user prefers reduced motion).
const PLACEHOLDER_EXAMPLES = [
  "Search by name, bio, website…",
  'Search "Jack"',
  'Search "Prague"',
  'Search a handle like "odell@primal.net"',
  "Search a public key…",
];

function truncateAbout(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

async function resolveNip05(handle: string): Promise<string> {
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
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; }
  });
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [phIndex, setPhIndex] = useState(0);
  const [phVisible, setPhVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [suggestMaxH, setSuggestMaxH] = useState<number | null>(null);

  // Full search results state (merged in from the retired /search page).
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [filterRank, setFilterRank] = useState<[number, number] | null>(null);
  const [filterMinFollowers, setFilterMinFollowers] = useState<number | null>(null);
  const [filterHasLightning, setFilterHasLightning] = useState(false);
  const [filterHasWebsite, setFilterHasWebsite] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const suggestAbortRef = useRef(0);
  const searchAbortRef = useRef(0);
  const suggestTimerRef = useRef<number | undefined>(undefined);
  const phFadeTimerRef = useRef<number | undefined>(undefined);
  const typedSinceSearchRef = useRef(false);
  // True only when the highlighted suggestion was reached via keyboard arrows.
  // Mouse hover sets the highlight for visuals/prefetch but leaves this false so
  // pressing Enter still runs a full search instead of opening a hovered profile.
  const kbdNavRef = useRef(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didInitFromUrlRef = useRef(false);
  const prefetchTimersRef = useRef<Map<string, number>>(new Map());

  // Live current-user state: re-reads when the profile metadata (avatar/name)
  // arrives shortly after login, so the header avatar appears on first load
  // without needing a refresh. See useCurrentUser.
  const [user, setUser] = useCurrentUser();
  const [pov, setPov] = useActivePov();
  const { hasMywot } = useHasMywot();
  // Permission to search from one's own perspective, per GET /user/isSearchObserver.
  const { isSearchObserver } = useIsSearchObserver();
  const canUseMywot = hasMywot && isSearchObserver;

  // Logged-in users stay on this search-first home and search from their active
  // trust perspective; "My WoT" gracefully falls back to the house view unless
  // the user both has a personalized graph (hasMywot) and is permitted to be
  // their own search observer (isSearchObserver). Anonymous visitors always use
  // the house view.
  const effectivePov = useMemo(() => {
    if (!user) return ANON_POV;
    return pov === "mywot" && !canUseMywot ? ANON_POV : pov;
  }, [user, pov, canUseMywot]);

  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
  }, []);

  // Gate the Network app tile until a trust graph has been calculated. We read
  // the locally cached completion flag so the search-first home stays instant
  // (no blocking API call just to render the launcher).
  const calcDone = useMemo(() => {
    try {
      return localStorage.getItem("brainstorm_calc_completed") === "true";
    } catch {
      return false;
    }
  }, [user]);

  // Honor the OS "reduce motion" setting — those users see a single static
  // placeholder with no cycling.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Gently cycle the empty box's placeholder through example prompts. Runs only
  // while the field is empty and motion is allowed; a soft fade-out/in (300ms)
  // bridges each swap. Pauses the moment the user types (query non-empty).
  useEffect(() => {
    if (prefersReducedMotion || query.length > 0) {
      window.clearTimeout(phFadeTimerRef.current);
      setPhVisible(true);
      return;
    }
    setPhVisible(true);
    const interval = window.setInterval(() => {
      setPhVisible(false);
      phFadeTimerRef.current = window.setTimeout(() => {
        setPhIndex((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
        setPhVisible(true);
      }, 300);
    }, 3200);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(phFadeTimerRef.current);
    };
  }, [prefersReducedMotion, query]);

  // Keep the keyboard-highlighted suggestion scrolled into view.
  useEffect(() => {
    if (activeSuggestion < 0) return;
    document.getElementById(`home-suggestion-opt-${activeSuggestion}`)?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestion]);

  // Live, debounced profile suggestions as the user types (Google-style).
  // Skips direct identifiers (npub / hex / NIP-05) since those resolve straight
  // to a profile on submit. A request token is bumped on every keystroke so a
  // slow earlier request can never overwrite newer suggestions.
  const scheduleSuggest = useCallback((value: string) => {
    window.clearTimeout(suggestTimerRef.current);
    const reqId = ++suggestAbortRef.current;
    const q = value.trim();
    // Any edit to the query invalidates a prior keyboard selection so Enter
    // falls back to a full search until the user arrow-navigates again.
    kbdNavRef.current = false;
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
        const { results: suggestResults } = await searchByText(q, effectivePov, user?.pubkey, 10);
        if (suggestAbortRef.current !== reqId) return;
        setSuggestions(suggestResults.slice(0, 7));
        setActiveSuggestion(-1);
        kbdNavRef.current = false;
        setShowSuggestions(true);
      } catch {
        if (suggestAbortRef.current !== reqId) return;
        setSuggestions([]);
      } finally {
        if (suggestAbortRef.current === reqId) setIsSuggesting(false);
      }
    }, 120);
  }, [effectivePov, user?.pubkey]);

  useEffect(() => {
    return () => window.clearTimeout(suggestTimerRef.current);
  }, []);

  // Close the dropdown on outside click.
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
      povFromSearch: effectivePov,
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
  }, [effectivePov]);

  const goToProfile = useCallback((result: SearchResult) => {
    seedAndPrefetchProfile(result);
    const hex = (result.pubkey || "").toLowerCase();
    const hasNosfabricaRank =
      typeof result.wotRankNosfabrica === "number" && Number.isFinite(result.wotRankNosfabrica);
    const persistNosfabrica = hasNosfabricaRank && !!hex;
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
        povFromSearch: effectivePov,
      });
    }
    const suffix = persistNosfabrica ? "&showNosfabricaResult=1" : "";
    setLocation(`/profile/${result.npub}?fromSearch=1&pov=${effectivePov}${suffix}`);
  }, [seedAndPrefetchProfile, setLocation, effectivePov]);

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

  const cancelSuggest = useCallback(() => {
    window.clearTimeout(suggestTimerRef.current);
    suggestAbortRef.current++;
    typedSinceSearchRef.current = false;
    setShowSuggestions(false);
    setIsSuggesting(false);
  }, []);

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
          setLocation(`/profile/${q}?pov=${effectivePov}`);
          return;
        }
      } catch {}
    }

    if (isHexPubkey(q)) {
      const npub = nip19.npubEncode(q.toLowerCase());
      setLocation(`/profile/${npub}?pov=${effectivePov}`);
      return;
    }

    if (isNip05Handle(q)) {
      const searchId = ++searchAbortRef.current;
      setIsSearching(true);
      try {
        const hexPubkey = await resolveNip05(q);
        if (searchAbortRef.current !== searchId) return;
        const npub = nip19.npubEncode(hexPubkey);
        setLocation(`/profile/${npub}?pov=${effectivePov}`);
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
      const { results: searchResults, timeMs } = await searchByText(q, effectivePov, user?.pubkey, 100);
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
  }, [query, effectivePov, user?.pubkey, setLocation, resetFilters, toast]);

  // Sync the back/forward buttons with the search results list.
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

  // Run the URL-seeded search for everyone, including anonymous visitors
  // (search is public). Carries over `/search?q=` deep links onto the home.
  useEffect(() => {
    if (didInitFromUrlRef.current) return;
    const q = new URLSearchParams(window.location.search).get("q") || "";
    if (q.trim()) {
      didInitFromUrlRef.current = true;
      handleSearch(q);
    }
  }, [handleSearch]);

  // Re-run the active search when the global trust perspective changes so the
  // results reflect the currently selected POV.
  const prevPovRef = useRef(effectivePov);
  useEffect(() => {
    if (prevPovRef.current === effectivePov) return;
    prevPovRef.current = effectivePov;
    const q = query.trim();
    if (!q) return;
    // Re-run the full results list if a search has already been submitted.
    if (hasSearched) {
      handleSearch();
    }
    // Also refresh the live suggestion dropdown when the user is mid-type
    // (typed but not yet submitted), so suggestions reflect the new
    // perspective without requiring another keystroke. scheduleSuggest owns
    // its own request-id race protection, so stale responses can't win.
    if (typedSinceSearchRef.current && q.length >= 2) {
      scheduleSuggest(query);
    }
  }, [effectivePov, hasSearched, query, handleSearch, scheduleSuggest]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    cancelSuggest();
    handleSearch();
  };

  const clearSearch = useCallback(() => {
    searchAbortRef.current++;
    cancelSuggest();
    setQuery("");
    setSuggestions([]);
    setActiveSuggestion(-1);
    setResults([]);
    setHasSearched(false);
    setIsSearching(false);
    inputRef.current?.focus();
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("q")) {
        url.searchParams.delete("q");
        window.history.pushState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    } catch {}
  }, [cancelSuggest]);

  // The suggestions dropdown is open whenever we have something to show.
  // We lift the search box toward the top when it opens (or once a search is
  // under way) so the list/results have room.
  const dropdownOpen = showSuggestions && (suggestions.length > 0 || isSuggesting);
  const lifted = hasSearched || isSearching || query.trim().length > 0;

  useLayoutEffect(() => {
    if (!dropdownOpen) return;
    const recompute = () => {
      const el = searchContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const available = vv
        ? vv.height - (rect.bottom - vv.offsetTop) - 8 - 16
        : window.innerHeight - rect.bottom - 8 - 16;
      setSuggestMaxH(Math.max(0, Math.floor(available)));
    };
    recompute();
    let raf = 0;
    const loop = () => {
      recompute();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const stop = window.setTimeout(() => cancelAnimationFrame(raf), 650);
    const vv = window.visualViewport;
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    vv?.addEventListener("resize", recompute);
    vv?.addEventListener("scroll", recompute);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stop);
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
      vv?.removeEventListener("resize", recompute);
      vv?.removeEventListener("scroll", recompute);
    };
  }, [dropdownOpen]);

  const showNoResults = hasSearched && results.length === 0 && !isSearching;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col relative overflow-hidden" data-testid="page-home">
      <ComputingBackground variant="light" />

      {user ? (
        <AppHeader user={user} onLogout={handleLogout} calcDone={calcDone} active="home" variant="light" />
      ) : (
        <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-4">
          <button
            type="button"
            onClick={() => setLocation("/about")}
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            data-testid="link-home-about"
          >
            About
          </button>
          <SignInButton
            variant="primary"
            label="Sign in"
            className="!rounded-full sm:px-5"
            data-testid="button-home-sign-in"
          />
        </header>
      )}

      <main className={`relative z-10 flex-1 flex flex-col items-center px-4 ${dropdownOpen || lifted ? "justify-start pt-6 sm:pt-10" : "justify-center -mt-10 sm:-mt-16"}`}>
        <div className="w-full max-w-2xl mx-auto text-center" style={{ animation: "homeFadeUp 0.5s ease-out" }}>
          <style>{`@keyframes homeFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2 mb-1.5">
              <BrainLogo size={32} clickable className="text-indigo-600" />
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                data-testid="text-home-title"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800">
                  Brainstorm
                </span>
              </h1>
            </div>
            <p className="text-slate-500 text-sm sm:text-base" data-testid="text-home-subtitle">
              Search across millions of profiles
            </p>
          </div>

          <div ref={searchContainerRef} className="relative">
            <form onSubmit={onSubmit} className="relative group" data-testid="form-home-search">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/0 via-indigo-400/15 to-indigo-500/0 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-5 pr-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.08)] focus-within:border-indigo-300 focus-within:shadow-[0_4px_18px_rgba(99,102,241,0.12)] transition-all duration-300">
                <Search className="h-5 w-5 text-slate-400 shrink-0" />
                <div className="relative flex-1 min-w-0">
                <input
                  ref={inputRef}
                  type="text"
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
                      kbdNavRef.current = true;
                      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
                    } else if (e.key === "ArrowUp" && showSuggestions && suggestions.length > 0) {
                      e.preventDefault();
                      kbdNavRef.current = true;
                      setActiveSuggestion((i) => Math.max(i - 1, -1));
                    } else if (e.key === "Enter") {
                      // Only open a single profile when the user explicitly arrow-keyed
                      // to a suggestion. Plain typing + Enter (even with the mouse
                      // resting over the dropdown) always runs a full text search.
                      if (showSuggestions && kbdNavRef.current && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
                        e.preventDefault();
                        goToProfile(suggestions[activeSuggestion]);
                      }
                      // otherwise let the form submit handler run (full search)
                    } else if (e.key === "Escape") {
                      setShowSuggestions(false);
                      setActiveSuggestion(-1);
                    }
                  }}
                  placeholder=""
                  aria-label="Search profiles"
                  className="w-full bg-transparent text-slate-900 text-base outline-none py-1.5 min-w-0"
                  autoFocus={!hasSearched}
                  role="combobox"
                  aria-expanded={showSuggestions}
                  aria-controls="home-search-suggestions"
                  aria-autocomplete="list"
                  aria-activedescendant={showSuggestions && activeSuggestion >= 0 ? `home-suggestion-opt-${activeSuggestion}` : undefined}
                  data-testid="input-home-search"
                />
                {query.length === 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden"
                  >
                    <span
                      className={`truncate text-slate-400 text-base transition-opacity duration-300 ${phVisible ? "opacity-100" : "opacity-0"}`}
                      data-testid="text-home-placeholder"
                    >
                      {prefersReducedMotion ? PLACEHOLDER_EXAMPLES[0] : PLACEHOLDER_EXAMPLES[phIndex]}
                    </span>
                  </span>
                )}
                </div>
                {query.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Clear search"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                    data-testid="button-home-clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors active:scale-[0.98] shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  data-testid="button-home-search"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span className="hidden sm:inline">Search</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {dropdownOpen && (
              <div
                id="home-search-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden text-left"
                style={{ maxHeight: suggestMaxH !== null ? `${suggestMaxH}px` : "min(28rem, calc(100dvh - 9rem))" }}
                data-testid="container-home-suggestions"
              >
                {isSuggesting && suggestions.length === 0 ? (
                  <div className="px-4 py-3 flex items-center gap-2 text-slate-400 text-xs" data-testid="home-suggestions-loading">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto overscroll-contain min-h-0" data-testid="list-home-suggestions">
                    {suggestions.map((s, i) => {
                      const handle = s.nip05 ? s.nip05.replace(/^_@/, "") : null;
                      return (
                        <button
                          key={s.pubkey}
                          id={`home-suggestion-opt-${i}`}
                          type="button"
                          role="option"
                          aria-selected={i === activeSuggestion}
                          className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left transition-colors ${i === activeSuggestion ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                          onMouseEnter={() => { kbdNavRef.current = false; setActiveSuggestion(i); handlePrefetchEnter(s); }}
                          onMouseLeave={() => handlePrefetchLeave(s)}
                          onClick={() => goToProfile(s)}
                          data-testid={`home-suggestion-${i}`}
                        >
                          <Avatar className="h-8 w-8 border border-slate-200/80 shrink-0">
                            {s.picture ? <AvatarImage src={s.picture} alt={getDisplayLabel(s)} className="object-cover" /> : null}
                            <AvatarFallback className="bg-indigo-50 text-indigo-600 font-bold text-xs">
                              {(s.name || s.displayName || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900 truncate" data-testid={`home-suggestion-name-${i}`}>
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
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0" data-testid={`home-suggestion-rank-${i}`}>
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
                      className={`w-full shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 text-left border-t border-slate-100 text-[12px] font-medium transition-colors ${activeSuggestion === -1 ? "bg-slate-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"}`}
                      onMouseEnter={() => { kbdNavRef.current = false; setActiveSuggestion(-1); }}
                      onMouseDown={(e) => { e.preventDefault(); setShowSuggestions(false); handleSearch(query); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSuggestions(false); handleSearch(query); } }}
                      data-testid="home-suggestion-see-all"
                    >
                      <Search className="h-3.5 w-3.5 shrink-0" />
                      See all results for "{query.trim()}"
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {!user ? (
            <p className="text-xs text-slate-500 mt-5 flex items-center justify-center gap-2" data-testid="text-home-hint">
              <span data-testid="text-home-pov-label">Not Personalized</span>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => setLocation("/personalization")}
                className="text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                data-testid="link-home-learn-more"
              >
                What is this?
              </button>
            </p>
          ) : (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500" data-testid="text-home-hint">
              <div
                role="group"
                aria-label="Trust perspective"
                className="inline-flex items-center gap-2"
                data-testid="toggle-home-pov"
              >
                <button
                  type="button"
                  onClick={() => setPov("nosfabrica")}
                  aria-pressed={effectivePov === "nosfabrica"}
                  className={
                    "rounded px-1.5 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 " +
                    (effectivePov === "nosfabrica"
                      ? "font-semibold text-indigo-600"
                      : "font-medium text-slate-500 hover:text-slate-700")
                  }
                  data-testid="toggle-home-pov-nosfabrica"
                >
                  Brainstorm
                </button>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => {
                    if (canUseMywot) setPov("mywot");
                  }}
                  disabled={!canUseMywot}
                  aria-pressed={effectivePov === "mywot"}
                  title={
                    !hasMywot
                      ? "Calculate your trust network in Settings to enable"
                      : !isSearchObserver
                        ? "Personalized search isn't available for your account yet"
                        : undefined
                  }
                  className={
                    "rounded px-1.5 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 " +
                    (effectivePov === "mywot"
                      ? "font-semibold text-emerald-700"
                      : "font-medium text-slate-500 hover:text-slate-700") +
                    (!canUseMywot ? " opacity-50 cursor-not-allowed" : "")
                  }
                  data-testid="toggle-home-pov-mywot"
                >
                  {user.displayName || "My results"}
                </button>
              </div>
              {!hasMywot && (
                <button
                  type="button"
                  onClick={() => setLocation("/settings")}
                  className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800 hover:underline transition-colors"
                  data-testid="link-home-calculate-yours"
                >
                  Calculate yours <ArrowRight className="h-3 w-3" />
                </button>
              )}
              <span className="text-slate-300" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setLocation("/personalization")}
                className="text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                data-testid="link-home-learn-more"
              >
                What is this?
              </button>
            </div>
          )}
        </div>

        {isSearching && (
          <div className="w-full max-w-3xl mx-auto mt-6 sm:mt-8 text-left">
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
          <div className="w-full max-w-3xl mx-auto mt-6 sm:mt-8 text-left">
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
          <div className="w-full max-w-2xl mx-auto mt-8 sm:mt-12 text-center" data-testid="container-no-results">
            <div className="p-6 sm:p-8 rounded-xl sm:rounded-2xl bg-white/60 border border-slate-100">
              <Radar className="h-8 w-8 sm:h-10 sm:w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 mb-1">No profiles found</h3>
              <p className="text-xs text-slate-500">Try a different name or paste an npub directly.</p>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 text-xs" data-testid="footer-home">
        <button
          type="button"
          onClick={() => setLocation("/developers")}
          className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-developers"
        >
          Developers
        </button>
        <button
          type="button"
          onClick={() => setLocation("/how-search-works")}
          className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-how-search-works"
        >
          How search works
        </button>
      </footer>
    </div>
  );
}
