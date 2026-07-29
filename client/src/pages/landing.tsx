import { useLocation } from "wouter";
import { copyToClipboard } from "@/lib/clipboard";
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
  UserRound,
  Radar,
  Copy,
} from "lucide-react";
import { HomeHeroBackground } from "@/components/HomeHeroBackground";
import { BrainLogo } from "@/components/BrainLogo";
import { Wordmark } from "@/components/Wordmark";
import { SignInButton } from "@/components/SignInButton";
import { AccountMenu } from "@/components/AccountMenu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser, fetchProfile, logout, type NostrUser } from "@/services/nostr";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { queryClient } from "@/lib/queryClient";
import { apiClient } from "@/services/api";
import { useActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";
import { PostSignupCard } from "@/components/PostSignupCard";
import { BackupReminder } from "@/components/BackupReminder";
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
import { parseTopicQuery, topicPath } from "@/lib/topicQuery";
import { TopicSuggestionRow } from "@/components/search/TopicSuggestionRow";
import { resolveEntityToPath } from "@/lib/resolveNostrEntity";

// Anonymous visitors search from the NosFabrica ("house") POV. Logged-in users
// stay on this search-first home and search from their active trust perspective.
const ANON_POV = "nosfabrica" as const;

// Example prompts the empty search box gently cycles through to teach
// visitors what they can search for. The first entry is the static
// fallback (used as-is when the user prefers reduced motion).
const PLACEHOLDER_EXAMPLES = [
  "Search people and topics…",
  'Search "Jack"',
  'Search "Prague"',
  'Try a topic like "#bitcoin"',
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
    // A `#topic` query → show the topic row (→ /t/tag), not profile suggestions.
    if (parseTopicQuery(value).isTopic) {
      typedSinceSearchRef.current = true;
      setSuggestions([]);
      setIsSuggesting(false);
      setShowSuggestions(true);
      return;
    }
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
    // Context-aware destination: anonymous searchers go to the clean public /p
    // page (our njump replacement + join funnel), logged-in members get the
    // personalized /profile analysis. The Public-page / View-full-profile
    // cross-links cover anyone who wants the other view.
    if (!user) {
      setLocation(`/p/${result.npub}?fromSearch=1`);
      return;
    }
    const suffix = persistNosfabrica ? "&showNosfabricaResult=1" : "";
    setLocation(`/p/${result.npub}${suffix ? `?${suffix.replace(/^&/, "")}` : ""}`);
  }, [seedAndPrefetchProfile, setLocation, effectivePov, user]);

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

    // Pasted note/event or long-form article link → on-site landing page
    // (njump parity: "paste anything → it just works").
    const ent = resolveEntityToPath(q);
    if (ent && (ent.kind === "note" || ent.kind === "article")) {
      setLocation(`${ent.path}?fromSearch=1`);
      return;
    }

    // A #hashtag query → the trust-ranked CONTENT feed for that tag (not a
    // profile search). Everything else falls through to profile search.
    if (q.startsWith("#")) {
      const tag = q.slice(1).toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (tag) {
        setLocation(`/t/${encodeURIComponent(tag)}`);
        return;
      }
    }

    // Direct identifiers resolve to a profile — logged-out visitors get the public
    // /p page, members get the personalized /profile view (mirrors goToProfile).
    const profileDest = (np: string) => `/p/${np}`;

    if (isLikelyNpub(q)) {
      try {
        const decoded = nip19.decode(q);
        if (decoded.type === "npub" && typeof decoded.data === "string") {
          setLocation(profileDest(q));
          return;
        }
      } catch {}
    }

    if (isHexPubkey(q)) {
      const npub = nip19.npubEncode(q.toLowerCase());
      setLocation(profileDest(npub));
      return;
    }

    if (isNip05Handle(q)) {
      const searchId = ++searchAbortRef.current;
      setIsSearching(true);
      try {
        const hexPubkey = await resolveNip05(q);
        if (searchAbortRef.current !== searchId) return;
        const npub = nip19.npubEncode(hexPubkey);
        setLocation(profileDest(npub));
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
  }, [query, effectivePov, user?.pubkey, setLocation, toast]);

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
  // When the typed query is itself a nostr entity/link (npub/nevent/note/naddr/…),
  // the dropdown's action row resolves it straight to the right landing page.
  const entityMatch = useMemo(() => resolveEntityToPath(query.trim()), [query]);
  const topicMatch = useMemo(() => parseTopicQuery(query), [query]);
  const dropdownOpen = showSuggestions && (suggestions.length > 0 || isSuggesting || topicMatch.isTopic);
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
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col relative overflow-hidden" data-testid="page-home">
      <HomeHeroBackground dimmed={lifted} />

      {/* Homepage top bar (Google-search pattern): the center stays empty so the
          search box owns it. B symbol left · account actions right — transparent
          over the hero photo, both signed-in/out. The About / How-search-works /
          Developers / Q&A links live in the bottom footer, Google-style. */}
      <header className="relative z-20 flex items-center px-4 sm:px-8 py-5" data-testid="home-header">
        {/* Left: the compact B symbol (mono variant for contrast on the photo). */}
        <button
          type="button"
          onClick={() => setLocation("/")}
          aria-label="Brainstorm home"
          className="shrink-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
          data-testid="home-brand"
        >
          <img src="/brand/symbol-black.svg" alt="Brainstorm" draggable={false} className="h-7 w-auto select-none dark:hidden" />
          <img src="/brand/symbol-white.svg" alt="Brainstorm" draggable={false} className="hidden h-7 w-auto select-none dark:block" />
        </button>

        {/* Right: actions — apps + avatar when signed in, else Sign in. */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {user ? (
            <AccountMenu user={user} onLogout={handleLogout} active="home" />
          ) : (
            <SignInButton variant="primary" label="Sign in" className="!rounded-full sm:px-5" data-testid="button-home-sign-in" />
          )}
        </div>
      </header>

      <main className={`relative z-10 flex-1 flex flex-col items-center px-4 ${dropdownOpen || lifted ? "justify-start pt-6 sm:pt-10" : "justify-center -mt-10 sm:-mt-16"}`}>
        <div className="w-full max-w-2xl mx-auto text-center" style={prefersReducedMotion ? undefined : { animation: "homeFadeUp 0.5s ease-out" }}>
          <style>{`@keyframes homeFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          <div className="flex flex-col items-center mb-8">
            <h1 className="mb-2.5" data-testid="text-home-title">
              {/* Wordmark <img> carries the "Brainstorm" accessible name (its
                  alt), so no sr-only duplicate. */}
              {/* Website hero → wordmark. Stays the Aurora gradient (a reserved
                  brand moment); it sits over the near-white scrim core, so it
                  stays legible without recoloring as you type. Dark: white mark. */}
              <Wordmark height={52} variant="gradient" className="mx-auto dark:hidden" />
              <Wordmark height={52} variant="white" className="mx-auto hidden dark:block" />
            </h1>
            <p className="text-slate-700 dark:text-slate-100 text-base sm:text-lg font-medium" data-testid="text-home-subtitle">
              Search through the people you trust.
            </p>
          </div>

          <div ref={searchContainerRef} className="relative">
            <form onSubmit={onSubmit} className="relative group" data-testid="form-home-search">
              {/* (accent-discipline preview) focus "bloom" glow removed — the
                  crisp border + shadow below is the guideline focus treatment. */}
              <div className="relative flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full pl-5 pr-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.08)] focus-within:border-brand-primary/[0.4] focus-within:shadow-[0_4px_18px_rgb(var(--brand-primary)/0.12)] transition-all duration-300">
                <Search className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0" />
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
                  aria-label="Search people, topics, or handles"
                  className="w-full bg-transparent text-slate-900 dark:text-slate-100 text-base outline-none py-1.5 min-w-0"
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
                      className={`truncate text-slate-400 dark:text-slate-500 text-base transition-opacity duration-300 ${phVisible ? "opacity-100" : "opacity-0"}`}
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
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    data-testid="button-home-clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  aria-label="Search"
                  // Disabled only while a search is in flight — at rest (even
                  // with an empty box) the button stays solid Aurora Purple
                  // (#7237ff) instead of washing out to a faded lavender.
                  // handleSearch() no-ops on an empty query, so an idle click is
                  // harmless.
                  disabled={isSearching}
                  className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary-hover rounded-full transition-colors active:scale-[0.98] shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
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
                className="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden text-left"
                style={{ maxHeight: suggestMaxH !== null ? `${suggestMaxH}px` : "min(28rem, calc(100dvh - 9rem))" }}
                data-testid="container-home-suggestions"
              >
                {topicMatch.isTopic ? (
                  <TopicSuggestionRow
                    tag={topicMatch.tag}
                    active
                    onSelect={() => { setShowSuggestions(false); if (topicMatch.tag) setLocation(topicPath(topicMatch.tag)); }}
                    testId="home-topic"
                  />
                ) : isSuggesting && suggestions.length === 0 ? (
                  <div className="px-4 py-3 flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs" data-testid="home-suggestions-loading">
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
                          className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left transition-colors ${i === activeSuggestion ? "bg-brand-primary/10 dark:bg-brand-primary/15" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                          onMouseEnter={() => { kbdNavRef.current = false; setActiveSuggestion(i); handlePrefetchEnter(s); }}
                          onMouseLeave={() => handlePrefetchLeave(s)}
                          onClick={() => goToProfile(s)}
                          data-testid={`home-suggestion-${i}`}
                        >
                          <Avatar className="h-8 w-8 border border-slate-200/80 dark:border-slate-800/80 shrink-0">
                            {s.picture ? <AvatarImage src={s.picture} alt={getDisplayLabel(s)} className="object-cover" /> : null}
                            <AvatarFallback className="overflow-hidden">
                              <DefaultAvatarImg />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate" data-testid={`home-suggestion-name-${i}`}>
                              {getDisplayLabel(s)}
                            </p>
                            {handle && (
                              <p className="text-xs text-brand-primary dark:text-brand-link truncate flex items-center gap-0.5">
                                <Check className="h-2.5 w-2.5 shrink-0 text-brand-primary" />
                                {handle}
                              </p>
                            )}
                          </div>
                          {s.wotRank != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-primary/10 dark:bg-white/10 text-brand-primary dark:text-slate-100 border border-brand-primary/15 dark:border-white/15 shrink-0" data-testid={`home-suggestion-rank-${i}`}>
                              <BrainLogo mono size={10} className="shrink-0" />
                              {s.wotRank}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    </div>
                    <button
                      type="button"
                      className={`w-full shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 text-left border-t border-slate-100 dark:border-slate-800/60 text-[12px] font-medium transition-colors ${activeSuggestion === -1 ? "bg-slate-50 dark:bg-slate-800 text-brand-primary" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-brand-primary"}`}
                      onMouseEnter={() => { kbdNavRef.current = false; setActiveSuggestion(-1); }}
                      onMouseDown={(e) => { e.preventDefault(); setShowSuggestions(false); handleSearch(query); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowSuggestions(false); handleSearch(query); } }}
                      data-testid="home-suggestion-see-all"
                    >
                      {entityMatch ? (
                        <><ArrowRight className="h-3.5 w-3.5 shrink-0" />Open this {entityMatch.kind} →</>
                      ) : (
                        <><Search className="h-3.5 w-3.5 shrink-0" />See all results for "{query.trim()}"</>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {!user ? (
            <div className="mt-6 flex flex-col items-center gap-2.5 rounded-2xl backdrop-blur-[2px]" data-testid="text-home-hint">
              {/* (accent-discipline preview) quiet neutral segmented control —
                  no gradient chrome, no embedded wordmark (guidelines p16/p17). */}
              <div role="group" aria-label="Trust perspective" className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-0.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 px-3.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-sm" data-testid="text-home-pov-label">
                  <Globe className="h-3 w-3 text-brand-primary" /> Brainstorm
                </span>
                <button
                  type="button"
                  onClick={() => setLocation("/login")}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                  data-testid="toggle-home-pov-signin"
                >
                  <UserRound className="h-3 w-3" /> My perspective
                </button>
              </div>
              <button
                type="button"
                onClick={() => setLocation("/personalization")}
                className="text-xs text-brand-link hover:underline transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                data-testid="link-home-learn-more"
              >
                What is this?
              </button>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs rounded-2xl backdrop-blur-[2px]" data-testid="text-home-hint">
              {/* Quiet neutral segmented control — active segment is a plain white
                  chip, no gradient / no wordmark image (guidelines p16/p17). */}
              <div role="group" aria-label="Trust perspective" className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-0.5" data-testid="toggle-home-pov">
                <button
                  type="button"
                  onClick={() => setPov("nosfabrica")}
                  aria-pressed={effectivePov === "nosfabrica"}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 " +
                    (effectivePov === "nosfabrica"
                      ? "bg-white dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-100 shadow-sm"
                      : "font-medium text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white")
                  }
                  data-testid="toggle-home-pov-nosfabrica"
                >
                  <Globe className={`h-3 w-3 ${effectivePov === "nosfabrica" ? "text-brand-primary" : ""}`} /> Brainstorm
                </button>
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
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 " +
                    (effectivePov === "mywot"
                      ? "bg-white dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-100 shadow-sm"
                      : "font-medium text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white") +
                    (!canUseMywot ? " opacity-50 cursor-not-allowed" : "")
                  }
                  data-testid="toggle-home-pov-mywot"
                >
                  <Avatar className="h-4 w-4 shrink-0">
                    {user.picture ? <AvatarImage src={user.picture} alt="" className="object-cover" /> : null}
                    <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                  </Avatar>{" "}
                  My perspective
                </button>
              </div>
              {!hasMywot && (
                <button
                  type="button"
                  onClick={() => setLocation("/settings")}
                  className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                  data-testid="link-home-calculate-yours"
                >
                  Calculate yours <ArrowRight className="h-3 w-3" />
                </button>
              )}
              <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setLocation("/personalization")}
                className="text-brand-link hover:underline transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                data-testid="link-home-learn-more"
              >
                What is this?
              </button>
            </div>
          )}
        </div>

        <PostSignupCard />
        {/* WelcomeBackCard ("someone just joined & followed you") stays unmounted.
            New users still auto-follow the profile they join from (see SharePage) —
            that connection is benign. But this owner-facing notification was the scam
            lever: it pressured the owner to follow BACK a stranger, forming a trust
            edge that carries the owner's weight. It fired for ANY brand-new inbound
            follower, so it can't be re-enabled safely until a backend invite-record
            gates it to genuine, owner-issued invites. */}
        <BackupReminder />

        {isSearching && (
          <div className="w-full max-w-2xl mx-auto mt-6 sm:mt-8 text-left">
            <div className="space-y-2 sm:space-y-3" data-testid="container-search-loading">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/60 animate-pulse" style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 sm:h-3.5 bg-slate-200 dark:bg-slate-700 rounded-full w-28 sm:w-36" />
                    <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full w-full max-w-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isSearching && hasSearched && results.length > 0 && (
          <div className="w-full max-w-2xl mx-auto mt-6 sm:mt-8 text-left">
            <div className="mb-2 sm:mb-3 px-1">
              <p className="text-xs text-slate-400 dark:text-slate-500" data-testid="text-search-stats">
                About {results.length} result{results.length !== 1 ? "s" : ""} ({(searchTime / 1000).toFixed(2)} seconds)
              </p>
            </div>
            <div className="space-y-2 sm:space-y-3" data-testid="container-search-results">
              {results.map((result, idx) => {
                const formatFollowers = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
                const websiteDisplay = result.website ? result.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
                return (
                  <div
                    key={result.pubkey}
                    role="button"
                    tabIndex={0}
                    className="w-full bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm active:bg-slate-50 dark:active:bg-slate-800 rounded-xl transition-all duration-150 text-left group cursor-pointer overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                    onMouseEnter={() => handlePrefetchEnter(result)}
                    onMouseLeave={() => handlePrefetchLeave(result)}
                    onFocus={() => handlePrefetchEnter(result)}
                    onBlur={() => handlePrefetchLeave(result)}
                    onClick={() => goToProfile(result)}
                    // Only the card itself (not a bubbled keypress from the inner
                    // website link / copy button) navigates on Enter/Space.
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); goToProfile(result); } }}
                    data-testid={`result-profile-${idx}`}
                  >
                    <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4">
                      <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border-2 shrink-0 border-slate-200/80 dark:border-slate-800/80">
                        {result.picture ? <AvatarImage src={result.picture} alt={getDisplayLabel(result)} className="object-cover" /> : null}
                        <AvatarFallback className="overflow-hidden">
                          <DefaultAvatarImg />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-primary transition-colors truncate" data-testid={`text-result-name-${idx}`}>
                            {getDisplayLabel(result)}
                          </span>
                        </div>
                        {result.nip05 && (
                          <p className="text-xs text-brand-primary dark:text-brand-link truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-nip05-${idx}`}>
                            <Check className="h-2.5 w-2.5 shrink-0 text-brand-primary" />
                            {result.nip05.replace(/^_@/, "")}
                          </p>
                        )}
                        {result.lud16 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-lightning-${idx}`}>
                            <Zap className="h-2.5 w-2.5 shrink-0 text-slate-400 dark:text-slate-500" />
                            {result.lud16}
                          </p>
                        )}
                        {websiteDisplay && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-website-${idx}`}>
                            <Globe className="h-2.5 w-2.5 shrink-0 text-slate-400 dark:text-slate-500" />
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
                          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2" data-testid={`text-result-about-${idx}`}>
                            {truncateAbout(result.about)}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-2 flex-wrap">
                          {result.wotRank != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-primary/10 dark:bg-white/10 text-brand-primary dark:text-slate-100 border border-brand-primary/15 dark:border-white/15" data-testid={`badge-rank-${idx}`}>
                              <BrainLogo mono size={10} className="shrink-0" />
                              {result.wotRank}
                            </span>
                          )}
                          {result.wotFollowers != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800/60" data-testid={`badge-followers-${idx}`}>
                              <Users className="h-2.5 w-2.5" />
                              {formatFollowers(result.wotFollowers)}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-300 dark:text-slate-600 font-mono hidden sm:inline" data-testid={`text-result-npub-${idx}`}>
                            {result.npub.slice(0, 12)}...
                            <button
                              type="button"
                              aria-label="Copy npub"
                              className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                              data-testid={`button-copy-npub-${idx}`}
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(result.npub); }}
                            >
                              <Copy className="h-2.5 w-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
                            </button>
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-300 dark:text-slate-600 group-hover:text-brand-primary transition-colors shrink-0 mt-1 hidden sm:inline font-medium">
                        View →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showNoResults && (
          <div className="w-full max-w-2xl mx-auto mt-8 sm:mt-12" data-testid="container-no-results">
            <div className="p-2 rounded-xl sm:rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60">
              <EmptyState
                icon={Radar}
                compact
                title="No profiles found"
                description="Try a different name, or paste an npub directly."
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer (Google-search pattern): secondary/info links sit quietly at the
          bottom, muted and small, so they never compete with the search box. */}
      <footer className="relative z-10 flex flex-wrap items-center justify-start gap-x-6 gap-y-2 px-4 sm:px-8 py-4 text-xs" data-testid="footer-home">
        {[
          { label: "About", path: "/about" },
          { label: "How search works", path: "/how-search-works" },
          { label: "Developers", path: "/developers" },
          { label: "Q&A", path: "/faq" },
        ].map((l) => (
          <button
            key={l.path}
            type="button"
            onClick={() => setLocation(l.path)}
            className="font-medium text-slate-500 dark:text-slate-400 transition-colors hover:text-brand-deep dark:hover:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid={`footer-home-${l.path.slice(1)}`}
          >
            {l.label}
          </button>
        ))}
      </footer>
    </div>
  );
}
