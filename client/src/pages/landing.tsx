import { Link, useLocation } from "wouter";
import { copyToClipboard } from "@/lib/clipboard";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { getRecentItems, pushRecentQuery, pushRecentProfile, removeRecentItem, clearRecentSearches, recentKey, type RecentItem } from "@/lib/recentSearches";
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type FormEvent } from "react";
import { nip19 } from "nostr-tools";
import {
  Search,
  ArrowRight,
  Loader2,
  Check,
  X,
  SlidersHorizontal,
  Globe,
  UserRound,
  Clock,
  Radio,
  Newspaper,
  Image as ImageIcon,
  MessageSquare,
} from "lucide-react";
import { GlossBackground } from "@/components/GlossBackground";
import { Wordmark } from "@/components/Wordmark";
import { SignInButton } from "@/components/SignInButton";
import { AccountMenu } from "@/components/AccountMenu";
import { FinishSetupBanner } from "@/components/FinishSetupBanner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin, useTierRing, TierWordChip , useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { fetchProfile } from "@/services/nostr";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { queryClient } from "@/lib/queryClient";
import { apiClient } from "@/services/api";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";
import { AccountCards } from "@/components/AccountCards";
import { setProfileSeed, setStoredSearchSeed, type ProfileSeed } from "@/lib/profileSeed";
import {
  getDisplayLabel,
  isLikelyNpub,
  isHexPubkey,
  isNip05Handle,
  type SearchResult,
} from "@/lib/profileSearch";
import { suggestProfiles } from "@/services/search";
import { SearchResults } from "@/components/search/SearchResults";
import { personAssist, type PersonAssist } from "@/lib/searchSyntax";
import { parseTopicQuery, topicPath } from "@/lib/topicQuery";
import { TopicSuggestionRow } from "@/components/search/TopicSuggestionRow";
import { TagSuggestionRow, tagSuggestionPath } from "@/components/search/TagSuggestionRow";
import { useTagMatches } from "@/hooks/useTags";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { npubFromPubkey } from "@/lib/shareId";
import { resolveEntityToPath } from "@/lib/resolveNostrEntity";

// Anonymous visitors search from the NosFabrica ("house") POV. Logged-in users
// stay on this search-first home and search from their active trust perspective.
const ANON_POV = "nosfabrica" as const;

// Example prompts the empty search box gently cycles through to teach
// first-time visitors what they can search for. The first entry is the
// static fallback — used as-is when the user prefers reduced motion, and
// for returning visitors who've already seen the rotating hints (see
// SEEN_SEARCH_HINTS_KEY). Kept deliberately generic (mainstream names +
// topics, no insider references) so it reads for a broad audience.
const PLACEHOLDER_EXAMPLES = [
  "Search people and topics…",
  'Search "Maria"',
  'Search "Prague"',
  'Try a topic like "#soccer"',
  'Search a handle like "alex@primal.net"',
  "Search a public key…",
];

// localStorage flag: set on a visitor's first landing view. Its presence
// marks a "returning" visitor, who gets the calm static placeholder instead
// of the rotating hints. First-party + functional → no consent banner needed.
const SEEN_SEARCH_HINTS_KEY = "brainstorm_seen_search_hints";

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
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; }
  });
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [phIndex, setPhIndex] = useState(0);
  const [phVisible, setPhVisible] = useState(true);
  const prefersReducedMotion = usePrefersReducedMotion();
  // First-time visitors get the rotating hints (a gentle "here's what you can
  // search" onboarding); returning visitors get the calm static placeholder.
  // Read once at mount so the current visit reflects prior visits, then persist
  // below so the NEXT visit is treated as returning.
  const [isFirstVisit] = useState(() => {
    try { return !localStorage.getItem(SEEN_SEARCH_HINTS_KEY); } catch { return true; }
  });
  // Per-browser recent searches, shown under an empty, focused box (returning
  // visitors only — a first-timer has none). `focused` gates that panel.
  const [recent, setRecent] = useState<RecentItem[]>(() => getRecentItems());
  const [focused, setFocused] = useState(false);
  const [suggestMaxH, setSuggestMaxH] = useState<number | null>(null);

  // The SUBMITTED query — what SearchResults streams for. Distinct from
  // `query` (the live box text): results only change on submit/URL, never
  // per keystroke. SearchResults owns the stream, skeleton and count line.
  // null = pristine home; "" = BROWSE mode (a vertical, no keyword — the
  // "just show me all the live events" ask); non-empty = a real query.
  const [submitted, setSubmitted] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q")?.trim();
      if (q) return q;
      // ?t= without ?q= is a deep link into browsing that vertical.
      return params.get("t") ? "" : null;
    } catch { return null; }
  });
  const hasSearched = submitted !== null;
  // Brief in-box spinner while a NIP-05 handle resolves to a profile.
  const [isSearching, setIsSearching] = useState(false);

  const suggestAbortRef = useRef(0);
  const searchAbortRef = useRef(0);
  const suggestTimerRef = useRef<number | undefined>(undefined);
  const phFadeTimerRef = useRef<number | undefined>(undefined);
  const typedSinceSearchRef = useRef(false);
  // True only when the highlighted suggestion was reached via keyboard arrows.
  // Mouse hover sets the highlight for visuals/prefetch but leaves this false so
  // pressing Enter still runs a full search instead of opening a hovered profile.
  const kbdNavRef = useRef(false);
  // Non-null while the dropdown is completing a from:/to: name fragment —
  // picking a person then WRITES THE KEY instead of navigating.
  const personAssistRef = useRef<PersonAssist | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didInitFromUrlRef = useRef(false);
  const prefetchTimersRef = useRef<Map<string, number>>(new Map());

  // Live identity: the header avatar appears as soon as the profile metadata
  // lands after login, without a refresh.
  const user = useActiveAccountDisplay();
  const [pov, setPov] = useActivePerspective();
  const { hasMywot } = useHasMywot();
  // Permission to search from one's own perspective, per GET /user/isSearchObserver.
  const { isSearchObserver } = useIsSearchObserver();
  const canUseMywot = hasMywot && isSearchObserver;
  // Relay hits carry no rank numbers (order-only wire) — the dropdown's rings
  // and coins feed from the shared author-score cache, like every card.
  const suggestScoreOf = useAuthorScores(useMemo(() => suggestions.map((x) => x.pubkey), [suggestions]));

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

  // Mark this browser as having seen the search hints, so the next visit is
  // treated as returning (calm static placeholder). Set once, on first mount.
  useEffect(() => {
    if (!isFirstVisit) return;
    try { localStorage.setItem(SEEN_SEARCH_HINTS_KEY, "1"); } catch {}
  }, [isFirstVisit]);

  // Gently cycle the empty box's placeholder through example prompts. Runs only
  // for a first-time visitor, while the field is empty and motion is allowed; a
  // soft fade-out/in (300ms) bridges each swap. Pauses the moment the user types
  // (query non-empty). Returning visitors keep the static first entry.
  useEffect(() => {
    if (!isFirstVisit || prefersReducedMotion || query.length > 0) {
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
  }, [isFirstVisit, prefersReducedMotion, query]);

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
    // Mid-typing `from:ja` / `to:ma` → offer people for the FRAGMENT; picking
    // one writes the key into the query (nobody types an npub by hand).
    const assist = personAssist(value);
    personAssistRef.current = assist && assist.fragment.length >= 2 ? assist : null;
    if (personAssistRef.current) {
      typedSinceSearchRef.current = true;
      setIsSuggesting(true);
      setShowSuggestions(true);
      suggestTimerRef.current = window.setTimeout(async () => {
        try {
          const people = await suggestProfiles(personAssistRef.current!.fragment, {
            pov: effectivePov,
            userPubkey: user?.pubkey,
          });
          if (suggestAbortRef.current !== reqId) return;
          setSuggestions(people.slice(0, 7));
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
      return;
    }
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
        const suggestResults = await suggestProfiles(q, { pov: effectivePov, userPubkey: user?.pubkey });
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
    // Remember the people opened from search in the "Recent" list (avatar + name),
    // so they're one tap to get back to — not just the words typed into the box.
    setRecent(pushRecentProfile({
      pubkey: result.pubkey,
      npub: result.npub,
      label: getDisplayLabel(result),
      picture: result.picture,
      nip05: result.nip05,
    }));
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

  // What picking a dropdown person means depends on mode: completing a
  // from:/to: fragment writes the key and keeps the user typing; otherwise
  // it opens the profile as always.
  const pickSuggestion = useCallback((result: SearchResult) => {
    const assist = personAssistRef.current;
    if (assist) {
      personAssistRef.current = null;
      setQuery(assist.complete(result.npub));
      setSuggestions([]);
      setActiveSuggestion(-1);
      setShowSuggestions(false);
      inputRef.current?.focus();
      return;
    }
    goToProfile(result);
  }, [goToProfile]);

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
    personAssistRef.current = null;
    setShowSuggestions(false);
    setIsSuggesting(false);
  }, []);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    // Remember this query for the "Recent" list (de-duped, most-recent-first).
    setRecent(pushRecentQuery(q));
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
        // Unresolvable handle falls through to a plain text search below.
      } finally {
        if (searchAbortRef.current === searchId) setIsSearching(false);
      }
    }

    // Everything else is a real search: put it in the URL and hand it to
    // SearchResults — the stream, skeleton, errors and count line live there.
    try {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get("q") !== q) {
        currentUrl.searchParams.set("q", q);
        window.history.pushState({}, "", currentUrl.pathname + currentUrl.search);
      }
    } catch {}
    setSubmitted(q);
  }, [query, setLocation]);

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
        setSubmitted(new URLSearchParams(window.location.search).get("t") ? "" : null);
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

  // A POV flip re-ranks the open results automatically — SearchResults
  // restarts its stream when its `pov` prop changes. Only the mid-type
  // suggestion dropdown needs a nudge here.
  const prevPovRef = useRef(effectivePov);
  useEffect(() => {
    if (prevPovRef.current === effectivePov) return;
    prevPovRef.current = effectivePov;
    const q = query.trim();
    if (typedSinceSearchRef.current && q.length >= 2) {
      scheduleSuggest(query);
    }
  }, [effectivePov, query, scheduleSuggest]);

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
    setSubmitted(null);
    setIsSearching(false);
    inputRef.current?.focus();
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("q") || url.searchParams.has("t")) {
        url.searchParams.delete("q");
        url.searchParams.delete("t");
        window.history.pushState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    } catch {}
  }, [cancelSuggest]);

  // Browse a whole vertical with no keyword — Benjamin's "just show me all
  // the live events". Deep-linkable: ?t=<tab> with no ?q=.
  const browseVertical = useCallback((tabKey: string) => {
    cancelSuggest();
    setQuery("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.set("t", tabKey);
      window.history.pushState({}, "", url.pathname + url.search);
    } catch {}
    setSubmitted("");
  }, [cancelSuggest]);

  // The suggestions dropdown is open whenever we have something to show.
  // We lift the search box toward the top when it opens (or once a search is
  // under way) so the list/results have room.
  // When the typed query is itself a nostr entity/link (npub/nevent/note/naddr/…),
  // the dropdown's action row resolves it straight to the right landing page.
  const entityMatch = useMemo(() => resolveEntityToPath(query.trim()), [query]);
  const topicMatch = useMemo(() => parseTopicQuery(query), [query]);
  // Tags the query matches. Skipped entirely for `#topic` queries — those are
  // already routed at the hashtag feed and shouldn't offer a second answer.
  const tagMatches = useTagMatches(topicMatch.isTopic ? "" : query);
  const dropdownOpen =
    showSuggestions && (suggestions.length > 0 || isSuggesting || topicMatch.isTopic || tagMatches.length > 0);
  // "Recent" shows under an empty, focused box before any search this session —
  // never alongside the suggestions dropdown or a results list.
  const showRecent = focused && query.trim() === "" && !hasSearched && !dropdownOpen && recent.length > 0;
  const lifted = hasSearched || isSearching || query.trim().length > 0;

  // Measure the room left below the search box and cap whichever panel is open.
  // Both panels are `absolute top-full`, so without a cap they run straight off
  // the bottom of the page — and the page root is `overflow-hidden`, so the
  // overrun is CLIPPED rather than scrollable (unreachable, not just ugly). This
  // used to fire for the suggestions dropdown only, which left "Recent" — the
  // panel a returning visitor sees first, before typing a single character —
  // uncapped: in landscape it ran ~40px past the viewport with its last rows
  // buried under the footer links.
  useLayoutEffect(() => {
    if (!dropdownOpen && !showRecent) return;
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
  }, [dropdownOpen, showRecent]);


  // 100dvh, not 100vh: on iOS the toolbar eats a big share of a LANDSCAPE
  // viewport, and 100vh measures the large (toolbar-hidden) viewport — so the
  // bottom of the page sits under the chrome exactly when room is scarcest.
  return (
    <div className="min-h-[100dvh] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col relative overflow-hidden" data-testid="page-home">
      <GlossBackground />
      {/* Aurora glow behind the hero — soft at rest, blooms when the search goes
          active, so the wordmark + search feel alive without any idle noise. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-[44%] z-0 h-[380px] w-[680px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[100px] transition-all duration-700 ease-out ${lifted ? "opacity-100 scale-105" : "opacity-60"}`}
        style={{ background: "radial-gradient(ellipse at center, rgba(114,55,255,0.16) 0%, rgba(19,210,229,0.10) 45%, transparent 72%)" }}
      />

      {/* Homepage top bar (Google-search pattern): the center stays empty so the
          search box owns it. B symbol left · account actions right — transparent
          over the hero photo, both signed-in/out. The About / How-search-works /
          Developers / Q&A links live in the bottom footer, Google-style. */}
      {/* No height floor needed for the hide/show below: the right-hand control
          (36px) is taller than the B (28px), so the header measures 76px either
          way and the hero never shifts. */}
      <header className="relative z-20 flex items-center px-4 sm:px-8 py-5 short:py-2.5" data-testid="home-header">
        {/* No top-left mark, even on results (Benjamin's call during search-
            expansion review): the wordmark hero stays on screen in both
            states, so a corner B duplicated it. The box's X (clearSearch) is
            the way back to a clean page. */}

        {/* Center: the finish-setup nudge — this is the page a fresh sign-in
            lands on, so the one persistent reminder has to live here too.
            Absolutely centered because the left mark only exists after a
            search; self-hides once setup is done. */}
        <div className="absolute left-1/2 top-1/2 z-10 flex max-w-[55vw] -translate-x-1/2 -translate-y-1/2 justify-center">
          <FinishSetupBanner />
        </div>

        {/* Right: actions — apps + avatar when signed in, else Sign in. */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {user ? (
            <AccountMenu user={user} onLogout={handleLogout} active="home" />
          ) : (
            <SignInButton variant="primary" label="Sign in" className="!rounded-full sm:px-5" data-testid="button-home-sign-in" />
          )}
        </div>
      </header>

      {/* `short:` = a phone in landscape. It lands on the desktop side of every
          width breakpoint, so the optical-centering offset and the generous
          desktop padding both have to be neutralised by height, not width. `!`
          because these override `sm:` utilities of equal specificity. */}
      <main className={`relative z-10 flex-1 flex flex-col items-center px-4 ${dropdownOpen || lifted ? "justify-start pt-6 sm:pt-10 short:!pt-2" : "justify-center -mt-10 sm:-mt-16 short:justify-start short:!mt-0 short:pt-2"}`}>
        <div className="w-full max-w-2xl mx-auto text-center motion-safe:animate-[homeFadeUp_0.5s_ease-out]">
          <style>{`@keyframes homeFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          <div className="flex flex-col items-center mb-8 short:mb-3.5">
            <h1 className="mb-2.5 short:mb-1.5" data-testid="text-home-title">
              {/* Wordmark <img> carries the "Brainstorm" accessible name (its
                  alt), so no sr-only duplicate. */}
              {/* Website hero → wordmark. Stays the Aurora gradient (a reserved
                  brand moment); it sits over the near-white scrim core, so it
                  stays legible without recoloring as you type. Dark: white mark. */}
              {/* `short:!h-9` needs the bang twice over: to beat `sm:`-level
                  utilities AND because Wordmark sets its height as an inline
                  style, which only `!important` can override. */}
              <Wordmark height={52} variant="gradient" className="mx-auto dark:hidden short:!h-9" />
              <Wordmark height={52} variant="white" className="mx-auto hidden dark:block short:!h-9" />
            </h1>
            <p className="text-slate-700 dark:text-slate-100 text-base sm:text-lg short:!text-sm font-medium" data-testid="text-home-subtitle">
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
                    setFocused(true);
                    if (typedSinceSearchRef.current && suggestions.length > 0 && query.trim().length >= 2) setShowSuggestions(true);
                  }}
                  onBlur={() => setFocused(false)}
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
                      if (showSuggestions && kbdNavRef.current && activeSuggestion >= 0 && suggestions[activeSuggestion] && personAssistRef.current) {
                        e.preventDefault();
                        pickSuggestion(suggestions[activeSuggestion]);
                        return;
                      }
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
                      {isFirstVisit && !prefersReducedMotion ? PLACEHOLDER_EXAMPLES[phIndex] : PLACEHOLDER_EXAMPLES[0]}
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
                ) : isSuggesting && suggestions.length === 0 && tagMatches.length === 0 ? (
                  <div className="px-4 py-3 flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs" data-testid="home-suggestions-loading">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </div>
                ) : (
                  <>
                    {/* Tags first: far fewer of them than people, and they're a
                        different kind of answer — "who is known for this"
                        rather than "who is called this". */}
                    {tagMatches.length > 0 && (
                      <div className="shrink-0 border-b border-slate-100 dark:border-slate-800/60" data-testid="home-tag-matches">
                        {tagMatches.map((t) => (
                          <TagSuggestionRow
                            key={t.key}
                            tag={t}
                            onSelect={() => {
                              const path = tagSuggestionPath(t, npubFromPubkey);
                              if (!path) return;
                              setShowSuggestions(false);
                              setLocation(path);
                            }}
                            testId="home-tag-suggestion"
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto overscroll-contain min-h-0" data-testid="list-home-suggestions">
                    {suggestions.map((s, i) => {
                      const handle = s.nip05 ? s.nip05.replace(/^_@/, "") : null;
                      const rank = s.wotRank ?? suggestScoreOf(s.pubkey) ?? null;
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
                          onClick={() => pickSuggestion(s)}
                          data-testid={`home-suggestion-${i}`}
                        >
                          <Avatar className={`h-8 w-8 border border-slate-200/80 dark:border-slate-800/80 shrink-0 ${tierRing(rank) ?? ""}`}>
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
                          {/* Same coin as the results list below and every people
                              list — it follows the viewer's display mode where
                              this pill couldn't, and fixes the pill's scale bug:
                              it printed `wotRank` raw (0..1), so 81 read "0.81". */}
                          {rank != null && (
                            <VerificationCoin
                              score01={rank}
                              pov={effectivePov === "mywot" ? "personalized" : "global"}
                              size={22}
                              className={tierRing(rank) && coinReplaced ? "sr-only" : "shrink-0"}
                            />
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

            {showRecent && (
              <div
                role="listbox"
                aria-label="Recent searches"
                className="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden text-left"
                style={{ maxHeight: suggestMaxH !== null ? `${suggestMaxH}px` : "min(28rem, calc(100dvh - 9rem))" }}
                data-testid="container-home-recent"
              >
                <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Recent</span>
                  <button
                    type="button"
                    // onMouseDown + preventDefault keeps the input focused so the
                    // click lands before the box blurs and closes this panel.
                    onMouseDown={(e) => { e.preventDefault(); setRecent(clearRecentSearches()); }}
                    className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-brand-primary transition-colors focus:outline-none focus-visible:text-brand-primary"
                    data-testid="button-home-recent-clear"
                  >
                    Clear
                  </button>
                </div>
                {/* Rows scroll inside the capped panel — the "Recent" header and
                    Clear stay pinned, matching the suggestions dropdown. */}
                <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 pb-1.5">
                  {recent.map((item, i) => {
                    // Two row shapes share the hover container + remove button:
                    // a person you opened (avatar → re-open) or a text query
                    // (clock → re-run). onMouseDown + preventDefault keeps the
                    // input focused so the action lands before the panel closes.
                    const handle = item.type === "profile" && item.nip05 ? item.nip05.replace(/^_@/, "") : null;
                    const removeLabel = item.type === "profile"
                      ? `Remove ${item.label} from recent`
                      : `Remove "${item.q}" from recent searches`;
                    return (
                      <div
                        key={recentKey(item)}
                        role="option"
                        aria-selected={false}
                        className="group/recent w-full flex items-center gap-3 px-3 sm:px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        data-testid={`home-recent-${i}`}
                      >
                        {item.type === "profile" ? (
                          <button
                            type="button"
                            className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none"
                            onMouseDown={(e) => { e.preventDefault(); goToProfile({ pubkey: item.pubkey, npub: item.npub, name: item.label, picture: item.picture, nip05: item.nip05 } as SearchResult); }}
                            data-testid={`home-recent-open-${i}`}
                          >
                            <Avatar className="h-7 w-7 border border-slate-200/80 dark:border-slate-800/80 shrink-0">
                              {item.picture ? <AvatarImage src={item.picture} alt={item.label} className="object-cover" /> : null}
                              <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">{item.label}</p>
                              {handle && (
                                <p className="text-xs text-brand-primary dark:text-brand-link truncate flex items-center gap-0.5 leading-tight">
                                  <Check className="h-2.5 w-2.5 shrink-0 text-brand-primary" />{handle}
                                </p>
                              )}
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none"
                            onMouseDown={(e) => { e.preventDefault(); setQuery(item.q); handleSearch(item.q); }}
                            data-testid={`home-recent-run-${i}`}
                          >
                            <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{item.q}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={removeLabel}
                          onMouseDown={(e) => { e.preventDefault(); setRecent(removeRecentItem(item)); }}
                          className="opacity-0 group-hover/recent:opacity-100 focus:opacity-100 inline-flex items-center justify-center h-6 w-6 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                          data-testid={`home-recent-remove-${i}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* No browse link here on purpose. Tags reach this page through the
              search box itself — type two characters and matching tags appear
              in the dropdown above the people. A second, static CTA under the
              field competed with the one thing this screen asks you to do.
              The catalogue's home entry point is /tags/mine instead. */}

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

          {/* Browse without a keyword — the "just show me all the live
              events" entry. Only on the pristine home; once anything is
              searched the tabs own navigation. */}
          {!hasSearched && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2" data-testid="browse-chips">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Browse</span>
              {[
                { tab: "live", label: "Live now", icon: Radio },
                { tab: "articles", label: "Fresh articles", icon: Newspaper },
                { tab: "media", label: "New media", icon: ImageIcon },
                { tab: "notes", label: "Latest notes", icon: MessageSquare },
              ].map((c) => (
                <button
                  key={c.tab}
                  type="button"
                  onClick={() => browseVertical(c.tab)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 hover:text-brand-deep dark:hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                  data-testid={`browse-${c.tab}`}
                >
                  <c.icon className="h-3.5 w-3.5" /> {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* One account-level card at a time: unlock → backup. Setup nudging
            (follow list, activation) lives ONLY in the header's
            FinishSetupBanner — nothing setup-shaped renders under the search. */}
        <AccountCards />
        {/* WelcomeBackCard ("someone just joined & followed you") stays unmounted.
            New users still auto-follow the profile they join from (see SharePage) —
            that connection is benign. But this owner-facing notification was the scam
            lever: it pressured the owner to follow BACK a stranger, forming a trust
            edge that carries the owner's weight. It fired for ANY brand-new inbound
            follower, so it can't be re-enabled safely until a backend invite-record
            gates it to genuine, owner-issued invites. */}

        {hasSearched && (
          <SearchResults
            query={submitted}
            pov={effectivePov}
            userPubkey={user?.pubkey}
            onOpenProfile={goToProfile}
            onPrefetchEnter={handlePrefetchEnter}
            onPrefetchLeave={handlePrefetchLeave}
            onQueryRewrite={(next) => {
              // Filters write their tokens into the visible box — the user
              // watches the grammar appear — and resubmit in one motion.
              setQuery(next);
              void handleSearch(next);
            }}
          />
        )}
      </main>

      {/* Footer (Google-search pattern): secondary/info links sit quietly at the
          bottom, muted and small, so they never compete with the search box.
          Hidden on mobile — on a phone the viewport belongs to the search box,
          and these wrap into a block that crowds it. The mobile tab bar already
          carries the primary navigation. */}
      {/* Already hidden on narrow phones for lack of room; a landscape phone has
          even less of it, and these links were what the Recent panel collided
          with. Same rationale, height axis — they stay one rotation away. */}
      <footer className="relative z-10 hidden sm:flex short:!hidden flex-wrap items-center justify-start gap-x-6 gap-y-2 px-4 sm:px-8 py-4 text-xs" data-testid="footer-home">
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
