import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MessageSquare,
  Package,
  Radio,
  Search,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_ICON } from "@/lib/dlists";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin, useTierRing, useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { getRecentItems, removeRecentItem, clearRecentSearches, recentKey, type RecentItem } from "@/lib/recentSearches";
import { getDisplayLabel, isLikelyNpub, isHexPubkey, isNip05Handle, typeaheadPause, type SearchResult } from "@/lib/profileSearch";
import { suggestListings, suggestProfileHits, suggestProfiles, tabLabel, type SearchHit } from "@/services/search";
import { personAssist, scopeOf, type PersonAssist, seeAllLabel, typeaheadWords, scopedSearchHref } from "@/lib/searchSyntax";
import type { SearchFieldHandle } from "@/lib/searchFieldDom";
import { parseTopicQuery, topicPath } from "@/lib/topicQuery";
import { intentTarget, searchIntent } from "@/lib/personContent";
import { resolveEntityToPath } from "@/lib/resolveNostrEntity";
import { eventPath, npubFromPubkey } from "@/lib/shareId";
import { useConnectionSpeed } from "@/lib/connection";
import { useProfileMap } from "@/hooks/useProfileMap";
import { usePersonContent } from "@/hooks/usePersonContent";
import { useTagMatches } from "@/hooks/useTags";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useSearchPov } from "@/hooks/useSearchPov";
import { useOpenProfile } from "@/hooks/useOpenProfile";
import { SearchField } from "@/components/search/SearchField";
import { ListingSuggestionRow } from "@/components/search/ListingSuggestionRow";
import { TopicSuggestionRow } from "@/components/search/TopicSuggestionRow";
import { TagSuggestionRow, tagSuggestionPath } from "@/components/search/TagSuggestionRow";
import { PersonContentChips } from "@/components/search/PersonContentChips";
import { IntentSuggestionRow } from "@/components/search/IntentSuggestionRow";
import { SEARCH_BOX_CLASS, SEARCH_CLEAR_CLASS, SEARCH_ICON_CLASS } from "@/components/search/searchBoxChrome";

const NO_PUBKEYS: string[] = [];

/**
 * A row's mousedown must not take focus from the field — the field's blur would close the
 * panel before the click lands. The action itself rides `onClick`, so Enter and Space work.
 */
const keepFocus = (e: ReactMouseEvent) => e.preventDefault();

/**
 * Words that name one place — a lone `#topic`, a pubkey, a pasted note or article — go
 * straight there, the way the home page sends them, instead of loading the results page
 * only for it to redirect. A NIP-05 handle needs a lookup, so it takes the results route.
 */
function directPath(q: string): string | null {
  const topic = parseTopicQuery(q);
  if (topic.isTopic) return topic.tag ? topicPath(topic.tag) : null;
  if (isHexPubkey(q)) return `/p/${nip19.npubEncode(q.toLowerCase())}`;
  if (isLikelyNpub(q)) {
    try {
      if (nip19.decode(q).type === "npub") return `/p/${q}`;
    } catch { /* not an npub after all */ }
  }
  const ent = resolveEntityToPath(q);
  return ent && (ent.kind === "note" || ent.kind === "article") ? ent.path : null;
}

/** One chip per vertical, in the results tab bar's order — the empty box's way to browse. */
const BROWSE = [
  { tab: "people", label: "People", icon: Users },
  { tab: "notes", label: "Notes", icon: MessageSquare },
  { tab: "media", label: "Media", icon: ImageIcon },
  { tab: "shop", label: "Shop", icon: ShoppingBag },
  { tab: "apps", label: "Apps", icon: Package },
  { tab: "events", label: "Events", icon: CalendarDays },
  // The music category's icon comes from the D-list registry (the team, 2026-09-24).
  { tab: "music", label: "Music", icon: CATEGORY_ICON.music },
  { tab: "live", label: "Live", icon: Radio },
  { tab: "lists", label: "Lists", icon: ListChecks },
];

/** What the page holding a box can do to it. */
export interface SearchBoxHandle {
  focus: () => void;
  /** The field's own words — ahead of `value` when a keyboard has just committed text. */
  getValue: () => string;
  /** A search ran from outside the box (a button, the URL): the suggestions stand down. */
  closeSuggestions: () => void;
  /** Back to an empty box. `refocus` (default) puts the caret in it, and recents may show. */
  reset: (opts?: { refocus?: boolean }) => void;
}

/**
 * THE search box — the home hero, the results band, the header on the shared pages
 * (/p, /e, /a, /t), the phone's search sheet and the dashboard lookup are all this one
 * component. They used to be three separate implementations that drifted: the header and
 * the sheet were plain inputs with their own typeahead, no filter pills, no `from:` people
 * completion and their own recents. Now what a query looks like and what the box offers
 * under it is the same wherever it is typed.
 *
 * The box owns its typeahead (people, products, tags, topics, the intent row), the recents
 * + Browse panel under an empty box, and opening what is picked there. What a SEARCH means
 * is the page's: the home page runs it in place (`onSearch`), everywhere else it is a trip
 * to `/?q=`.
 *
 * `sheet` lays the panels out in flow under the box instead of as a dropdown over the page —
 * the phone's full-screen search — and keeps them up without waiting for focus.
 */
export function SearchBox({
  value,
  onChange,
  onSearch,
  onClear,
  onBrowse,
  onRemoveToken,
  onLeave,
  recentsAllowed = true,
  busy = false,
  trailing,
  aside,
  rowClassName,
  rowStyle,
  placeholder,
  ariaLabel = "Search people, topics, or handles",
  autoFocus,
  boxRef,
  onPeopleSuggested,
  onSuggestionsChange,
  sheet = false,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  /**
   * Enter, "See all results", a recent query: run a search for these words. Default: the
   * trip away from home — straight to a topic, profile or note the words name, else `/?q=`.
   */
  onSearch?: (q: string) => void;
  /** The ⓧ emptied the box. */
  onClear: () => void;
  /** A Browse chip: that vertical, no words. Default: `/?t=`. */
  onBrowse?: (tab: string) => void;
  /** A pill's × dropped a token; the value the box is left with. */
  onRemoveToken?: (next: string) => void;
  /** The box is sending the reader somewhere (a person, a listing, a tag…). */
  onLeave?: () => void;
  /** Whether an empty box may offer recents + Browse (the home page stops once results show). */
  recentsAllowed?: boolean;
  /** A search is running: the magnifier spins. */
  busy?: boolean;
  /** Inside the bar, after the ⓧ — the home hero's search button. */
  trailing?: ReactNode;
  /** Beside the bar, outside it — the sheet's Cancel. */
  aside?: ReactNode;
  /** The row holding the bar and `aside`. */
  rowClassName?: string;
  rowStyle?: CSSProperties;
  placeholder: ReactNode;
  ariaLabel?: string;
  autoFocus?: boolean;
  boxRef?: MutableRefObject<SearchBoxHandle | null>;
  /** The typeahead's people for a query, as hits — the home page seeds its People section. */
  onPeopleSuggested?: (query: string, hits: SearchHit[]) => void;
  /** The suggestions dropdown opened or closed under the box. */
  onSuggestionsChange?: (open: boolean) => void;
  sheet?: boolean;
  className?: string;
}) {
  const uid = useId();
  const listId = `${uid}-suggestions`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();
  const [, navigate] = useLocation();
  const { user, effectivePov } = useSearchPov();
  const { openProfile, prefetchEnter, prefetchLeave } = useOpenProfile();
  const speed = useConnectionSpeed();

  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  // Product titles under the people — "Satoshi Smiley T-shirt", straight to it.
  const [productSuggestions, setProductSuggestions] = useState<SearchHit[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // Per-browser recent searches, shown under an empty, focused box.
  const [recent, setRecent] = useState<RecentItem[]>(() => getRecentItems());
  const [focused, setFocused] = useState(false);
  // Benjamin: "when users refresh to the home screen, don't have the search
  // history dropdown [showing]" — the box autofocuses on load, and focus
  // alone used to open recents. Google waits for a gesture: recents appear
  // once the person has clicked or typed in the box, not on page load.
  const [engaged, setEngaged] = useState(false);
  const [suggestMaxH, setSuggestMaxH] = useState<number | null>(null);
  // True while the field's own calendar or group picker owns the space under the box; the
  // suggestion dropdown stands down rather than stacking two lists on one square.
  const [fieldPicking, setFieldPicking] = useState(false);
  // Relay hits carry no rank numbers (order-only wire) — the dropdown's rings
  // and coins feed from the shared author-score cache, like every card.
  const suggestScoreOf = useAuthorScores(useMemo(() => suggestions.map((x) => x.pubkey), [suggestions]));

  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<SearchFieldHandle | null>(null);
  const suggestAbortRef = useRef(0);
  const suggestTimerRef = useRef<number | undefined>(undefined);
  const suggestRequestRef = useRef<AbortController | null>(null);
  const typedSinceSearchRef = useRef(false);
  // True only when the highlighted suggestion was reached via keyboard arrows.
  // Mouse hover sets the highlight for visuals/prefetch but leaves this false so
  // pressing Enter still runs a full search instead of opening a hovered profile.
  const kbdNavRef = useRef(false);
  // Non-null while the dropdown is completing a from:/to: name fragment —
  // picking a person then WRITES THE KEY instead of navigating.
  const personAssistRef = useRef<PersonAssist | null>(null);
  const peopleSuggestedRef = useRef(onPeopleSuggested);
  peopleSuggestedRef.current = onPeopleSuggested;

  // Keep the keyboard-highlighted suggestion scrolled into view.
  useEffect(() => {
    if (activeSuggestion < 0) return;
    document.getElementById(optId(activeSuggestion))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSuggestion]);

  // Live, debounced profile suggestions as the user types (Google-style).
  // Skips direct identifiers (npub / hex / NIP-05) since those resolve straight
  // to a profile on submit. A request token is bumped on every keystroke so a
  // slow earlier request can never overwrite newer suggestions.
  const scheduleSuggest = useCallback((next: string) => {
    window.clearTimeout(suggestTimerRef.current);
    suggestRequestRef.current?.abort();
    const reqId = ++suggestAbortRef.current;
    const q = next.trim();
    // Any edit to the query invalidates a prior keyboard selection so Enter
    // falls back to a full search until the user arrow-navigates again.
    kbdNavRef.current = false;
    // Mid-typing `from:ja` / `to:ma` → offer people for the FRAGMENT; picking
    // one writes the key into the query (nobody types an npub by hand).
    const assist = personAssist(next);
    personAssistRef.current = assist && assist.fragment.length >= 2 ? assist : null;
    if (personAssistRef.current) {
      typedSinceSearchRef.current = true;
      setIsSuggesting(true);
      setShowSuggestions(true);
      suggestTimerRef.current = window.setTimeout(async () => {
        try {
          suggestRequestRef.current = new AbortController();
          const people = await suggestProfiles(
            personAssistRef.current!.fragment,
            { pov: effectivePov, userPubkey: user?.pubkey },
            { signal: suggestRequestRef.current.signal },
          );
          if (suggestAbortRef.current !== reqId) return;
          setSuggestions(people.slice(0, 7));
          setActiveSuggestion(-1);
          kbdNavRef.current = false;
          setShowSuggestions(true);
        } catch {
          if (suggestAbortRef.current !== reqId) return;
          setSuggestions([]);
          setProductSuggestions([]);
        } finally {
          if (suggestAbortRef.current === reqId) setIsSuggesting(false);
        }
      }, typeaheadPause(speed));
      return;
    }
    // A `#topic` query → show the topic row (→ /t/tag), not profile suggestions.
    if (parseTopicQuery(next).isTopic) {
      typedSinceSearchRef.current = true;
      setSuggestions([]);
      setProductSuggestions([]);
      setIsSuggesting(false);
      setShowSuggestions(true);
      return;
    }
    // Filters and half-typed prefixes are not names: `doi:` must not list people called "doi".
    // A person scope is the box's own frame, not a filter being typed; the words beside it are.
    if (q.length < 2 || typeaheadWords(scopeOf(next)?.rest ?? next) === null || isLikelyNpub(q) || isHexPubkey(q) || isNip05Handle(q)) {
      typedSinceSearchRef.current = false;
      setSuggestions([]);
      setProductSuggestions([]);
      setShowSuggestions(false);
      setIsSuggesting(false);
      return;
    }
    typedSinceSearchRef.current = true;
    setIsSuggesting(true);
    setShowSuggestions(true);
    suggestTimerRef.current = window.setTimeout(async () => {
      try {
        suggestRequestRef.current = new AbortController();
        const signal = suggestRequestRef.current.signal;
        // Products ask beside the people, on the same cancel; they land when they land.
        void suggestListings(q, { pov: effectivePov, userPubkey: user?.pubkey }, { limit: 3, signal }).then((hits) => {
          if (suggestAbortRef.current !== reqId) return;
          setProductSuggestions(hits);
          if (hits.length) setShowSuggestions(true);
        });
        // "staci shop" looks up "staci"; the category word becomes the intent row.
        const lookup = searchIntent(q)?.name ?? q;
        const suggestHits = await suggestProfileHits(lookup, { pov: effectivePov, userPubkey: user?.pubkey }, { signal });
        if (suggestAbortRef.current !== reqId) return;
        peopleSuggestedRef.current?.(q, suggestHits);
        setSuggestions(suggestHits.map((h) => h.author).filter((a): a is SearchResult => !!a).slice(0, 7));
        setActiveSuggestion(-1);
        kbdNavRef.current = false;
        setShowSuggestions(true);
      } catch {
        if (suggestAbortRef.current !== reqId) return;
        setSuggestions([]);
        setProductSuggestions([]);
      } finally {
        if (suggestAbortRef.current === reqId) setIsSuggesting(false);
      }
    }, typeaheadPause(speed));
  }, [effectivePov, user?.pubkey, speed]);

  useEffect(() => {
    return () => {
      window.clearTimeout(suggestTimerRef.current);
      suggestRequestRef.current?.abort();
    };
  }, []);

  // Closing the dropdown drops the pending and in-flight suggestion alike.
  useEffect(() => {
    if (showSuggestions) return;
    window.clearTimeout(suggestTimerRef.current);
    suggestAbortRef.current++;
    suggestRequestRef.current?.abort();
  }, [showSuggestions]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!showSuggestions) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSuggestions]);

  // A POV flip re-ranks what the dropdown is showing.
  const prevPovRef = useRef(effectivePov);
  useEffect(() => {
    if (prevPovRef.current === effectivePov) return;
    prevPovRef.current = effectivePov;
    if (typedSinceSearchRef.current && value.trim().length >= 2) scheduleSuggest(value);
  }, [effectivePov, value, scheduleSuggest]);

  const cancelSuggest = useCallback(() => {
    window.clearTimeout(suggestTimerRef.current);
    suggestRequestRef.current?.abort();
    suggestAbortRef.current++;
    typedSinceSearchRef.current = false;
    personAssistRef.current = null;
    setShowSuggestions(false);
    setIsSuggesting(false);
  }, []);

  const reset = useCallback((opts?: { refocus?: boolean }) => {
    cancelSuggest();
    setSuggestions([]);
    setProductSuggestions([]);
    setActiveSuggestion(-1);
    // Clearing is a gesture: the box refocuses and recents may show (Google's X). The
    // home's wordmark is a "refresh", not an invitation, and passes refocus: false.
    if (opts?.refocus !== false) {
      setEngaged(true);
      fieldRef.current?.focus();
    }
  }, [cancelSuggest]);

  useEffect(() => {
    if (!boxRef) return;
    boxRef.current = {
      focus: () => fieldRef.current?.focus(),
      getValue: () => fieldRef.current?.getValue() ?? value,
      closeSuggestions: cancelSuggest,
      reset,
    };
  });
  useEffect(() => () => { if (boxRef) boxRef.current = null; }, [boxRef]);

  /** Leave for a page the box picked: the panels close, and the host hears of it. */
  const leave = (path: string) => {
    setShowSuggestions(false);
    setFocused(false);
    onLeave?.();
    navigate(path);
  };

  const goToProfile = (result: SearchResult) => {
    setShowSuggestions(false);
    setFocused(false);
    onLeave?.();
    openProfile(result);
  };

  // What picking a dropdown person means depends on mode: completing a
  // from:/to: fragment writes the key and keeps the user typing; otherwise
  // it opens the profile as always.
  const pickSuggestion = (result: SearchResult) => {
    const assist = personAssistRef.current;
    if (assist) {
      personAssistRef.current = null;
      onChange(assist.complete(result.npub));
      setSuggestions([]);
      setActiveSuggestion(-1);
      setShowSuggestions(false);
      fieldRef.current?.focus();
      return;
    }
    goToProfile(result);
  };

  const runSearch = (q: string) => {
    cancelSuggest();
    if (onSearch) { onSearch(q); return; }
    const words = q.trim();
    if (words) leave(directPath(words) ?? `/?q=${encodeURIComponent(words)}`);
  };

  const browse = (tab: string) => {
    if (onBrowse) onBrowse(tab);
    else leave(`/?t=${encodeURIComponent(tab)}`);
  };

  // A query scoped to one person: "See all results for "guitar" from Joe Martin", never the key.
  const scope = scopeOf(value);
  const words = scope ? scope.rest : value;
  const scopeProfiles = useProfileMap(scope ? [scope.pubkey] : NO_PUBKEYS);
  const scopeProfile = scope ? scopeProfiles.get(scope.pubkey) : undefined;
  const scopeName = scopeProfile && (scopeProfile.displayName || scopeProfile.name) ? getDisplayLabel(scopeProfile) : null;

  // When the typed query is itself a nostr entity/link (npub/nevent/note/naddr/…),
  // the dropdown's action row resolves it straight to the right landing page.
  // Under a scope only the WORDS can be a pasted key — the scope's own npub
  // is the person, not an entity to open.
  const entityMatch = useMemo(() => resolveEntityToPath((scope ? words : value).trim()), [value, scope, words]);
  const topicMatch = useMemo(() => parseTopicQuery(value), [value]);
  // Tags the query matches. Skipped entirely for `#topic` queries — those are
  // already routed at the hashtag feed and shouldn't offer a second answer.
  // Only while suggestions show — a query restored from the URL mustn't pull the whole catalogue.
  const tagMatches = useTagMatches(topicMatch.isTopic || !showSuggestions ? "" : value);
  // The intent row's target: "staci shop" and a suggested Staci whose chips say shop.
  const dropdownOpen =
    !fieldPicking &&
    (sheet
      // The sheet keeps its list up while there are words: "See all" is never a dead end.
      ? value.trim().length > 0
      : showSuggestions && (suggestions.length > 0 || productSuggestions.length > 0 || isSuggesting || topicMatch.isTopic || tagMatches.length > 0));
  // "Recent" shows under an empty, focused box — never alongside the suggestions. The sheet
  // was opened to search, so it shows them at once.
  const showRecent = recentsAllowed && value.trim() === "" && !dropdownOpen && (sheet || (engaged && focused));
  // What each suggested or recent person publishes — chips on their row, one tap to their
  // shop, recipes, streams. One ask per person per session. Recent people only while their
  // panel is up: the header box sits on every shared page, and a reader who never touches
  // it must not cost a lookup per person they once opened.
  const personContent = usePersonContent(
    useMemo(
      () => [...suggestions.map((s) => s.pubkey), ...(showRecent ? recent.flatMap((r) => (r.type === "profile" ? [r.pubkey] : [])) : [])],
      [suggestions, recent, showRecent],
    ),
  );
  // The intent row's target: "staci shop" and a suggested Staci whose chips say shop.
  const intent = useMemo(() => intentTarget(searchIntent(value), suggestions, personContent), [value, suggestions, personContent]);

  // Recents change as the reader searches elsewhere — read them fresh each time they show.
  useEffect(() => {
    if (showRecent) setRecent(getRecentItems());
  }, [showRecent]);

  const panelOpen = dropdownOpen || showRecent;
  useEffect(() => { onSuggestionsChange?.(dropdownOpen); }, [dropdownOpen, onSuggestionsChange]);

  // Measure the room left below the search box and cap whichever panel is open.
  // Both panels are `absolute top-full`, so without a cap they run straight off
  // the bottom of the page — and the home root is `overflow-hidden`, so the
  // overrun is CLIPPED rather than scrollable. The sheet's panels flow instead.
  useLayoutEffect(() => {
    if (sheet || !panelOpen) return;
    const recompute = () => {
      const el = containerRef.current;
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
  }, [sheet, panelOpen]);

  const panelClass = sheet
    ? "flex flex-col text-left"
    : "absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden text-left";
  const panelStyle = sheet ? undefined : { maxHeight: suggestMaxH !== null ? `${suggestMaxH}px` : "min(28rem, calc(100dvh - 9rem))" };

  const form = (
    <form
      onSubmit={(e: FormEvent) => { e.preventDefault(); runSearch(value); }}
      role="search"
      className={cn("relative group", aside && "min-w-0 flex-1")}
      data-testid="form-home-search"
    >
      <div className={SEARCH_BOX_CLASS}>
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-primary" data-testid="band-searching" />
        ) : (
          <Search className={SEARCH_ICON_CLASS} aria-hidden="true" />
        )}
        {/* py-1 (the field's own is py-1.5), with the box's py-1.5 and the button's: a bar
            snug around its one line of pills and words. */}
        <SearchField
          className="flex-1"
          inputClassName="py-1"
          fieldRef={(h) => { fieldRef.current = h; }}
          value={value}
          onChange={(next) => {
            setEngaged(true);
            onChange(next);
            scheduleSuggest(next);
          }}
          onPickerChange={setFieldPicking}
          onRemoveToken={onRemoveToken}
          onFocus={() => {
            setFocused(true);
            if (typedSinceSearchRef.current && suggestions.length > 0 && value.trim().length >= 2) setShowSuggestions(true);
          }}
          onBlur={() => setFocused(false)}
          onPointerDown={() => setEngaged(true)}
          onEnter={(typed) => {
            // Only open a single profile when the user explicitly arrow-keyed
            // to a suggestion. Plain typing + Enter (even with the mouse
            // resting over the dropdown) always runs a full text search.
            if (showSuggestions && kbdNavRef.current && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
              pickSuggestion(suggestions[activeSuggestion]);
              return;
            }
            // `typed`, not `value`: a soft keyboard's action key commits text and submits
            // in one event, and React has not re-rendered yet.
            runSearch(typed);
            // On a touch screen a search is done typing: the keyboard goes, as native
            // search does, and the tab bar (hidden while a field has focus) comes back
            // over the results. A desktop keeps the box focused for the next query.
            if (window.matchMedia?.("(pointer: coarse)").matches) {
              (document.activeElement as HTMLElement | null)?.blur?.();
            }
          }}
          onKeyDown={(e) => {
            setEngaged(true);
            if (e.key === "ArrowDown" && showSuggestions && suggestions.length > 0) {
              e.preventDefault();
              kbdNavRef.current = true;
              setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
              return true;
            }
            if (e.key === "ArrowUp" && showSuggestions && suggestions.length > 0) {
              e.preventDefault();
              kbdNavRef.current = true;
              setActiveSuggestion((i) => Math.max(i - 1, -1));
              return true;
            }
            if (e.key === "Escape") {
              setShowSuggestions(false);
              setActiveSuggestion(-1);
              return true;
            }
            return false;
          }}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          autoFocus={autoFocus}
          combobox={{
            expanded: dropdownOpen,
            controls: listId,
            activeDescendant: dropdownOpen && activeSuggestion >= 0 ? optId(activeSuggestion) : undefined,
          }}
          testId="input-home-search"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => { reset(); onClear(); }}
            aria-label="Clear search"
            className={SEARCH_CLEAR_CLASS}
            data-testid="button-home-clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {trailing}
      </div>
    </form>
  );

  const panels = (
    <>
      {dropdownOpen && (
        <div
          id={listId}
          role="listbox"
          className={panelClass}
          style={panelStyle}
          data-testid="container-home-suggestions"
        >
          {topicMatch.isTopic ? (
            <TopicSuggestionRow
              tag={topicMatch.tag}
              active
              onSelect={() => { if (topicMatch.tag) leave(topicPath(topicMatch.tag)); }}
              testId="home-topic"
            />
          ) : isSuggesting && suggestions.length === 0 && tagMatches.length === 0 ? (
            <div className="px-4 py-3 flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs" data-testid="home-suggestions-loading">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : (
            <>
              {intent && (
                <div className="shrink-0 border-b border-slate-100 dark:border-slate-800/60">
                  <IntentSuggestionRow
                    name={getDisplayLabel(intent.person as SearchResult)}
                    chip={intent.chip}
                    onSelect={() => leave(scopedSearchHref(intent.person.pubkey, intent.chip.tab))}
                    testId="home-intent-row"
                  />
                </div>
              )}
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
                        if (path) leave(path);
                      }}
                      testId="home-tag-suggestion"
                    />
                  ))}
                </div>
              )}
              <div className={cn(!sheet && "flex-1 overflow-y-auto overscroll-contain min-h-0")} data-testid="list-home-suggestions">
                {suggestions.map((s, i) => {
                  const handle = s.nip05 ? s.nip05.replace(/^_@/, "") : null;
                  const rank = s.wotRank ?? suggestScoreOf(s.pubkey) ?? null;
                  return (
                    // A div, not a button: the chips inside are links, and the
                    // field keeps focus anyway (aria-activedescendant above).
                    <div
                      key={s.pubkey}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === activeSuggestion}
                      className={`group w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left transition-colors cursor-pointer ${i === activeSuggestion ? "bg-brand-primary/10 dark:bg-brand-primary/15" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      onMouseEnter={() => { kbdNavRef.current = false; setActiveSuggestion(i); prefetchEnter(s); }}
                      onMouseLeave={() => prefetchLeave(s)}
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
                      {/* What they publish, one tap to it. Desktop reveals on
                          hover or the arrowed row; phones always show it. */}
                      <PersonContentChips
                        pubkey={s.pubkey}
                        name={getDisplayLabel(s)}
                        content={personContent.get(s.pubkey)}
                        onNavigate={() => { setShowSuggestions(false); onLeave?.(); }}
                        linkTabIndex={-1}
                        className="sm:opacity-0 sm:group-hover:opacity-100 sm:group-aria-selected:opacity-100 sm:group-focus-within:opacity-100"
                      />
                      {/* Same coin as the results list and every people list. */}
                      {rank != null && (
                        <VerificationCoin
                          score01={rank}
                          pov={effectivePov === "mywot" ? "personalized" : "global"}
                          size={22}
                          className={tierRing(rank) && coinReplaced ? "sr-only" : "shrink-0"}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Products under the people: the thing itself, one tap away. */}
              {productSuggestions.length > 0 && (
                <div className="shrink-0 border-t border-slate-100 dark:border-slate-800/60" data-testid="home-product-suggestions">
                  {productSuggestions.map((h, i) => (
                    <ListingSuggestionRow
                      key={h.event.id}
                      hit={h}
                      onSelect={() => leave(eventPath(h.event))}
                      testId={`home-product-suggestion-${i}`}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                className={`w-full shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 text-left border-t border-slate-100 dark:border-slate-800/60 text-[12px] font-medium transition-colors ${activeSuggestion === -1 ? "bg-slate-50 dark:bg-slate-800 text-brand-primary" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-brand-primary"}`}
                onMouseEnter={() => { kbdNavRef.current = false; setActiveSuggestion(-1); }}
                onMouseDown={(e) => { e.preventDefault(); runSearch(value); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); runSearch(value); } }}
                data-testid="home-suggestion-see-all"
              >
                {entityMatch ? (
                  <><ArrowRight className="h-3.5 w-3.5 shrink-0" />Open this {entityMatch.kind} →</>
                ) : (
                  <><Search className="h-3.5 w-3.5 shrink-0" />{scope ? seeAllLabel(words, scopeName) : `See all results for "${value.trim()}"`}</>
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
          className={panelClass}
          style={panelStyle}
          data-testid="container-home-recent"
        >
          {/* Browse lives HERE, not as standing page chrome — the empty focused
              box offers the verticals, Google-style. The chips wrap: the home box
              holds them on one line, the narrower header box on two, and a phone
              puts the label on a line of its own. */}
          <div className="flex flex-wrap items-center gap-1 px-4 pt-3 pb-2" data-testid="browse-chips">
            <span className="w-full sm:w-auto sm:mr-0.5 mb-0.5 sm:mb-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Browse</span>
            {BROWSE.map((c) => (
              <button
                key={c.tab}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => { setFocused(false); cancelSuggest(); browse(c.tab); }}
                // Quiet text links, not nine bordered pills (Benjamin:
                // "a lot of chips — shrink them or make it more subtle").
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-deep dark:hover:text-white transition-colors"
                data-testid={`browse-${c.tab}`}
              >
                <c.icon className="h-3 w-3 opacity-70" /> {c.label}
              </button>
            ))}
          </div>
          {recent.length > 0 && (
            <div className="flex items-center justify-between px-4 pt-1 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Recent</span>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setRecent(clearRecentSearches())}
                className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-brand-primary transition-colors focus:outline-none focus-visible:text-brand-primary"
                data-testid="button-home-recent-clear"
              >
                Clear
              </button>
            </div>
          )}
          {/* Rows scroll inside the capped panel — the "Recent" header and
              Clear stay pinned, matching the suggestions dropdown. */}
          <div className={cn("pb-1.5", !sheet && "flex-1 overflow-y-auto overscroll-contain min-h-0")}>
            {recent.map((item, i) => {
              // Row shapes share the hover container + remove button: a person you
              // opened (avatar → re-open), a person's tab you searched (avatar → re-run
              // scoped) or a text query (clock → re-run).
              const handle = item.type === "profile" && item.nip05 ? item.nip05.replace(/^_@/, "") : null;
              const removeLabel = item.type === "profile"
                ? `Remove ${item.label} from recent`
                : item.type === "scoped"
                  ? `Remove ${item.label}'s ${tabLabel(item.tab).toLowerCase()} from recent`
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
                      onMouseDown={keepFocus}
                      onClick={() => goToProfile({ pubkey: item.pubkey, npub: item.npub, name: item.label, picture: item.picture, nip05: item.nip05 } as SearchResult)}
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
                  ) : item.type === "scoped" ? (
                    // "vinney's media": the person's face, the tab, the words — re-run as the scoped search.
                    <button
                      type="button"
                      className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none"
                      onMouseDown={keepFocus}
                      onClick={() => leave(scopedSearchHref(item.pubkey, item.tab, item.words))}
                      data-testid={`home-recent-scoped-${i}`}
                    >
                      <Avatar className="h-7 w-7 border border-slate-200/80 dark:border-slate-800/80 shrink-0">
                        {item.picture ? <AvatarImage src={item.picture} alt={item.label} className="object-cover" /> : null}
                        <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">{item.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate leading-tight" data-testid={`home-recent-scoped-what-${i}`}>
                          {item.words ? `${tabLabel(item.tab)} · ${item.words}` : tabLabel(item.tab)}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none"
                      onMouseDown={keepFocus}
                      onClick={() => { onChange(item.q); runSearch(item.q); }}
                      data-testid={`home-recent-run-${i}`}
                    >
                      <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{item.q}</span>
                    </button>
                  )}
                  {item.type === "profile" && (
                    <PersonContentChips
                      pubkey={item.pubkey}
                      name={item.label}
                      content={personContent.get(item.pubkey)}
                      onNavigate={() => { setFocused(false); onLeave?.(); }}
                      linkTabIndex={-1}
                      className="sm:opacity-0 sm:group-hover/recent:opacity-100 sm:group-focus-within/recent:opacity-100"
                    />
                  )}
                  <button
                    type="button"
                    aria-label={removeLabel}
                    onMouseDown={keepFocus}
                    onClick={() => setRecent(removeRecentItem(item))}
                    className={cn(
                      "inline-flex items-center justify-center h-6 w-6 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
                      // A phone has no hover to reveal it: the sheet always shows the ×.
                      !sheet && "opacity-0 group-hover/recent:opacity-100 focus:opacity-100",
                    )}
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
    </>
  );

  return (
    <div ref={containerRef} className={cn("relative", sheet && "flex min-h-0 flex-col", className)}>
      {aside ? <div className={cn("flex items-center gap-2", rowClassName)} style={rowStyle}>{form}{aside}</div> : form}
      {/* The sheet's row stays put; its list scrolls under it. */}
      {sheet ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">{panels}</div> : panels}
    </div>
  );
}
