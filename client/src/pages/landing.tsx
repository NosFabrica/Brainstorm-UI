import { HomeFooter } from "@/components/HomeFooter";
import { useLocation, useSearch } from "wouter";
import { hasHopped, markHopped, trackHistoryEntry } from "@/lib/historyState";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { pushRecentQuery, pushRecentScoped } from "@/lib/recentSearches";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { nip19 } from "nostr-tools";
import { resolveNip05 } from "@/lib/nip05";
import { ArrowRight, Loader2 } from "lucide-react";
import { GlossBackground } from "@/components/GlossBackground";
import { Wordmark } from "@/components/Wordmark";
import { SignInButton } from "@/components/SignInButton";
import { AccountMenu } from "@/components/AccountMenu";
import { FinishSetupBanner } from "@/components/FinishSetupBanner";
import { logout } from "@/accounts/login-flow";
import { AccountCards } from "@/components/AccountCards";
import {
  getDisplayLabel,
  isLikelyNpub,
  isHexPubkey,
  isNip05Handle,
} from "@/lib/profileSearch";
import { type SearchHit } from "@/services/search";
import { BackToTop } from "@/components/search/BackToTop";
import { SearchResults } from "@/components/search/SearchResults";
import { PerspectiveToggle } from "@/components/search/PerspectiveToggle";
import { queryWords, scopeOf, splitFilters } from "@/lib/searchSyntax";
import { SearchBox, type SearchBoxHandle } from "@/components/search/SearchBox";
import { SEARCH_PLACEHOLDER_CLASS } from "@/components/search/searchBoxChrome";
import { useSearchPov } from "@/hooks/useSearchPov";
import { useOpenProfile } from "@/hooks/useOpenProfile";
import { useProfileMap } from "@/hooks/useProfileMap";
import { parseTopicQuery, topicPath } from "@/lib/topicQuery";
import { npubFromPubkey } from "@/lib/shareId";
import { resolveEntityToPath } from "@/lib/resolveNostrEntity";


// Example prompts the empty search box gently cycles through to teach
// first-time visitors what they can search for. The first entry is the
// static fallback — used as-is when the user prefers reduced motion, and
// for returning visitors who've already seen the rotating hints (see
// SEEN_SEARCH_HINTS_KEY). Kept deliberately generic (mainstream names +
// topics, no insider references) so it reads for a broad audience.
const NO_PUBKEYS: string[] = [];
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



/** How far (px) a finger or the page may move before a touch on → stops being a tap. */
const TAP_SLOP = 10;

export default function Landing() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; }
  });
  // The active FILTERS, as their tokens ("sort:recent trust:verified") — kept
  // out of the box (Benjamin: tokens in the box look bad) and carried in the
  // URL's `f` so a filtered search still deep-links and survives back/forward.
  const [filters, setFilters] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("f") || ""; } catch { return ""; }
  });
  /** The typeahead's last answer, as hits, for the People section to start from. */
  const suggestedPeople = useRef<{ query: string; hits: SearchHit[] } | null>(null);
  // The box's suggestion dropdown — the hero lifts toward the top while it is open.
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
  // The SUBMITTED query — what SearchResults streams for. Distinct from
  // `query` (the live box text): results only change on submit/URL, never
  // per keystroke. SearchResults owns the stream, skeleton and count line.
  // null = pristine home; "" = BROWSE mode (a vertical, no keyword — the
  // "just show me all the live events" ask); non-empty = a real query.
  const [submitted, setSubmitted] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q")?.trim();
      if (q) return `${q} ${params.get("f") ?? ""}`.trim();
      // ?t= without ?q= is a deep link into browsing that vertical — with
      // whatever filters the link carries: in browse the filters ARE the query.
      return params.get("t") ? (params.get("f") ?? "").trim() : null;
    } catch { return null; }
  });
  const hasSearched = submitted !== null;
  // Brief in-box spinner while a NIP-05 handle resolves to a profile.
  const [isSearching, setIsSearching] = useState(false);

  const searchAbortRef = useRef(0);
  const phFadeTimerRef = useRef<number | undefined>(undefined);
  // The animated hero container — the wordmark refresh replays its
  // load-in through the Web Animations API (a remount would re-trigger
  // the input's autoFocus and reopen the recents dropdown).
  const heroRef = useRef<HTMLDivElement | null>(null);
  // Whether the reader has scrolled under the pinned band. It is see-through
  // over the top of the page and frosts only once there is content behind it
  // — the same rule as PublicPageHeader, and the reason the band no longer
  // reads as a slab laid over the aurora in dark mode.
  const [bandFrosted, setBandFrosted] = useState(false);
  useEffect(() => {
    if (!hasSearched) {
      setBandFrosted(false);
      return;
    }
    const onScroll = () => setBandFrosted(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasSearched]);
  // Safari's chrome takes this page's own color while it is up. iOS Safari paints the
  // theme-color past the page's end — into the strip its toolbar gives up when the box
  // takes focus — and the app's ink (#0a0e18) ran as a black band under the white home
  // screen, with the status bar above it just as dark. Restored on the way out.
  // The body takes it too: the phone tab bar's reserved space (body padding) stays while the
  // bar steps aside for typing — releasing it reflowed every page on each focus — and under a
  // one-screen page that space showed the app's gray.
  // Read off <html>'s `dark` class, which lib/theme toggles, so a theme switch follows.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const before = meta?.content;
    const root = document.documentElement;
    const body = document.body;
    const bodyBefore = body.style.backgroundColor;
    const paint = () => {
      // slate-950 / white: this page's own background.
      const color = root.classList.contains("dark") ? "#020617" : "#ffffff";
      if (meta) meta.content = color;
      body.style.backgroundColor = color;
    };
    paint();
    const themeChange = new MutationObserver(paint);
    themeChange.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      themeChange.disconnect();
      if (meta && before != null) meta.content = before;
      body.style.backgroundColor = bodyBefore;
    };
  }, []);
  // The box — the one every search surface shares (components/search/SearchBox).
  const boxRef = useRef<SearchBoxHandle | null>(null);
  // Where a touch on the → button began, and how far the page was scrolled then —
  // a finger that travelled, or a page that moved under it, was a scroll, not a tap.
  const searchTouchRef = useRef<{ x: number; y: number; scrollY: number } | null>(null);
  const didInitFromUrlRef = useRef(false);
  // Live identity: the header avatar appears as soon as the profile metadata
  // lands after login, without a refresh. The perspective rule is the one the
  // box's suggestions use, so results and suggestions rank alike.
  const { user, setPov, effectivePov, hasMywot, isSearchObserver } = useSearchPov();
  const { openProfile: goToProfile, prefetchEnter: handlePrefetchEnter, prefetchLeave: handlePrefetchLeave } = useOpenProfile();

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

  // Abandon whatever the results area is showing (and any stream still
  // running for it) without touching the query box. A bare tab in the URL
  // keeps browsing that tab; nothing at all returns to the pristine home.
  const resetResults = useCallback(() => {
    searchAbortRef.current++;
    const params = new URLSearchParams(window.location.search);
    setSubmitted(params.get("t") ? (params.get("f") ?? "").trim() : null);
    setIsSearching(false);
  }, []);

  // `trigger` says who asked: the user (undefined), the URL on a cold load
  // ("init"), or the back/forward buttons ("pop").
  //
  // Direct identifiers (npub, hex, nip05, #tag, pasted note) leave the home for
  // another page. That hop must not repeat when the user comes back to the
  // entry it started from, or they are bounced straight forward again — and it
  // is the ENTRY that has to remember, not this component: Landing sits under a
  // <Switch>, so it unmounts on the way out and remounts on Back with every ref
  // reset and no popstate of its own to observe.
  const handleSearch = useCallback(
    async (overrideQuery?: string, overrideFilters?: string, trigger?: "init" | "pop") => {
    const q = (overrideQuery ?? query).trim();
    const f = (overrideFilters ?? filters).trim();
    if (!q) return;
    // Only an automatic re-run stays put; typing the same identifier again is
    // the user asking for the hop.
    if (trigger !== undefined && hasHopped()) {
      resetResults();
      return;
    }
    // Remember this query for the "Recent" list (de-duped, most-recent-first).
    // A search scoped to a person (from:npub…) is a step from their profile,
    // not words anyone typed — and a key is nothing to show in a list.
    // A scope is a step from somebody's profile, not words anyone typed, and a query with no
    // WORDS is a filter — `since:2026-09-16` on its own is what choosing a date preset while
    // browsing writes, and it is nothing to offer back in a list of recent searches.
    if (!scopeOf(q) && queryWords(q)) pushRecentQuery(q);
    // Running a full search cancels any pending/in-flight suggestion request and
    // closes the dropdown so it can't reopen on top of the results list.
    boxRef.current?.closeSuggestions();

    // Put the query in the URL so Back returns to it with the box filled in —
    // for every kind of query, not just the text search below.
    if (!trigger) {
      try {
        const currentUrl = new URL(window.location.href);
        const prevF = currentUrl.searchParams.get("f") ?? "";
        if (currentUrl.searchParams.get("q") !== q || prevF !== f) {
          currentUrl.searchParams.set("q", q);
          if (f) currentUrl.searchParams.set("f", f);
          else currentUrl.searchParams.delete("f");
          window.history.pushState({}, "", currentUrl.pathname + currentUrl.search);
          trackHistoryEntry();
        }
      } catch {}
    }
    // Leave the home for a direct identifier, stamping the entry we are leaving
    // so coming back to it lands on the filled search box. A cold `/?q=npub…`
    // has no such entry worth keeping, so it redirects rather than pushes.
    const leave = (dest: string) => {
      markHopped();
      setLocation(dest, { replace: trigger === "init" });
    };

    // Pasted note/event or long-form article link → on-site landing page
    // (njump parity: "paste anything → it just works").
    const ent = resolveEntityToPath(q);
    if (ent && (ent.kind === "note" || ent.kind === "article")) {
      leave(ent.path);
      return;
    }

    // A #hashtag query → the trust-ranked CONTENT feed for that tag (not a profile search).
    // `parseTopicQuery`, not a rule of its own: ONE hashtag and nothing else is a topic, and
    // anything more is a search carrying a tag filter, which the box's grammar handles. The
    // inline copy this replaces squashed the whole query into one slug, so `#nostr bitcoin`
    // left for /t/nostrbitcoin and the combined grammar was unreachable from here.
    const topic = parseTopicQuery(q);
    if (topic.isTopic && topic.tag) {
      leave(topicPath(topic.tag));
      return;
    }

    // Direct identifiers resolve to a profile — logged-out visitors get the public
    // /p page, members get the personalized /profile view (mirrors goToProfile).
    const profileDest = (np: string) => `/p/${np}`;

    if (isLikelyNpub(q)) {
      try {
        const decoded = nip19.decode(q);
        if (decoded.type === "npub" && typeof decoded.data === "string") {
          leave(profileDest(q));
          return;
        }
      } catch {}
    }

    if (isHexPubkey(q)) {
      const npub = nip19.npubEncode(q.toLowerCase());
      leave(profileDest(npub));
      return;
    }

    if (isNip05Handle(q)) {
      const searchId = ++searchAbortRef.current;
      setIsSearching(true);
      try {
        const hexPubkey = await resolveNip05(q);
        if (searchAbortRef.current !== searchId) return;
        if (hexPubkey) {
          leave(profileDest(nip19.npubEncode(hexPubkey)));
          return;
        }
        // Unresolvable handle falls through to a plain text search below.
      } finally {
        if (searchAbortRef.current === searchId) setIsSearching(false);
      }
    }

    // Everything else is a real search: hand it to SearchResults — the stream,
    // skeleton, errors and count line live there. The URL was written above,
    // for every kind of query, so Back lands here with the box filled in.
    setSubmitted(`${q} ${f}`.trim());
    },
    [query, filters, setLocation, resetResults],
  );

  // In-app links to /?q=… — the panel's related topics and "More events", the
  // home's trending tags — change the URL through pushState, which fires no
  // popstate. Benjamin, over #texas: "nothing happens when users click on
  // these". The URL's words are the truth: when they differ from what is
  // showing, run them, exactly as Back does.
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const q = (params.get("q") || "").trim();
    const f = (params.get("f") || "").trim();
    if (!q || `${q} ${f}`.trim() === submitted) return;
    setQuery(q);
    setFilters(f);
    didInitFromUrlRef.current = true;
    handleSearch(q, f, "pop");
    // `submitted` is read, not a trigger: a change in it is the search this effect started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, handleSearch]);

  // Sync the back/forward buttons with the search results list.
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q") || "";
      const f = params.get("f") || "";
      setQuery(q);
      setFilters(f);
      didInitFromUrlRef.current = true;
      // Back/forward: the URL is the truth for the filters too.
      setFilters(f);
      if (q.trim()) handleSearch(q, f, "pop");
      else resetResults();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handleSearch, resetResults]);

  // Run the URL-seeded search for everyone, including anonymous visitors
  // (search is public). Carries over `/search?q=` deep links onto the home.
  useEffect(() => {
    if (didInitFromUrlRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") || "";
    if (q.trim()) {
      didInitFromUrlRef.current = true;
      handleSearch(q, params.get("f") || "", "init");
    }
  }, [handleSearch]);

  // A query scoped to one person shows that person as a PILL inside the box — their face and
  // name where the grammar has `from:npub…`, never the raw key (Benjamin: "we should never
  // show the raw scope").
  const scope = scopeOf(query);
  // The person's name, for RECENT — the pill's hook and cache, not a second
  // fetch. A profile with no name stays unnamed: never a key.
  const scopeProfiles = useProfileMap(scope ? [scope.pubkey] : NO_PUBKEYS);
  const scopeProfile = scope ? scopeProfiles.get(scope.pubkey) : undefined;
  const scopeName = scopeProfile && (scopeProfile.displayName || scopeProfile.name) ? getDisplayLabel(scopeProfile) : null;
  // A search of one person's things is a search — RECENT remembers it the way the chip that
  // opened it read: the face, the name, the tab it opened on, never the key. Recorded from
  // the search that RAN (not each keystroke), once the person's name is known. Tabs browsed
  // under it are not searches (Benjamin, 2026-09-24: "just your search, like Google"), so a
  // tab change leaves history alone.
  useEffect(() => {
    if (!hasSearched || !submitted) return;
    const ran = scopeOf(submitted);
    if (!ran || !scopeName || ran.pubkey !== scope?.pubkey) return;
    const openedOn = new URLSearchParams(window.location.search).get("t") || "everything";
    pushRecentScoped({ pubkey: ran.pubkey, npub: npubFromPubkey(ran.pubkey), label: scopeName, picture: scopeProfile?.picture, tab: openedOn, words: ran.rest });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, hasSearched, scopeName, scopeProfile?.picture]);
  // Arriving scoped — the profile's magnifier, a "View all" — the cursor is
  // already in the box (X's profile search). Once per person, so typing and
  // re-renders never have their focus stolen.
  const focusedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scope) {
      focusedScopeRef.current = null;
      return;
    }
    if (focusedScopeRef.current === scope.pubkey) return;
    focusedScopeRef.current = scope.pubkey;
    boxRef.current?.focus();
  }, [scope?.pubkey]);

  const clearSearch = useCallback((opts?: { refocus?: boolean }) => {
    searchAbortRef.current++;
    setQuery("");
    setFilters("");
    setSubmitted(null);
    setIsSearching(false);
    // Refocusing reopens the recents dropdown — right for the ⓧ clear
    // button, wrong for the wordmark (a "refresh", not an invitation).
    boxRef.current?.reset(opts);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("q") || url.searchParams.has("t") || url.searchParams.has("f")) {
        url.searchParams.delete("q");
        url.searchParams.delete("t");
        url.searchParams.delete("f");
        window.history.pushState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    } catch {}
  }, []);

  // Browse a whole vertical with no keyword — Benjamin's "just show me all
  // the live events". Deep-linkable: ?t=<tab> with no ?q=.
  const browseVertical = useCallback((tabKey: string) => {
    boxRef.current?.closeSuggestions();
    setQuery("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.set("t", tabKey);
      window.history.pushState({}, "", url.pathname + url.search);
    } catch {}
    setSubmitted(filters.trim());
  }, [filters]);

  const onPeopleSuggested = useCallback((q: string, hits: SearchHit[]) => {
    // Kept for the People section: submitting asks this very question again.
    suggestedPeople.current = { query: q, hits };
  }, []);

  // We lift the search box toward the top when its dropdown opens (or once a
  // search is under way) so the list/results have room.
  const lifted = hasSearched || isSearching || query.trim().length > 0;

  // 100dvh, not 100vh: on iOS the toolbar eats a big share of a LANDSCAPE
  // viewport, and 100vh measures the large (toolbar-hidden) viewport — so the
  // bottom of the page sits under the chrome exactly when room is scarcest.
  return (
    <div className="min-h-[100dvh] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col relative [overflow-x:clip]" data-testid="page-home">
      <GlossBackground />
      {/* Aurora glow behind the hero — soft at rest, blooms when the search goes
          active, so the wordmark + search feel alive without any idle noise. Drawn
          already soft — the size and falloff a 100px CSS blur used to give it —
          because iOS re-rasterized that blur on every keystroke in the box. Clipped to
          the page, as GlossBackground's washes are: its lower half used to hang past a
          one-screen page, and the page scrolled into nothing to show it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className={`absolute left-1/2 top-[44dvh] h-[980px] w-[1280px] -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out ${lifted ? "opacity-100 scale-105" : "opacity-60"}`}
          style={{ background: "radial-gradient(closest-side, rgba(114,55,255,0.075) 0%, rgba(90,110,250,0.06) 25%, rgba(19,210,229,0.035) 50%, rgba(19,210,229,0.012) 75%, transparent 100%)" }}
        />
      </div>

      {/* Homepage top bar (Google-search pattern): the center stays empty so the
          search box owns it. B symbol left · account actions right — transparent
          over the hero photo, both signed-in/out. The About / How-search-works /
          Developers / Q&A links live in the bottom footer, Google-style. */}
      {/* No height floor needed for the hide/show below: the right-hand control
          (36px) is taller than the B (28px), so the header measures 76px either
          way and the hero never shifts. */}
      {/* The pristine landing keeps this bar: empty centre, actions right. Once
          a search has run the page becomes a tool — the hero folds into one
          compact band (small mark · box · actions) and this bar steps aside so
          results start high (Benjamin, 2026-09-04: "Apple-like clean"). */}
      {!hasSearched && (
      <header className="relative z-20 flex items-center px-4 sm:px-8 py-5 short:py-2.5" data-testid="home-header">

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
      )}

      {/* `short:` = a phone in landscape. It lands on the desktop side of every
          width breakpoint, so the optical-centering offset and the generous
          desktop padding both have to be neutralised by height, not width. `!`
          because these override `sm:` utilities of equal specificity. */}
      <main className={`relative z-10 flex-1 flex flex-col items-center px-4 ${hasSearched ? "justify-start pt-3 sm:pt-4" : dropdownOpen || lifted ? "justify-start pt-6 sm:pt-10 short:!pt-2" : "justify-center -mt-10 sm:-mt-16 short:justify-start short:!mt-0 short:pt-2"}`}>
        {/* Two shapes, one tree: the centred hero before a search; after it, a
            compact band — mark left, box centre, actions right — that wraps
            to two rows on a phone (mark and actions above, box below). */}
        <div
          ref={heroRef}
          className={
            hasSearched
              ? "sticky top-0 z-30 -mt-3 sm:-mt-4 py-2 sm:py-2.5 w-full max-w-6xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-x-5"
              : "w-full max-w-2xl mx-auto text-center motion-safe:animate-[homeFadeUp_0.5s_ease-out]"
          }
          data-testid={hasSearched ? "search-band" : "search-hero"}
        >
          <style>{`@keyframes homeFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* The band's paint, on its own layer: the content row is only as
              wide as the results column, so painting the row itself drew a
              rectangle with two hard edges down the middle of the page. This
              spans the viewport instead, and stays clear until scrolled. */}
          {hasSearched && (
            <div
              aria-hidden="true"
              data-frosted={bandFrosted}
              data-testid="search-band-backdrop"
              className={`pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 border-b transition-[background-color,box-shadow,border-color] duration-300 ${
                bandFrosted
                  ? "border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl shadow-sm dark:shadow-none"
                  : "border-transparent bg-transparent"
              }`}
            />
          )}

          <div className={hasSearched ? "order-1 flex shrink-0 items-center" : "flex flex-col items-center mb-8 short:mb-3.5"}>
            <h1 className={hasSearched ? "flex items-center" : "mb-2.5 short:mb-1.5"} data-testid="text-home-title">
              {/* Wordmark <img> carries the "Brainstorm" accessible name (its
                  alt), so no sr-only duplicate. */}
              {/* Website hero → wordmark. Stays the Aurora gradient (a reserved
                  brand moment); it sits over the near-white scrim core, so it
                  stays legible without recoloring as you type. Dark: white mark. */}
              {/* `short:!h-9` needs the bang twice over: to beat `sm:`-level
                  utilities AND because Wordmark sets its height as an inline
                  style, which only `!important` can override. */}
              {/* Google's logo move: the mark is the way back — one click
                  clears the search and lands you on the pristine box. */}
              <button
                type="button"
                onClick={() => {
                  clearSearch({ refocus: false });
                  // Same entrance as a fresh load — the refresh should FEEL
                  // like arriving, not like something vanished.
                  if (!prefersReducedMotion) {
                    heroRef.current?.animate(
                      [
                        { opacity: 0, transform: "translateY(16px)" },
                        { opacity: 1, transform: "translateY(0)" },
                      ],
                      { duration: 500, easing: "ease-out" },
                    );
                  }
                }}
                aria-label="Back to the search home"
                className="cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                data-testid="wordmark-home"
              >
                <Wordmark height={hasSearched ? 26 : 52} variant="gradient" className={hasSearched ? "dark:hidden" : "mx-auto dark:hidden short:!h-9"} />
                <Wordmark height={hasSearched ? 26 : 52} variant="white" className={hasSearched ? "hidden dark:block" : "mx-auto hidden dark:block short:!h-9"} />
              </button>
            </h1>
            {!hasSearched && (
              <p className="text-slate-700 dark:text-slate-100 text-base sm:text-lg short:!text-sm font-medium" data-testid="text-home-subtitle">
                Search through the people you trust.
              </p>
            )}
          </div>

          <SearchBox
            boxRef={boxRef}
            className={hasSearched ? "order-3 basis-full sm:order-2 sm:basis-auto sm:flex-1 sm:min-w-0 sm:max-w-2xl sm:mx-auto" : undefined}
            value={query}
            onChange={setQuery}
            onSearch={(q) => { void handleSearch(q); }}
            onClear={() => clearSearch()}
            onBrowse={browseVertical}
            // Dropping a filter is a decision: the page acts on it at once rather than
            // waiting for Enter. Emptying the box is the ⓧ gesture — back to the home.
            onRemoveToken={(next) => {
              if (!next.trim()) { clearSearch(); return; }
              if (hasSearched) void handleSearch(next);
            }}
            // "Recent" belongs to the pristine home, never alongside a results list.
            recentsAllowed={!hasSearched}
            busy={hasSearched && isSearching}
            onPeopleSuggested={onPeopleSuggested}
            onSuggestionsChange={setDropdownOpen}
            autoFocus={!hasSearched}
            placeholder={
                    <span
                      className={`${SEARCH_PLACEHOLDER_CLASS} transition-opacity duration-300 ${phVisible ? "opacity-100" : "opacity-0"}`}
                      data-testid="text-home-placeholder"
                    >
                      {isFirstVisit && !prefersReducedMotion ? PLACEHOLDER_EXAMPLES[phIndex] : PLACEHOLDER_EXAMPLES[0]}
                    </span>
            }
            trailing={
              <>
                {/* The band has no button: Enter searches, the magnifier spins
                    while it runs. The pristine landing keeps the purple call. */}
                {!hasSearched && (
                <button
                  type="submit"
                  aria-label="Search"
                  // Disabled only while a search is in flight — at rest (even
                  // with an empty box) the button stays solid Aurora Purple
                  // (#7237ff) instead of washing out to a faded lavender.
                  // handleSearch() no-ops on an empty query, so an idle click is
                  // harmless.
                  disabled={isSearching}
                  // iOS Safari: a tap here while the field is being edited ends the editing
                  // first — the keyboard drops, the page scrolls back down — and the click it
                  // synthesizes afterwards lands wherever the button has moved away from, so the
                  // search never runs until a second tap. Submit on the touch itself, and cancel
                  // the late click so it can't hit whatever the results put under the finger.
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    // One finger is a tap; a second is a pinch, never a search.
                    searchTouchRef.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, scrollY: window.scrollY } : null;
                  }}
                  onTouchCancel={() => {
                    searchTouchRef.current = null;
                  }}
                  onTouchEnd={(e) => {
                    const start = searchTouchRef.current;
                    searchTouchRef.current = null;
                    const t = e.changedTouches[0];
                    const r = e.currentTarget.getBoundingClientRect();
                    // The button rides along with a scroll, so ending inside it proves nothing:
                    // the finger has to stay put and the page with it. Anything else is left
                    // to the browser (a scroll, or a click for it to synthesize).
                    if (!start || !t || e.touches.length > 0) return;
                    if (Math.abs(t.clientX - start.x) > TAP_SLOP || Math.abs(t.clientY - start.y) > TAP_SLOP) return;
                    if (Math.abs(window.scrollY - start.scrollY) > TAP_SLOP) return;
                    if (t.clientX < r.left || t.clientX > r.right || t.clientY < r.top || t.clientY > r.bottom) return;
                    e.preventDefault();
                    if (isSearching) return;
                    // Dropping focus commits what the keyboard still held (autocorrect, a
                    // prediction, an IME composition); the field has it, `query` is the last
                    // render's. So the box's own words, read after the blur, as onEnter does.
                    (document.activeElement as HTMLElement | null)?.blur?.();
                    boxRef.current?.closeSuggestions();
                    void handleSearch(boxRef.current?.getValue());
                  }}
                  className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-1.5 text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary-hover rounded-full transition-colors active:scale-[0.98] shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
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
                )}
              </>
            }
          />

          {/* Band, right: the same account actions the pristine bar carries. */}
          {hasSearched && (
            <div className="order-2 ml-auto flex shrink-0 items-center gap-1 sm:order-3 sm:ml-0 sm:gap-2" data-testid="band-actions">
              {user ? (
                <AccountMenu user={user} onLogout={handleLogout} active="home" />
              ) : (
                <SignInButton variant="primary" label="Sign in" className="!rounded-full sm:px-5" data-testid="button-home-sign-in" />
              )}
            </div>
          )}

          {/* No browse link here on purpose. Tags reach this page through the
              search box itself — type two characters and matching tags appear
              in the dropdown above the people. A second, static CTA under the
              field competed with the one thing this screen asks you to do.
              The catalogue's home entry point is /tags/mine instead. */}

          {/* The lens switch sits under the box only while the page is
              pristine. Once results show it moves into the results' tab row
              (compact) — one row of chrome between the box and the results,
              not three. */}
          {!hasSearched && (
            <PerspectiveToggle
              pov={effectivePov}
              user={user}
              hasMywot={hasMywot}
              isSearchObserver={isSearchObserver}
              onChange={setPov}
            />
          )}
        </div>

        {/* The finish-setup nudge lives in the pristine bar; once that bar has
            stepped aside it sits under the band instead. Self-hides when done. */}
        {hasSearched && (
          <div className="mt-2 flex w-full justify-center">
            <FinishSetupBanner />
          </div>
        )}

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

        {/* The home feed ("What's happening now") is unmounted for now
            (Benjamin, 2026-09-09: "let's remove this for now"); the pristine
            home is the centered hero and nothing below it. components/feed/
            HomeFeed keeps the bands for when it comes back. */}
        {hasSearched && (
          <>
          <BackToTop />
          <SearchResults
            peopleSeed={suggestedPeople.current?.query === (submitted ?? "") ? suggestedPeople.current.hits : undefined}
            query={submitted ?? ""}
            pov={effectivePov}
            userPubkey={user?.pubkey}
            perspective={
              <PerspectiveToggle
                compact
                pov={effectivePov}
                user={user}
                hasMywot={hasMywot}
                isSearchObserver={isSearchObserver}
                onChange={setPov}
              />
            }
            onOpenProfile={goToProfile}
            onPrefetchEnter={handlePrefetchEnter}
            onPrefetchLeave={handlePrefetchLeave}
            onQueryRewrite={(next) => {
              // A filter change: the words stay in the box, the tokens go to
              // filter state + the URL's `f`, and the search resubmits.
              const { text, tokens } = splitFilters(next);
              setFilters(tokens);
              if (text !== query.trim()) setQuery(text);
              if (text) {
                void handleSearch(text, tokens);
                return;
              }
              // Browse — a tab, no words. Google's tools work for everyone,
              // signed in or not, and live in the URL: the filters are the
              // whole query here, so re-run the browse with them and carry
              // them in `f` for Back, reload and sharing.
              try {
                const url = new URL(window.location.href);
                if (tokens) url.searchParams.set("f", tokens);
                else url.searchParams.delete("f");
                window.history.pushState({}, "", url.pathname + url.search);
                trackHistoryEntry();
              } catch {}
              setSubmitted(tokens);
            }}
          />
          </>
        )}
      </main>

      {/* Footer (Google-search pattern): secondary/info links sit quietly at the
          bottom, muted and small, so they never compete with the search box.
          Hidden on mobile — on a phone the viewport belongs to the search box,
          and these wrap into a block that crowds it. The mobile tab bar already
          carries the primary navigation. */}
      <HomeFooter />
    </div>
  );
}
