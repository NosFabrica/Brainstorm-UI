/**
 * The results half of the search page — Google anatomy: vertical tabs under
 * the header, a left-aligned column of typed result cards, count line at
 * EOSE. Owns the stream lifecycle: any change to query/tab/POV cancels the
 * in-flight stream and starts a fresh one (a cancelled handle never calls
 * back, so stale results structurally cannot flash).
 */
import { FEATURES } from "@/config/featureFlags";
import { useCompromisedAmong } from "@/hooks/useCompromised";
import { useListKinds } from "@/hooks/useListKinds";
import { useTabCounts } from "@/hooks/useTabCounts";
import { offersTab, type TabEvidence } from "@/lib/tabCounts";
import { useHandlePointers } from "@/hooks/useHandlePointers";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { HelpCircle, Radar, SlidersHorizontal } from "lucide-react";
import {
  activeFilterCount,
  applyFilters,
  browseSafeQuery,
  liftQuery,
  queryWords,
  readFilters,
  scopeOf,
  scopedSearchHref,
} from "@/lib/searchSyntax";
import { clientFilterHits, countBelowLine } from "@/lib/clientFilters";
import { useNetworkReach } from "@/hooks/useNetworkReach";
import { EmptyState } from "@/components/ui/empty-state";
import { QuietTrustChrome } from "@/components/score/VerificationCoin";
import { QueryAsSent } from "@/components/search/QueryAsSent";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useNoteRefs } from "@/hooks/useNoteRefs";
import type { MinimalEvent } from "@/lib/noteRefs";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import {
  isKindlessTab,
  searchStream,
  type SearchHit,
  type SearchPov,
  type SearchSnapshot,
  type SearchTab,
  type SearchHandle,
  tabLabel,
} from "@/services/search";
import { MoreResults } from "./MoreResults";
import { FiltersPanel } from "./FiltersPanel";
import { MediaFacetRow, TabFacetRows } from "./TabFacetRows";
import { TabResultCard, isPersonCard, type CardProfile, type TabCardContext } from "./TabResultCard";
import { CALENDAR_KIND, LIVE_KINDS, NOTE_KINDS, isGitItemTab, isGitTab, isThingTab } from "./tabKinds";
import { displayRows, tabHits, type DisplayRow } from "./pipelines";
import { appCategoryFacets as appCategoryFacetsOf, appPlatformFacets } from "./pipelines/apps";
import {
  articleFacets as articleFacetsOf,
  recipeFacets as recipeFacetsOf,
  type ArticleType,
} from "./pipelines/articles";
import { eventDayHeaders as eventDayHeadersOf, type DayHeader } from "./pipelines/events";
import { gitItemState, gitLabelFacets, gitStateFacets } from "./pipelines/git";
import { liveCounts as countLive, liveProofUrls, liveShelfOf, liveStatesOf, provenBy } from "./pipelines/live";
import { mediaKindFacets } from "./pipelines/media";
import { eventsBySeller, foldShop, priceSortOf, shopFacets as shopFacetsOf } from "./pipelines/shop";
import { MoreCategories, MoreTabs } from "./SearchTabMenus";
import {
  ALL_MORE_GROUPS,
  CATEGORIES_IN_ROW,
  COUNTED_TABS,
  PRIMARY_TABS,
  TAG_TAB,
  categoryTabClass,
  tabClass,
  tagTabKeyOf,
} from "./searchTabs";
import { urlList, urlTagged, useSearchUrlState, writeListToUrl, writeTaggedToUrl } from "@/hooks/useSearchUrlState";
import { TagFacets } from "./TagFacets";
import { SorryPage } from "@/components/sorry/SorryPage";
import { retryNow, useServerStatus } from "@/lib/serverStatus";

import { fetchGitCommentCounts, fetchGitStatuses, fetchGoalProgress, type GoalProgress } from "@/services/search";
import { useEventRsvps } from "@/hooks/useEventRsvps";
import { isGitItem, type GitState } from "@/lib/gitStatus";
import { MediaCard, mediaUrlOf } from "@/components/search/cards";
import { AllResults } from "@/components/search/AllResults";
import { useListRibbon } from "@/hooks/useListRibbon";
import {
  categoryTestId,
  groupCategories,
  isKindKey,
  NOTES_KEY,
  pagedWords,
  PEOPLE_KEY,
  type Category,
} from "@/lib/allCategories";
import { knownCategory, useAllCategories } from "@/hooks/useAllCategories";
import { useResultTags } from "@/hooks/useResultTags";
import { useNamedTags } from "@/hooks/useNamedTags";
import { useTagMembers } from "@/hooks/useTagMembers";
import { useListTags } from "@/hooks/useListTags";
import { carriersOf } from "@/lib/resultTags";
import { TagTabResults } from "@/components/search/TagTabResults";
import { edgeFade, useScrollEdges } from "@/hooks/useScrollEdges";
import { followHeadStart } from "@/lib/headStart";
import { liveHostOf, type LiveState } from "@/lib/liveStream";
import { useVerifiedRecordings } from "@/hooks/useVerifiedRecordings";
import { eventWhenCounts, type EventWhen } from "@/lib/eventFilters";
import { cardGroupOf } from "@/lib/listingVariants";
import { priceBands, viewerCurrency, type PriceBand } from "@/lib/exchangeRate";
import { useBtcRates } from "@/hooks/useBtcRates";
import { usePersonContent } from "@/hooks/usePersonContent";
import { PersonContentChips } from "@/components/search/PersonContentChips";
import { useWavlakeSearch } from "@/hooks/useWavlakeSongs";
import { useArtistCatalogue } from "@/hooks/useArtistCatalogue";
import { usePodcastIndexMusic } from "@/hooks/usePodcastIndexMusic";
import { useTaggedMusicians } from "@/hooks/useTaggedMusicians";
import { useSearchTags } from "@/hooks/useSearchTags";
import { leadingCarriers, rankCarriers } from "@/lib/tagCarrierPeople";
import { leadingTags } from "@/lib/tagMatch";
import { usePersonFountain } from "@/hooks/usePersonFountain";
import { filterPodcastIndex, filterTaggedPeople } from "@/lib/dlists";
import { MusicResults } from "@/components/search/MusicResults";
import { type MediaKind } from "@/lib/mediaKind";
import { mediaFacetOf, mediaNarrowingOf, withMediaFacet, type MediaFacet } from "@/lib/mediaFacet";
import { KnowledgePanel, type PanelSections } from "@/components/search/KnowledgePanel";
import { SearchPriorityContext, useSearchPriorityState } from "@/hooks/useSearchPriority";
import { ComposedResults } from "@/components/search/ComposedResults";
import { SearchSyntaxSheet, useSyntaxSheetShortcut } from "@/components/search/SearchSyntaxSheet";
import { useRecentByKinds } from "@/hooks/useRecentByKinds";
import { recallComposed, recallSearch, rememberComposed, rememberKey, rememberSearch } from "@/lib/searchMemory";

/** What a named person's own lead is asked by: their notes, pictures and videos; on Music, their tracks. */
const LEAD_MEDIA_KINDS = [1, 20, 21, 22, 34235, 34236];
const LEAD_MUSIC_KINDS = [31337];

/** ShareNoteCard's profile map, built from the hits' hydrated authors. */
const NO_NOTES: MinimalEvent[] = [];
const NO_HITS: SearchHit[] = [];

function profilesOf(hits: SearchHit[]) {
  const map = new Map<string, CardProfile>();
  for (const hit of hits) {
    if (hit.author && !map.has(hit.author.pubkey)) {
      map.set(hit.author.pubkey, {
        name: hit.author.name,
        display_name: hit.author.displayName,
        picture: hit.author.picture,
        nip05: hit.author.nip05,
      });
    }
  }
  return map;
}

const sameProfile = (a: CardProfile, b: CardProfile) =>
  a.name === b.name && a.display_name === b.display_name && a.picture === b.picture && a.nip05 === b.nip05;

/**
 * The profile map rebuilt per snapshot, holding on to what did not change: each
 * entry the object it was last time when it says the same, and the whole map the
 * last one when nothing differs. The cards are memoised, and a fresh map per
 * arriving hit re-rendered every note card on the page.
 */
function keepSameProfiles(prev: Map<string, CardProfile> | null, next: Map<string, CardProfile>) {
  if (!prev) return next;
  let same = prev.size === next.size;
  for (const [pk, p] of next) {
    const was = prev.get(pk);
    if (was && sameProfile(was, p)) next.set(pk, was);
    else same = false;
  }
  return same ? prev : next;
}

/** A goal a complete answer found no receipt for: one object, so a memoised card sees no change. */
const NO_RAISED: GoalProgress = { sats: 0, zappers: [] };

export const SearchResults = memo(function SearchResults({
  query,
  pov,
  userPubkey,
  onOpenProfile,
  onPrefetchEnter,
  onPrefetchLeave,
  onQueryRewrite,
  onTabChange,
  peopleSeed,
  perspective,
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  /** The page's Brainstorm / My perspective control, seated in the tab row
   *  beside Filters once results show (one row of chrome, not three). */
  perspective?: React.ReactNode;
  /** People-card click. Default: the public profile page. */
  onOpenProfile?: (result: SearchResult) => void;
  onPrefetchEnter?: (result: SearchResult) => void;
  onPrefetchLeave?: (result: SearchResult) => void;
  /** The Filters panel rewrites the query THROUGH the caller so the new
   *  tokens land visibly in the search box and resubmit. */
  onQueryRewrite?: (next: string) => void;
  /** Which tab is showing — the box words its placeholder by it. */
  onTabChange?: (tab: SearchTab) => void;
  /** The people the typeahead already found for this query, for the People
   *  section to start from rather than ask for again. */
  peopleSeed?: SearchHit[];
}) {
  const [, setLocation] = useLocation();
  const { tab, kindTab, changeTab, openKind } = useSearchUrlState(query);
  const kinds = useListKinds();
  const activeKind = kinds.find((k) => k.key === kindTab) ?? null;
  useEffect(() => {
    onTabChange?.(tab);
  }, [tab, onTabChange]);
  // Videos or Classic Vines, when the query carries one: the chips that change the request.
  const mediaFacet = useMemo<MediaFacet | null>(() => (tab === "media" ? mediaFacetOf(query) : null), [tab, query]);
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);
  // Whether the relay behind every search is answering (lib/serverStatus).
  const serverStatus = useServerStatus();
  // The tab's live stream, so the end of the page can ask it for more.
  const streamRef = useRef<SearchHandle | null>(null);
  const firstRun = useRef(true);
  // Result rows skip offscreen layout (TabResultCard's OFFSCREEN_ROW) except while a remembered scroll is restored.
  const [rowsWhole, setRowsWhole] = useState(false);
  // Media on Nostr is mostly a NOTE with a file attached (Rabbit Hole Recap:
  // 254 notes, no media-kind events, a video in most of them). The Media tab
  // asks for notes too and keeps the ones that carry something to look at.
  const [mediaNotes, setMediaNotes] = useState<SearchSnapshot | null>(null);
  // When the query IS a person, the Media tab leads with what they published
  // — their episode posts don't repeat their own name in the text.
  const [panelPerson, setPanelPerson] = useState<SearchResult | null>(null);
  // Set from the first render, never undefined: given undefined the panel would
  // ask the relay itself once, before the sections had a chance to answer.
  const [sections, setSections] = useState<PanelSections>({ people: null, events: null });
  // The composed page reports its People and Happening sections after each of its renders; the
  // same two snapshots again are no news, and are not a second render of this whole page.
  const takeSections = useCallback(
    (next: PanelSections) =>
      setSections((prev) => (prev.people === next.people && prev.events === next.events ? prev : next)),
    [],
  );
  // The Media tab and the composed Top page both lead with it; the
  // Music tab leads with the person's own tracks the same way.
  const leadsTop = tab === "top" && !/(^|\s)sort:/i.test(query);
  const leadsMusic = tab === "music" && !scopeOf(query);
  // On the Media tab the lead is held to what the tab is narrowed to (`kind:`, `kind:video`,
  // Classic Vines): a page asked for as videos does not lead with the person's pictures. Only
  // the kinds that can pass are asked for, and a narrowing none of them fits asks nothing.
  const leadNarrowing = useMemo(() => (tab === "media" ? mediaNarrowingOf(query) : null), [tab, query]);
  const leadKinds = useMemo(
    () =>
      leadsMusic
        ? LEAD_MUSIC_KINDS
        : leadNarrowing
          ? LEAD_MEDIA_KINDS.filter((kind) => leadNarrowing.kinds.includes(kind))
          : LEAD_MEDIA_KINDS,
    [leadsMusic, leadNarrowing],
  );
  const leadWho =
    (tab === "media" || leadsTop || leadsMusic) && panelPerson && leadKinds.length > 0 ? panelPerson : null;
  const leadEvents = useRecentByKinds(leadWho?.pubkey, leadKinds, 40).events;
  const personMedia = useMemo<SearchHit[]>(
    () =>
      leadWho
        ? leadEvents
            .filter((e) => leadsMusic || mediaUrlOf(e as NostrEvent) !== null)
            .filter((e) => !leadNarrowing || leadNarrowing.has(e as NostrEvent))
            .map((e) => ({ event: e as NostrEvent, author: leadWho, rank: null }))
        : [],
    [leadEvents, leadWho, leadsMusic, leadNarrowing],
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [syntaxOpen, setSyntaxOpen] = useState(false);
  useSyntaxSheetShortcut(useCallback(() => setSyntaxOpen(true), []));

  // Top composes its own purpose-ranked section streams — unless the
  // user typed a sort:, which is them choosing ONE order for one list.
  // All never composes: one kind-less list, as the relay sends it.
  // A price sort is the page's own order, not the relay's: it leaves the
  // query before the relay sees it, and the cards are sorted below.
  const priceSort = tab === "shop" ? priceSortOf(query) : null;
  const relayQuery = priceSort ? applyFilters(query, { sort: null }) : query;
  const userSorted = /(^|\s)sort:/i.test(relayQuery);
  const composed = tab === "top" && !userSorted;
  // The Top page's own results first: the previews' row-ordering lookups wait for the people to
  // answer (hooks/useSearchPriority), so they never queue in front of them at the relay.
  const searchPriority = useSearchPriorityState(composed && !activeKind, sections.people, query);
  // How many results each tab holds for the words (hooks/useTabCounts), asked once the page's own
  // results have answered so the counts never queue in front of them: a tab known to hold nothing
  // leaves the row and the More menu (lib/tabCounts), and More's groups lead with what has most.
  // A vertical's page has answered when ITS snapshot has, not the one the last words or tab left
  // on screen (hooks/useSearchPriority tells them apart). A sort changes the order, not the count,
  // except `sort:text`, which drops the trust floor: that one rides along (services/search's
  // countTabs asks newest-first otherwise).
  const pageAnswered = useSearchPriorityState(!composed, snapshot, `${pov}|${userPubkey ?? ""}|${tab}|${query}`);
  const countQuery = useMemo(
    () => applyFilters(query, { sort: readFilters(query).sort === "text" ? "text" : null }),
    [query],
  );
  const tabCounts = useTabCounts(countQuery, COUNTED_TABS, {
    pov,
    userPubkey,
    ready: composed ? searchPriority : pageAnswered,
  });
  const scoped = !!scopeOf(query);
  // While focus or the pointer is in the tab strip, it holds the tabs it had: a settled row that
  // removed the focused tab would drop focus to the page, and one that moved under the pointer
  // would turn a click into the wrong tab. It settles when both have left. New words arriving
  // meanwhile hold the full row, since what the strip had was the last words' answer.
  const [rowHold, setRowHold] = useState<{
    pointer: boolean;
    focus: boolean;
    evidence: TabEvidence;
    query: string;
  } | null>(null);
  const liveEvidence = useMemo<TabEvidence>(() => ({ ...tabCounts, scoped }), [tabCounts, scoped]);
  const holdRow = (part: "pointer" | "focus", on: boolean) =>
    setRowHold((h) => {
      const next = { pointer: h?.pointer ?? false, focus: h?.focus ?? false, [part]: on };
      if (!next.pointer && !next.focus) return null;
      return h ? { ...h, ...next } : { ...next, evidence: liveEvidence, query: countQuery };
    });
  const tabEvidence = useMemo<TabEvidence>(
    () => (!rowHold ? liveEvidence : rowHold.query === countQuery ? rowHold.evidence : { counts: {}, scoped }),
    [rowHold, liveEvidence, countQuery, scoped],
  );
  const offers = useCallback(
    (key: SearchTab) => offersTab(key, !activeKind && tab === key, tabEvidence),
    [activeKind, tab, tabEvidence],
  );
  // Content tabs land on what's fresh by default; People keeps trust rank,
  // and a typed sort: is always honored verbatim.
  // A browse (no words) asking for a sort the relay cannot run over the whole
  // index falls back to newest — the relay never answers it, and a hung
  // request stalls everything else on the connection (RELAY-ASKS #12).
  const safeQuery = browseSafeQuery(relayQuery);
  // Articles are evergreen: with words typed, relevance leads. Recent-first
  // put the page named "List of comedians" 26th under a month of news; best
  // match had it first, the other comedian lists behind it (relay probe,
  // 2026-09-07). A wordless browse still asks newest — there is nothing to match.
  // Recipes and specs are articles by kind and by nature — evergreen too.
  // All asks best match too, as the relay's own page does — with words: a
  // wordless browse or a person scope has nothing to match, so it is newest.
  const byRelevance =
    (tab === "articles" || tab === "recipes" || tab === "nips" || tab === "all") && !!queryWords(query);
  // The kinds the box asked for (`kind:30078`) — a spec card leads with them.
  const searchedKinds = useMemo(() => (liftQuery(query).kinds ?? []).map(String), [query]);
  const effectiveQuery =
    !userSorted && tab !== "top" && tab !== "people" && !byRelevance ? `${safeQuery} sort:recent`.trim() : safeQuery;

  // On All, the tab row holds All's categories (hooks/useAllCategories, below): a kind, or a
  // Dictionary list. One pressed is a search of its own — All's, asked of that category alone, a
  // page at a time — for the words it was pressed on. The link holds it (`list`: a coordinate, or
  // `kind:Video`); a new search leaves it out (pages/landing), so words that change take the
  // link's word again: none after a search, the category on Back.
  const onAll = tab === "all" && !activeKind;
  const [categoryPressed, setCategoryPressed] = useState<{ query: string; key: string } | null>(() => {
    const key = urlList();
    return key ? { query: effectiveQuery, key } : null;
  });
  useEffect(() => {
    setCategoryPressed((pressed) => {
      if (pressed?.query === effectiveQuery) return pressed;
      const key = urlList();
      return key ? { query: effectiveQuery, key } : null;
    });
  }, [effectiveQuery]);
  const pressCategory = useCallback(
    (key: string | null) => {
      setCategoryPressed(key ? { query: effectiveQuery, key } : null);
      writeListToUrl(key);
    },
    [effectiveQuery],
  );
  // The pressed category once it is known (set below, where the categories are): what the stream asks.
  const [openCategory, setOpenCategory] = useState<{ query: string; category: Category } | null>(() => {
    const known = categoryPressed && knownCategory(effectiveQuery, categoryPressed.key, { pov, userPubkey });
    return known ? { query: effectiveQuery, category: known } : null;
  });
  const category = onAll && openCategory?.query === effectiveQuery ? openCategory.category : null;
  // A pressed tag narrows All to what carries it: the search asked again of the tag's Trusted Lists'
  // members (hooks/useTagMembers), shown with the loaded rows it was pressed on that carry it, so
  // none of those goes. The link holds it (`tagged`), for the words it was pressed on, as it holds
  // a category; a category pressed keeps it.
  const [tagPressed, setTagPressed] = useState<{
    query: string;
    key: string;
    name?: string;
    carriers?: SearchHit[];
  } | null>(() => {
    const key = urlTagged();
    return key ? { query: effectiveQuery, key } : null;
  });
  useEffect(() => {
    setTagPressed((pressed) => {
      if (pressed?.query === effectiveQuery) return pressed;
      const key = urlTagged();
      return key ? { query: effectiveQuery, key } : null;
    });
  }, [effectiveQuery]);
  const pressTag = useCallback(
    (tag: { key: string; name: string; carriers: SearchHit[] } | null) => {
      setTagPressed(tag ? { query: effectiveQuery, ...tag } : null);
      writeTaggedToUrl(tag?.key ?? null);
    },
    [effectiveQuery],
  );
  // A Dictionary list's tab, open. Its tag filters come from the house's lists of its items — every
  // item, whichever are loaded — so they show in production too; All's own filters, found among the
  // rows loaded so far, and tags' tabs are staging's alone (FEATURES.searchTagFilters).
  const onListTab =
    onAll &&
    categoryPressed?.query === effectiveQuery &&
    !isKindKey(categoryPressed.key) &&
    !categoryPressed.key.startsWith(TAG_TAB);
  const tagFilter =
    (FEATURES.searchTagFilters || onListTab) && onAll && tagPressed?.query === effectiveQuery ? tagPressed.key : null;
  // A tag the link names comes without its name: its slug's words find its lists as well.
  const tagMembers = useTagMembers(
    tagFilter
      ? { key: tagFilter, name: tagPressed?.name ?? tagFilter.slice(tagFilter.indexOf("|") + 1).replace(/-/g, " ") }
      : null,
    { pov, userPubkey },
  );
  const narrowTo = tagMembers.members;
  const narrowKey = tagFilter && narrowTo ? tagFilter : null;
  const tagCarriers = tagFilter ? tagPressed?.carriers : undefined;
  // Which tag the stream's rows were asked for, set beside them: until the narrowed answer is in,
  // the rows on hand are All's, which the tag thins.
  const [streamTag, setStreamTag] = useState<string | null>(null);

  // Where the reader was when this search left the page. Read in a layout
  // cleanup: on a navigation the app scrolls to the top in its own layout
  // effect, and a passive cleanup would read zero.
  const scrollAtLeave = useRef(0);
  useLayoutEffect(() => {
    return () => {
      scrollAtLeave.current = typeof window !== "undefined" ? window.scrollY : 0;
    };
  }, [effectiveQuery, tab, pov, userPubkey, composed, serverStatus.recovery]);

  // What the composed page was showing when the reader last left it, so coming
  // back from a result paints at once instead of restarting every section.
  const composedKey = rememberKey(query, "top", pov, userPubkey);
  const composedMemory = useRef(composed ? recallComposed(composedKey) : null);
  // Coming back beats the typeahead: memory holds every section, the typeahead
  // only the people it had already found.
  // One object per seed, so the memoised composed page does not re-render with every keystroke's render here.
  const recalledSections = composedMemory.current?.sections;
  const composedSeeds = useMemo(
    () => recalledSections ?? (peopleSeed?.length ? { people: peopleSeed } : undefined),
    [recalledSections, peopleSeed],
  );
  // Memory is an answer this page already had; the typeahead is a guess.
  const peopleSeedIsGuess = !composedMemory.current && !!peopleSeed?.length;
  const rememberSections = useCallback(
    (hits: Record<string, SearchHit[]>) => rememberComposed(composedKey, hits, scrollAtLeave.current),
    [composedKey],
  );

  useEffect(() => {
    if (!composed) return;
    const where = composedMemory.current?.scrollY ?? 0;
    if (where <= 0) return;
    // After paint, and after the app's own scroll-to-top on navigation.
    const at =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => window.scrollTo({ top: where, behavior: "instant" as ScrollBehavior }))
        : setTimeout(() => window.scrollTo({ top: where, behavior: "instant" as ScrollBehavior }), 0);
    return () => {
      if (typeof at === "number" && typeof cancelAnimationFrame === "function") cancelAnimationFrame(at);
    };
    // Once per mount of a composed page: the recall is read from a ref.
  }, [composed, composedKey]);

  useEffect(() => {
    if (composed) {
      setSnapshot(null);
      return;
    }
    // Client-side filters (Verified only, reach) thin the page after the
    // fact — ask the relay for a deeper one so there is something left.
    const clientFiltered = readFilters(effectiveQuery);
    // Events too: the relay only knows created_at, so the When facet works
    // over a deep recent page (probed: no start-tag filter or sort).
    const limit = clientFiltered.verifiedOnly || clientFiltered.reach || tab === "events" ? 300 : undefined;
    // A search this tab ran before comes back with the pages it had, before
    // the relay answers — and, when the page itself is coming back (a reader
    // returning from a result), to where they were in it.
    // A category of All's remembers its own pages.
    const key = rememberKey(
      [effectiveQuery, category?.key, narrowKey].filter(Boolean).join("\n"),
      tab,
      pov,
      userPubkey,
    );
    const remembered = recallSearch(key);
    const restoreScroll = firstRun.current && remembered ? remembered.scrollY : null;
    firstRun.current = false;
    let latest: SearchSnapshot | null = remembered
      ? { hits: remembered.hits, eose: false, timeMs: null, error: null }
      : null;
    setSnapshot(latest);
    setStreamTag(narrowKey);
    // All's question was asked while the bundle loaded (index.html, lib/headStart): its
    // first page follows that request rather than asking again — for the house's
    // Perspective, at the default depth, on a first visit to this search only.
    const firstPage =
      tab === "all" &&
      !category &&
      !narrowKey &&
      !remembered &&
      !userPubkey &&
      pov === "nosfabrica" &&
      limit === undefined
        ? (followHeadStart(effectiveQuery) ?? undefined)
        : undefined;
    const handle = searchStream(
      // A list the words name asks for its items whatever their words.
      category?.whole ? "" : effectiveQuery,
      {
        // A category of All's asks its kinds alone, or as its tab asks it (Events, Recipes).
        tab: category?.tab ?? tab,
        pov,
        userPubkey,
        limit,
        seed: remembered?.hits,
        firstPage,
        ...(category && !category.tab ? { kinds: category.kinds, tags: category.tags } : {}),
        ...(narrowKey && narrowTo ? { members: narrowTo } : {}),
      },
      (snap) => {
        latest = snap;
        setSnapshot(snap);
      },
    );
    streamRef.current = handle;
    // What is waiting for a frame, as its own cancel: a rAF id is not a timer id.
    let pending: (() => void) | null = null;
    const nextFrame = (run: () => void): (() => void) => {
      if (typeof requestAnimationFrame === "function") {
        const id = requestAnimationFrame(run);
        return () => cancelAnimationFrame(id);
      }
      const id = setTimeout(run, 0);
      return () => clearTimeout(id);
    };
    if (restoreScroll != null && restoreScroll > 0) {
      // The rows are laid out whole while the reader is put back: offscreen ones would
      // otherwise stand at an estimated height, and the remembered position would land on
      // another row. A frame after, their real heights are recorded and they may skip again.
      setRowsWhole(true);
      // After paint — and after the app's own scroll-to-top on navigation.
      pending = nextFrame(() => {
        window.scrollTo({ top: restoreScroll, behavior: "instant" as ScrollBehavior });
        pending = nextFrame(() => setRowsWhole(false));
      });
    }
    return () => {
      if (latest && latest.hits.length) rememberSearch(key, latest.hits, scrollAtLeave.current);
      pending?.();
      setRowsWhole(false);
      if (streamRef.current === handle) streamRef.current = null;
      handle();
      // Followed, the stream closed it; cancelled before its first page, nobody did.
      firstPage?.release();
    };
    // `category` by its key: the same category found again asks nothing new; a tag likewise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveQuery, tab, pov, userPubkey, composed, serverStatus.recovery, category?.key, narrowKey]);

  useEffect(() => {
    setMediaNotes(null);
    // Videos and Classic Vines ask for video events alone; a note with a clip is not one.
    if (composed || tab !== "media" || mediaFacet) return;
    return searchStream(effectiveQuery, { tab: "notes", pov, userPubkey, limit: 60 }, setMediaNotes);
  }, [effectiveQuery, tab, pov, userPubkey, composed, mediaFacet]);

  const openProfile = useCallback(
    (result: SearchResult) => {
      if (onOpenProfile) onOpenProfile(result);
      else setLocation(`/p/${result.npub}`);
    },
    [onOpenProfile, setLocation],
  );

  // Words that name a tag find the people on it (the team, 2026-09-29): they
  // lead the People tab wearing the tag; the relay's name matches follow. The
  // tag and its people come from the search relay in one ask — a page opened
  // from a link has them too, without walking the hub's catalogue.
  const { tags: tagMatches, carriers } = useSearchTags(tab === "people" && !scopeOf(query) ? query : "", {
    pov,
    viewerPubkey: userPubkey,
    members: true,
  });
  // Only a tag the words name outright, with weight behind it, leads (lib/tagMatch).
  const leadPeople = useMemo(
    () => leadingCarriers(carriers.people, carriers.byPubkey, leadingTags(tagMatches, query)),
    [carriers.people, carriers.byPubkey, tagMatches, query],
  );
  const carrierSets = useMemo(() => {
    const sets = new Map<string, Set<string>>();
    for (const [pubkey, tags] of carriers.byPubkey) {
      for (const t of tags) {
        const set = sets.get(t.key) ?? new Set<string>();
        set.add(pubkey);
        sets.set(t.key, set);
      }
    }
    return sets;
  }, [carriers.byPubkey]);
  // Keep a ref so the render below sees a stable list even mid-stream. On the
  // Media tab the notes that carry media join the media-kind hits.
  // The Shop as products: one card per product (pipelines/shop).
  const shopFold = useMemo(() => (tab !== "shop" ? null : foldShop(snapshot?.hits ?? [])), [tab, snapshot]);
  // Each seller's events on the page, built once per snapshot: filtering every
  // hit per card was quadratic, and a fresh array per render defeated the card's memo.
  const hitsBySeller = useMemo(
    () => (tab !== "shop" ? new Map<string, NostrEvent[]>() : eventsBySeller(snapshot?.hits ?? [])),
    [tab, snapshot],
  );
  // One card group object per product per snapshot, so the card's memo holds.
  const shopCardGroups = useMemo(() => {
    const out = new Map<string, ReturnType<typeof cardGroupOf>>();
    for (const [id, group] of shopFold?.groups ?? []) out.set(id, cardGroupOf(group));
    return out;
  }, [shopFold]);
  const shopGroupOf = (id: string) => shopCardGroups.get(id);
  // Who the search is about when their own profile lacks the words: the accounts the matched
  // profiles' handles belong to (hooks/useHandlePointers), asked of every People hit before the floor.
  const pointers = useHandlePointers(tab === "people" ? (snapshot?.hits ?? []) : []);
  // What of the relay's answer the tab keeps (pipelines tabHits): the Shop's products, the people on a
  // matched tag, the Media tab's notes with something to look at…
  const rawHits = useMemo(
    () =>
      tabHits(snapshot?.hits ?? [], {
        tab,
        keptCarriers: streamTag && streamTag === tagFilter && tagCarriers?.length ? tagCarriers : null,
        shopHits: shopFold?.hits ?? null,
        pointed: pointers.hits,
        leadPeople,
        personMedia,
        mediaNotes: mediaNotes?.hits ?? null,
      }),
    [snapshot, mediaNotes, tab, personMedia, leadPeople, shopFold, pointers.hits, streamTag, tagFilter, tagCarriers],
  );
  // The person's own media is its own group above the list; the list drops its duplicates.
  const personMediaIds = useMemo(() => new Set(personMedia.map((h) => h.event.id)), [personMedia]);
  // The relay only ORDERS by rank — per-card scores come from the shared
  // author-score cache (hashtag-page discipline) for EVERY hit, kind-0
  // included: without this, people cards render bare and the user's
  // verification-display settings have nothing to show.
  // Streams are published by platforms for their streamers: the host's key
  // joins the score request so the channel row can wear the streamer's ring.
  const allAuthors = useMemo(
    () => [
      ...new Set(
        rawHits.flatMap((h) =>
          LIVE_KINDS.has(h.event.kind) ? [h.event.pubkey, liveHostOf(h.event) ?? h.event.pubkey] : [h.event.pubkey],
        ),
      ),
    ],
    [rawHits],
  );
  const liveScoreOf = useAuthorScores(allAuthors);
  const scoreOfRef = useRef(liveScoreOf);
  scoreOfRef.current = liveScoreOf;
  // The scores as one key: what the filters below re-run on, and what a new `scoreOf` means.
  // The hook hands out a new function per render; the memoised lists given it (All, Music,
  // a tag's tab) would re-render with every keystroke and every snapshot for nothing.
  const scoresKey = allAuthors.map((pk) => liveScoreOf(pk)).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scoreOf = useCallback((pk: string) => scoreOfRef.current(pk), [scoresKey]);
  // Their order, taken once when they land and held for the query — a late
  // score must not reorder a list the reader is already scanning.
  const carrierRank = useMemo(
    () => (carriers.settled ? rankCarriers(leadPeople, scoreOfRef.current) : new Map<string, number>()),

    [carriers.settled, leadPeople],
  );
  // The filters the relay can't do, done here (probed: filter:rank ignored,
  // no hops): Verified only via those scores, reach via the viewer's graph.
  const clientState = readFilters(safeQuery);
  // The viewer's contact list — only when the reach filter asks for it.
  const reach = useNetworkReach(clientState.reach ? userPubkey : null);
  // The search floor: accounts below the verified line stay off the page
  // unless the searcher asks for everyone (Include spam) or is looking through
  // their own perspective — their lens, their view. Probed 2026-09-05: the
  // relay's house lens let two aéPiot accounts (scores 0 and 0.0198) fill 38
  // of the 40 newest "Ainsley Costello" notes.
  const floor = !clientState.includeSpam && pov !== "mywot";
  // The box no longer shows filter tokens — the Filters button says how many are on.
  const activeFilters = activeFilterCount(clientState);
  const hits = useMemo(
    () =>
      clientFilterHits(
        rawHits,
        { verifiedOnly: clientState.verifiedOnly, reach: clientState.reach, belowLine: floor },
        { scoreOf, reach },
      ),
    [rawHits, clientState.verifiedOnly, clientState.reach, floor, reach, scoreOf],
  );
  // All's own rows, while it shows them: on a category's page the rows are that category's.
  const allRows = onAll && !category ? hits : NO_HITS;
  // The Dictionary's lists the words find items on, and those with items among All's rows;
  // then every category, counted for the row.
  const ribbon = useListRibbon(effectiveQuery, { pov, userPubkey, enabled: onAll, page: allRows });
  const categories = useAllCategories(effectiveQuery, {
    pov,
    userPubkey,
    enabled: onAll,
    page: allRows,
    lists: ribbon.lists,
    ready: ribbon.settled && (!!snapshot?.eose || !!snapshot?.error),
  });
  // The tags the loaded results carry, offered as filters (hooks/useResultTags). A pressed one
  // narrows the search itself where the tag has lists (above); until they answer, or where it has
  // none, it keeps the loaded rows carrying it.
  const resultTags = useResultTags(hits, {
    observer: pov === "mywot" && userPubkey ? userPubkey : "house",
    enabled: onAll && FEATURES.searchTagFilters,
  });
  const categoryAsked = onAll && categoryPressed?.query === effectiveQuery ? categoryPressed.key : null;
  const pressedCategory = categoryAsked ? (categories.known.get(categoryAsked) ?? null) : null;
  // The tags kept on the Dictionary lists in view — the one a page is open on, or those the words
  // name on All — offered whatever page of their items is loaded (hooks/useListTags): a list of
  // hundreds has its tagged items past the first page.
  const listsInView = useMemo(
    () =>
      pressedCategory
        ? isKindKey(pressedCategory.key)
          ? []
          : [{ coordinate: pressedCategory.key, name: pressedCategory.name }]
        : FEATURES.searchTagFilters
          ? ribbon.lists.filter((l) => l.whole).map((l) => ({ coordinate: l.coordinate, name: l.name }))
          : [],
    [pressedCategory, ribbon.lists],
  );
  const listTags = useListTags(listsInView, { pov, userPubkey, enabled: onAll });
  // Where All's own filters are off, a list's tab offers its lists' tags alone: complete, never a
  // filter over what happens to be loaded.
  const facetTags = useMemo(() => {
    if (!FEATURES.searchTagFilters) return listTags.tags;
    const kept = new Set(listTags.tags.map((t) => t.key));
    return [...listTags.tags, ...resultTags.tags.filter((t) => !kept.has(t.key))];
  }, [listTags.tags, resultTags.tags]);
  useEffect(() => {
    setOpenCategory((open) =>
      !pressedCategory
        ? null
        : open?.query === effectiveQuery && open.category.key === pressedCategory.key
          ? open
          : { query: effectiveQuery, category: pressedCategory },
    );
  }, [pressedCategory, effectiveQuery]);
  // The tab strip fades at an edge it scrolls past.
  const [tabStripRef, tabStripEdges] = useScrollEdges();
  // The row: the first few, the rest behind More — and the pressed one, counted or not yet.
  // The tags the words name outright, each a tab of its own holding everything that carries it
  // (services/namedTags): after Notes and People, before the lists. The row waits for them too,
  // so it still lands whole. The link holds a pressed one as it holds a category (`list`).
  const namedTags = useNamedTags(scopeOf(query) ? "" : query, {
    pov,
    userPubkey,
    enabled: onAll && FEATURES.searchTagFilters,
  });
  const tagTabKey = FEATURES.searchTagFilters && categoryAsked?.startsWith(TAG_TAB) ? categoryAsked : null;
  const tagTab = tagTabKey ? (namedTags.tags.find((t) => tagTabKeyOf(t) === tagTabKey) ?? null) : null;
  const rowLoading = categories.loading || !namedTags.settled;
  const rowCategories = useMemo(() => {
    const tabs: Category[] = namedTags.tags.map((t) => ({ key: tagTabKeyOf(t), name: t.name, kinds: [] }));
    const lead = categories.shown.findIndex((c) => c.key !== NOTES_KEY && c.key !== PEOPLE_KEY);
    const at = lead < 0 ? categories.shown.length : lead;
    const found = rowLoading ? [] : [...categories.shown.slice(0, at), ...tabs, ...categories.shown.slice(at)];
    const pressed = pressedCategory ?? tabs.find((t) => t.key === tagTabKey) ?? null;
    const all = pressed && !found.some((c) => c.key === pressed.key) ? [...found, pressed] : found;
    // A list a kind's page stands for sits under that page's heading: Places is Out & about. A tag's
    // tab follows Notes and People, so it is always in the row, never behind More.
    const listGroups = new Map(kinds.map((k) => [k.community, k.group]));
    return {
      inRow: all.slice(0, CATEGORIES_IN_ROW),
      behindMore: groupCategories(all.slice(CATEGORIES_IN_ROW), ALL_MORE_GROUPS, listGroups),
    };
  }, [categories.shown, namedTags.tags, rowLoading, pressedCategory, tagTabKey, kinds]);
  // A category the link names waits to be found — in All's first page, or the lists' answer —
  // rather than showing all of All first; one that isn't found lets All show. So does a tag's.
  const categoryWaiting = tagTabKey
    ? !tagTab && !namedTags.settled
    : !!categoryAsked && !category && (!pressedCategory ? !ribbon.settled || !snapshot?.eose : true);
  const hiddenBelowLine = floor ? countBelowLine(rawHits, scoreOf) : 0;
  // What the floor held back, said once and quietly — Google's "some results
  // were removed" — with the one tap that lifts it. Rendered under the list,
  // and on an emptied page in place of a bare "Nothing found".
  const floorNotice =
    hiddenBelowLine > 0 ? (
      <p className="mt-4 px-1 text-xs text-slate-400 dark:text-slate-500" data-testid="search-floor-notice">
        {hiddenBelowLine} {hiddenBelowLine === 1 ? "result" : "results"} hidden from accounts below the verified line ·{" "}
        <button
          type="button"
          onClick={() => onQueryRewrite?.(applyFilters(query, { includeSpam: true }))}
          className="font-medium text-slate-500 transition-colors hover:text-brand-link dark:text-slate-400"
          data-testid="search-floor-show-all"
        >
          Show everyone
        </button>
      </p>
    ) : null;
  // Wavlake is the Music tab's second source: the same words, its catalogue —
  // or, when the search is scoped to one person (from:npub…, the profile's
  // "View all"), that person's own catalogue: the artist who is them and every
  // song of theirs, with no text search for the key.
  // Words typed beside the person chip narrow that catalogue by title.
  const scope = scopeOf(query);
  const scopedTo = scope?.pubkey ?? null;
  // Under a scope an empty tab is a door, not a dead end: what the person does publish.
  const scopedContent = usePersonContent(useMemo(() => (scopedTo ? [scopedTo] : []), [scopedTo]));
  const scopedName = scopedTo && panelPerson?.pubkey === scopedTo ? getDisplayLabel(panelPerson) : null;
  const wavlakeWords = useWavlakeSearch(query, tab === "music" && !scope);
  // The V4V lists from Podcast Index (the team, 2026-09-24): the Music tab's
  // third source, asked of the tag hub on the tab, never for one person's
  // catalogue — the lists are not per person. The words narrow them here.
  const podcastIndexAll = usePodcastIndexMusic(tab === "music" && !scope);
  const podcastIndex = useMemo(
    () => ({ ...filterPodcastIndex(query, podcastIndexAll), loading: podcastIndexAll.loading }),
    [query, podcastIndexAll],
  );
  // The people the network tagged Musician — the tagging list; the tab narrows them by the words.
  const tagged = useTaggedMusicians(tab === "music" && !scope);
  // Words that name a person find that person's music, as their profile does
  // (Benjamin, 2026-09-24: "handled" said Nothing found while Handled's
  // profile played two songs — the relay holds no track events for them and
  // Wavlake's word search knows no "handled"). The Media tab leads with a
  // named person's own media; the Music tab leads with their own music: the
  // catalogue the scoped view reads, joined to whatever the words found.
  const musicPerson = tab === "music" && !scope ? panelPerson : null;
  // What the person linked on Fountain — the panel plays it; so does the view.
  const fountain = usePersonFountain(tab === "music" ? (scopedTo ?? musicPerson?.pubkey ?? null) : null);
  const catalogue = useArtistCatalogue(tab === "music" ? (scopedTo ?? musicPerson?.pubkey ?? null) : null, {
    name: scopedTo ? undefined : musicPerson ? getDisplayLabel(musicPerson) : undefined,
  });
  const wavlake = useMemo(() => {
    if (!scope) {
      if (!musicPerson) return wavlakeWords;
      const seenSongs = new Set(wavlakeWords.songs.map((s) => s.id));
      const seenArtists = new Set(wavlakeWords.artists.map((a) => a.id));
      return {
        artists:
          catalogue.artist && !seenArtists.has(catalogue.artist.id)
            ? [catalogue.artist, ...wavlakeWords.artists]
            : wavlakeWords.artists,
        albums: wavlakeWords.albums,
        songs: [...catalogue.songs.filter((s) => !seenSongs.has(s.id)), ...wavlakeWords.songs],
        loading: wavlakeWords.loading || catalogue.loading,
      };
    }
    const words = scope.rest.toLowerCase().split(/\s+/).filter(Boolean);
    const songs =
      words.length === 0
        ? catalogue.songs
        : catalogue.songs.filter((s) => words.every((w) => s.title.toLowerCase().includes(w)));
    return { artists: catalogue.artist ? [catalogue.artist] : [], albums: [], songs, loading: catalogue.loading };
  }, [scope, wavlakeWords, catalogue, musicPerson]);
  const mediaSettled = tab !== "media" || !!mediaFacet || !!mediaNotes?.eose || !!mediaNotes?.error;
  const searching =
    personMedia.length === 0 &&
    (!snapshot ||
      // Words that name a tag wait for the tag hub, so its people and the
      // relay's paint together — no chips popping in, nothing jumping.
      (tab === "people" && tagMatches.length > 0 && !carriers.settled) ||
      (!snapshot.eose && !snapshot.error && hits.length === 0 && (tab !== "music" || wavlake.loading)) ||
      (tab === "media" && !mediaSettled && hits.length === 0));
  const noResults =
    !!snapshot?.eose &&
    mediaSettled &&
    (tab !== "people" || carriers.settled) &&
    hits.length === 0 &&
    personMedia.length === 0 &&
    (tab !== "music" ||
      (!wavlake.loading &&
        wavlake.songs.length === 0 &&
        !fountain.loading &&
        fountain.items.length === 0 &&
        !podcastIndex.loading &&
        podcastIndex.songs.length === 0 &&
        podcastIndex.musicians.length === 0 &&
        !tagged.loading &&
        filterTaggedPeople(query, tagged.people).length === 0 &&
        (query.trim() !== "" || tagged.people.length === 0)));
  // What the count line counts, when it shows: every source the tab shows.
  const extraCount =
    (tab === "music" ? wavlake.songs.length + podcastIndex.songs.length : 0) +
    (tab === "media" ? personMedia.filter((h) => !hits.some((x) => x.event.id === h.event.id)).length : 0);

  // Recurring events (the "liverpool" monthly-meetup dump) collapse on the
  // event-shaped tabs; a chip expands the rest of each cluster.
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  // Events facet by WHEN — Upcoming by default (soonest first); with nothing
  // upcoming the tab shows what just happened and says so.
  const [eventWhen, setEventWhen] = useState<EventWhen>("upcoming");
  useEffect(() => setEventWhen("upcoming"), [query]);
  // The When chips count dated events; calendars ride along with every window.
  const eventCounts = useMemo(
    () => (tab === "events" ? eventWhenCounts(hits.filter((h) => h.event.kind !== CALENDAR_KIND)) : null),
    [tab, hits],
  );
  const eventsFellBack =
    tab === "events" && eventWhen === "upcoming" && !!eventCounts && eventCounts.upcoming === 0 && eventCounts.past > 0;
  const effectiveWhen: EventWhen = eventsFellBack ? "past" : eventWhen;
  // Live tab: three shelves — Live · Upcoming · Replays. Live leads when
  // anyone is on; a replay counts only once its recording answers.
  const [liveShelf, setLiveShelf] = useState<LiveState | null>(null);
  useEffect(() => setLiveShelf(null), [query]);
  const liveStates = useMemo(
    () => (tab === "live" ? liveStatesOf(hits) : new Map<string, LiveState | null>()),
    [hits, tab],
  );
  // What must answer before it shows (pipelines/live).
  const proofUrls = useMemo(() => (tab === "live" ? liveProofUrls(hits, liveStates) : []), [hits, tab, liveStates]);
  const proofs = useVerifiedRecordings(proofUrls);
  const verifiedRecordings = proofs.ok;
  const proven = useMemo(() => provenBy(verifiedRecordings), [verifiedRecordings]);

  const liveCounts = useMemo(
    () => (tab !== "live" ? { live: 0, upcoming: 0, replay: 0 } : countLive(hits, liveStates, proven)),
    [hits, tab, liveStates, proven],
  );
  const effectiveShelf: LiveState = liveShelfOf(liveShelf, liveCounts);
  const liveShowable = liveCounts.live + liveCounts.upcoming + liveCounts.replay > 0;
  // Apps facet by PLATFORM — a one-tap chip row (Benjamin's "categorize by
  // the chips"), computed from what the results actually run on.
  const [appPlatform, setAppPlatform] = useState<string | null>(null);
  const [appCategory, setAppCategory] = useState<string | null>(null);
  const [shopCategory, setShopCategory] = useState<string | null>(null);
  // Prices in the buyer's own money: one Bitcoin rate for the whole page,
  // asked only on the Shop tab. Without it the chips stay away and the
  // cards say nothing extra.
  const [shopPrice, setShopPrice] = useState<PriceBand["key"] | null>(null);
  const rates = useBtcRates(tab === "shop");
  const viewerFiat = useMemo(() => viewerCurrency(), []);
  const bands = useMemo(() => priceBands(viewerFiat), [viewerFiat]);
  // Photos and Audio sort through the loaded page (lib/mediaKind). Videos and Classic Vines
  // change what is asked instead (`mediaFacet`, lib/mediaFacet).
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  // Sorting through the page is for a page of mixed kinds; one asked for as videos or Vines has none.
  const pageKind = mediaFacet ? null : mediaKind;
  const [articleType, setArticleType] = useState<ArticleType | null>(null);
  const [recipeTopic, setRecipeTopic] = useState<string | null>(null);
  // Issues and PRs tabs: what became of each issue and patch — one request per page,
  // keyed by item id (NIP-34 status events, newest wins; none means open).
  const [repoState, setRepoState] = useState<GitState | null>(null);
  const [gitStatuses, setGitStatuses] = useState<Map<string, { kind: number; at: number }>>(new Map());
  const [gitComments, setGitComments] = useState<Map<string, number>>(new Map());
  // Events tab: who is going — one request per page, keyed by event coordinate.
  // Fundraisers tab: what each zap goal has raised. Like the git counts
  // below, each streamed snapshot or "more" page asks only after the goals
  // it adds, and a generation drops answers that land after the page emptied.
  // `settled` holds the goals a complete answer covered: only there does no
  // receipt mean "raised nothing" rather than "not known".
  const [goalProgress, setGoalProgress] = useState<{ byGoal: Map<string, GoalProgress>; settled: Set<string> }>({
    byGoal: new Map(),
    settled: new Set(),
  });
  const goalIdsKey = useMemo(
    () => (tab === "fundraisers" ? hits.filter((h) => h.event.kind === 9041).map((h) => h.event.id) : []).join(","),
    [hits, tab],
  );
  // Each shown goal's closed_at: receipts after it don't count (NIP-75). Read
  // through a ref so the fetch below stays keyed on the ids alone.
  const goalCloses = useRef(new Map<string, number>());
  goalCloses.current = useMemo(() => {
    const m = new Map<string, number>();
    if (tab !== "fundraisers") return m;
    for (const h of hits) {
      if (h.event.kind !== 9041) continue;
      const closes = Number(h.event.tags.find((t) => t[0] === "closed_at")?.[1]);
      if (Number.isFinite(closes) && closes > 0) m.set(h.event.id, closes);
    }
    return m;
  }, [hits, tab]);
  const goalFetched = useRef({ gen: 0, ids: new Set<string>() });
  useEffect(() => {
    const seen = goalFetched.current;
    if (!goalIdsKey) {
      seen.gen += 1;
      seen.ids = new Set();
      setGoalProgress({ byGoal: new Map(), settled: new Set() });
      return;
    }
    const ids = goalIdsKey.split(",").filter((id) => !seen.ids.has(id));
    if (ids.length === 0) return;
    for (const id of ids) seen.ids.add(id);
    const gen = seen.gen;
    void fetchGoalProgress(ids, undefined, goalCloses.current).then(({ byGoal, complete }) => {
      if (goalFetched.current.gen !== gen) return;
      setGoalProgress((prev) => ({
        byGoal: new Map([...prev.byGoal, ...byGoal]),
        settled: complete ? new Set([...prev.settled, ...ids]) : prev.settled,
      }));
    });
  }, [goalIdsKey]);
  const progressOf = (e: NostrEvent): GoalProgress | undefined =>
    tab !== "fundraisers" || e.kind !== 9041
      ? undefined
      : (goalProgress.byGoal.get(e.id) ?? (goalProgress.settled.has(e.id) ? NO_RAISED : undefined));
  const eventAddresses = useMemo(
    () =>
      tab === "events"
        ? hits
            .filter((h) => h.event.kind === 31922 || h.event.kind === 31923)
            .map((h) => `${h.event.kind}:${h.event.pubkey}:${h.event.tags.find((t) => t[0] === "d")?.[1] ?? ""}`)
        : [],
    [hits, tab],
  );
  const eventRsvps = useEventRsvps(eventAddresses);
  const rsvpsOf = (e: NostrEvent) =>
    eventRsvps.get(`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`);
  const gitItemIds = useMemo(
    () => (isGitItemTab(tab) ? hits.filter((h) => isGitItem(h.event.kind)).map((h) => h.event.id) : []),
    [hits, tab],
  );
  const gitIdsKey = gitItemIds.join(",");
  // Read through a ref so the asks below stay keyed on the ids alone.
  const gitItems = useRef(new Map<string, NostrEvent>());
  gitItems.current = useMemo(
    () => new Map(hits.filter((h) => isGitItem(h.event.kind)).map((h) => [h.event.id, h.event])),
    [hits],
  );
  // Each streamed snapshot or "more" page asks only after the ids it adds —
  // not the whole growing list again. A generation drops answers that land
  // after the page emptied (a new tab), so they can't refill it.
  const gitFetched = useRef({ gen: 0, ids: new Set<string>() });
  useEffect(() => {
    const seen = gitFetched.current;
    if (!gitIdsKey) {
      seen.gen += 1;
      seen.ids = new Set();
      setGitStatuses(new Map());
      setGitComments(new Map());
      return;
    }
    const ids = gitIdsKey.split(",").filter((id) => !seen.ids.has(id));
    if (ids.length === 0) return;
    for (const id of ids) seen.ids.add(id);
    const gen = seen.gen;
    // The items themselves: whose status counts is their author's and their repo's (NIP-34).
    const items = ids.map((id) => gitItems.current.get(id) ?? id);
    void fetchGitStatuses(items).then((m) => {
      if (gitFetched.current.gen === gen && m.size) setGitStatuses((prev) => new Map([...prev, ...m]));
    });
    void fetchGitCommentCounts(ids).then((m) => {
      if (gitFetched.current.gen === gen && m.size) setGitComments((prev) => new Map([...prev, ...m]));
    });
  }, [gitIdsKey]);
  const stateOf = (e: NostrEvent): GitState | null => gitItemState(e, gitStatuses);
  const [repoLabel, setRepoLabel] = useState<string | null>(null);
  // The labels maintainers share, and the states the items are in (pipelines/git).
  const repoLabelFacets = useMemo(() => (isGitItemTab(tab) ? gitLabelFacets(hits) : []), [hits, tab]);
  const repoStateFacets = useMemo(
    () => (isGitItemTab(tab) ? gitStateFacets(hits, gitStatuses) : []),
    [hits, tab, gitStatuses],
  );
  useEffect(() => {
    setAppPlatform(null);
    setAppCategory(null);
    setShopCategory(null);
    setMediaKind(null);
    setArticleType(null);
    setRecipeTopic(null);
    // Issues' states aren't PRs' (resolved vs merged), and a new query may
    // carry none of the picked label: either would strand an empty page.
    setRepoState(null);
    setRepoLabel(null);
  }, [tab, query]);
  // The listings' own categories, counted — the Shop's facets.
  // What kinds of media the page holds, in fixed order, counted. One kind alone needs no chip
  // of its own, and neither does a page already narrowed to videos or Vines.
  const mediaFacets = useMemo(
    () => (tab !== "media" || mediaFacet ? [] : mediaKindFacets(hits)),
    [tab, hits, mediaFacet],
  );
  // Videos and Classic Vines change what is asked: the chip rewrites the query, as the Filters
  // panel does, and the page re-runs. All takes either off, and the page's own sorting with it.
  const chooseMediaFacet = (next: MediaFacet | null) => {
    setMediaKind(null);
    if (next !== mediaFacet) onQueryRewrite?.(withMediaFacet(query, next));
  };
  // With nobody to rewrite the query through, Videos can only sort through the loaded page.
  const toggleVideos = () => {
    if (onQueryRewrite) chooseMediaFacet(mediaFacet === "videos" ? null : "videos");
    else setMediaKind((cur) => (cur === "video" ? null : "video"));
  };
  const mediaCounts = new Map(mediaFacets);
  const shopFacets = useMemo(() => (tab !== "shop" ? [] : shopFacetsOf(hits)), [tab, hits]);
  // The kinds of article among the hits, and the recipes' own topics (pipelines/articles).
  const articleFacets = useMemo<ArticleType[]>(() => (tab !== "articles" ? [] : articleFacetsOf(hits)), [tab, hits]);
  const recipeFacets = useMemo(() => (tab !== "recipes" ? [] : recipeFacetsOf(hits)), [tab, hits]);
  // What the apps run on, and their own categories (pipelines/apps).
  const appFacets = useMemo(() => (tab !== "apps" ? [] : appPlatformFacets(hits)), [tab, hits]);
  const appCategoryFacets = useMemo(() => (tab !== "apps" ? [] : appCategoryFacetsOf(hits)), [tab, hits]);
  const displayHits = useMemo<DisplayRow[]>(
    () =>
      displayRows(hits, {
        tab,
        carrierRank,
        when: effectiveWhen,
        category,
        tagFilter,
        streamTag,
        tagsByHit: resultTags.byHit,
        appPlatform,
        appCategory,
        shopCategory,
        shopPrice,
        rates,
        bands,
        viewerFiat,
        priceSort,
        fold: shopFold,
        articleType,
        recipeTopic,
        gitStatuses,
        repoState,
        repoLabel,
        liveStates,
        shelf: effectiveShelf,
        proven,
        pageKind,
        scoreOf,
        expanded: expandedClusters,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      carrierRank,
      scoreOf,
      hits,
      tab,
      appPlatform,
      appCategory,
      shopCategory,
      shopPrice,
      rates,
      bands,
      viewerFiat,
      priceSort,
      shopFold,
      articleType,
      recipeTopic,
      pageKind,
      repoState,
      repoLabel,
      gitStatuses,
      expandedClusters,
      effectiveWhen,
      scoreOf,
      liveStates,
      effectiveShelf,
      proven,
      category,
      tagFilter,
      streamTag,
      resultTags.byHit,
    ],
  );

  // Compromised people on the page, and whose new account each one's is: the new account is
  // shown above its compromised one (NewAccountResult), so its own row further down steps aside.
  const peopleOnPage = useMemo(
    () => displayHits.filter((d) => d.hit.event.kind === 0).map((d) => d.hit.event.pubkey),
    [displayHits],
  );
  const compromisedOnPage = useCompromisedAmong(peopleOnPage);
  const newAccountOf = useMemo(
    () =>
      new Map(compromisedOnPage.flatMap((s) => (s.successorPubkey ? [[s.successorPubkey, s.pubkey] as const] : []))),
    [compromisedOnPage],
  );

  // The Events tab is a timeline: a header on the first card of each day (pipelines/events).
  const eventDayHeaders = useMemo(
    () => (tab !== "events" ? new Map<string, DayHeader>() : eventDayHeadersOf(displayHits, effectiveWhen)),
    [displayHits, tab, effectiveWhen],
  );

  // A chip or a Filters control has narrowed the page.
  // Narrowed by something besides a pressed tag, which says its own count.
  const narrowedBesidesTag =
    activeFilters > 0 ||
    !!shopCategory ||
    !!shopPrice ||
    !!pageKind ||
    !!articleType ||
    !!recipeTopic ||
    !!appPlatform ||
    !!appCategory ||
    !!repoState ||
    !!repoLabel ||
    (tab === "events" && eventWhen !== "upcoming") ||
    (tab === "live" && liveShelf !== null);
  const narrowed = narrowedBesidesTag || !!tagFilter;
  const tagName =
    resultTags.tags.find((t) => t.key === tagFilter)?.name ?? tagFilter?.slice(tagFilter.indexOf("|") + 1) ?? "";
  // A tag the link names waits for the rows' tags rather than saying nothing carries it.
  const tagWaiting =
    !!tagFilter &&
    displayHits.length === 0 &&
    (streamTag === tagFilter ? !snapshot?.eose : !tagMembers.settled || !!narrowKey || !resultTags.settled);
  const totalCount = rawHits.length + extraCount;
  const displayedCount = displayHits.length + extraCount;

  // Everything the notes refer to — quoted events, mentioned and answered
  // people — resolved once, store-first, so a note names who it mentions
  // instead of "@nprofile1q…" (the profile page's recipe, shared).
  // Asked once the stream has settled, so a snapshot every few hundred
  // milliseconds does not re-key the fetch; the fetchers are store-first.
  const noteEvents = useMemo(
    () =>
      snapshot?.eose ? hits.filter((h) => NOTE_KINDS.has(h.event.kind)).map((h) => h.event as MinimalEvent) : NO_NOTES,
    [hits, snapshot?.eose],
  );
  const noteRefs = useNoteRefs(noteEvents);
  const profilesRef = useRef<Map<string, CardProfile> | null>(null);
  const profiles = useMemo(() => {
    const map = profilesOf(hits);
    for (const [pk, p] of noteRefs.profiles) if (!map.has(pk)) map.set(pk, p);
    return keepSameProfiles(profilesRef.current, map);
  }, [hits, noteRefs.profiles]);
  profilesRef.current = profiles;
  // What the memoised lists are handed: the rows alone, one array per change of them.
  const shownHits = useMemo(() => displayHits.map((d) => d.hit), [displayHits]);
  const turnPage = useCallback(() => streamRef.current?.more(), []);
  const openTab = useCallback((next: string) => changeTab(next as SearchTab), [changeTab]);

  // What every result row reads (TabResultCard): built per render, as the rows are.
  const cardContext: TabCardContext = {
    tab,
    pov,
    query,
    rowsWhole,
    eventDayHeaders,
    onExpand: (clusterId) => setExpandedClusters((prev) => new Set(prev).add(clusterId)),
    displayHits,
    peopleOnPage,
    newAccountOf,
    scoreOf,
    tagMatches,
    carriersSettled: carriers.settled,
    carrierSets,
    pointedNames: pointers.namesOf,
    openProfile,
    onPrefetchEnter,
    onPrefetchLeave,
    progressOf,
    searchedKinds,
    profiles,
    noteRefs,
    rsvpsOf,
    shopGroupOf,
    rates,
    hitsBySeller,
    liveStates,
    stateOf,
    gitComments,
  };

  return (
    <SearchPriorityContext.Provider value={searchPriority}>
      <QuietTrustChrome>
        <div className="mx-auto mt-4 w-full max-w-2xl text-left sm:mt-5 lg:max-w-[62rem]" data-testid="search-results">
          {/* One quiet row, Google's anatomy: six tabs (scrolling on phones),
          then pinned at the right edge — More ▾, the perspective control and
          Filters — so nothing a person needs ever scrolls out of view. */}
          <div
            className="-mx-1 mb-2 flex items-stretch border-b border-slate-100 px-1 dark:border-slate-800/60 sm:mb-3"
            data-testid="search-toolbar"
            onPointerEnter={() => holdRow("pointer", true)}
            onPointerLeave={() => holdRow("pointer", false)}
            onFocus={() => holdRow("focus", true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) holdRow("focus", false);
            }}
          >
            <div
              ref={tabStripRef}
              role="tablist"
              aria-label="Result types"
              className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden"
              style={edgeFade(tabStripEdges)}
              data-testid="search-tabs"
            >
              {/* On All, its categories stand in for the other tabs: Top, All, then what the words find most. */}
              {PRIMARY_TABS.filter((t) => (onAll ? t.key === "top" || t.key === "all" : offers(t.key))).map((t) => {
                const selected = !activeKind && tab === t.key && !(t.key === "all" && categoryAsked);
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => (t.key === "all" && onAll ? pressCategory(null) : changeTab(t.key))}
                    className={tabClass(selected)}
                    data-testid={`search-tab-${t.key}`}
                  >
                    {t.label}
                  </button>
                );
              })}
              {onAll &&
                rowCategories.inRow.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={categoryAsked === c.key}
                    onClick={() => pressCategory(c.key)}
                    className={categoryTabClass(categoryAsked === c.key)}
                    title={c.name}
                    data-testid={`search-category-${categoryTestId(c.key)}`}
                  >
                    {c.name}
                  </button>
                ))}
              {/* Until the categories are counted, the row says they are coming — then they land at once. */}
              {onAll && rowLoading && (
                <span
                  className="flex shrink-0 items-center gap-2 px-2"
                  aria-label="Finding categories"
                  role="status"
                  data-testid="search-categories-loading"
                >
                  {[14, 12, 16].map((w, i) => (
                    <span
                      key={i}
                      className="h-2.5 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"
                      style={{ width: `${w * 4}px`, animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </span>
              )}
            </div>
            <div className="ml-1 flex shrink-0 items-center gap-1 sm:gap-2">
              {onAll && (
                <MoreCategories groups={rowCategories.behindMore} pressed={categoryAsked} onPress={pressCategory} />
              )}
              {!onAll && (
                <MoreTabs
                  tab={tab}
                  onChange={changeTab}
                  kinds={kinds}
                  kind={activeKind?.key ?? null}
                  onKind={openKind}
                  offers={offers}
                  counts={tabEvidence.counts}
                />
              )}
              {perspective}
              {/* The syntax sheet, before the sorting: what can be typed into the box is the
              question people have first. The mark alone — a labelled button wraps this row
              on a phone — and `aria-label` says what it is. */}
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label="Search syntax"
                title="Search syntax — people, days, topics, and the tokens that rank the answer. Shortcut: ?"
                onClick={() => setSyntaxOpen(true)}
                // Same bare 24px round mark as the perspective control's ⓘ beside it (not a tab: a
                // tab's underline border pushes the glyph off-centre), pulled in so the pair reads as one.
                className={
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-brand-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-500 dark:hover:text-white" +
                  (perspective ? " sm:-ml-1.5" : "")
                }
                data-testid="search-syntax-toggle"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              {onQueryRewrite && (
                <button
                  type="button"
                  aria-expanded={filtersOpen}
                  aria-label="Filters"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={
                    tabClass(filtersOpen) + " inline-flex items-center gap-1 !px-2 sm:-ml-1.5 sm:!pl-1.5 sm:!pr-2.5"
                  }
                  data-testid="search-filters-toggle"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilters > 0 && (
                    <span
                      className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-semibold leading-none text-white"
                      data-testid="filters-active-count"
                    >
                      {activeFilters}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          <QueryAsSent query={effectiveQuery} tab={tab} pov={pov} timeMs={snapshot?.timeMs} />
          {filtersOpen && onQueryRewrite && (
            <FiltersPanel query={query} pov={pov} userPubkey={userPubkey} tab={tab} onQueryRewrite={onQueryRewrite} />
          )}
          <SearchSyntaxSheet open={syntaxOpen} onOpenChange={setSyntaxOpen} />

          {/* Google anatomy: the knowledge panel is FIRST in the DOM — the top
          card on mobile, the right rail on desktop (flex order). When no
          person clears the confidence bar it renders nothing and the column
          takes the full width. */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-center lg:gap-6">
            <KnowledgePanel
              query={query}
              pov={pov}
              userPubkey={userPubkey}
              sections={composed ? sections : undefined}
              rails={tab === "top"}
              // Not on All — the relay's answer, one list, which the rails would repeat —
              // but kept mounted there, hidden and asking nothing, so back on Top it is as it was.
              // Nor on a kind's own page: the list and its map take the width.
              active={tab !== "all" && !activeKind}
              group={composed ? "search-top" : undefined}
              onOpen={onOpenProfile}
              onPerson={setPanelPerson}
              onTab={openTab}
              onOpenKind={openKind}
              // Not pinned: the panel is context for the query, read at the top, and
              // it scrolls away with the page the way Google's does. Pinned, it
              // followed the reader down every page and ducked under the search
              // band (Benjamin, 2026-09-09: "I don't like how this gets covered and
              // always stays in view"). The Top pill brings it back in one tap.
              className="lg:order-2 lg:w-72 lg:shrink-0"
            />
            <div className="w-full min-w-0 lg:order-1 lg:w-[42rem] lg:flex-none">
              {/* Above the results and whatever stands in for them: Videos and Classic Vines are
                offered on every Media page, and a narrowed page that found nothing still needs
                the way back. Photos and Audio join them when the loaded page mixes kinds. */}
              {tab === "media" && serverStatus.search !== "down" && (
                <MediaFacetRow
                  {...{ mediaFacet, pageKind, chooseMediaFacet, toggleVideos, mediaCounts, setMediaKind }}
                  vines={!!onQueryRewrite}
                />
              )}
              {/* The tags the results carry, most carried first: each a filter over them. */}
              {(FEATURES.searchTagFilters || onListTab) && onAll && !tagTabKey && serverStatus.search !== "down" && (
                <TagFacets
                  key={effectiveQuery}
                  tags={facetTags}
                  pressed={tagFilter}
                  settled={(!FEATURES.searchTagFilters || resultTags.settled) && listTags.settled}
                  onPress={(t) =>
                    pressTag(
                      t ? { key: t.key, name: t.name, carriers: carriersOf(hits, resultTags.byHit, t.key) } : null,
                    )
                  }
                />
              )}
              {activeKind ? (
                <activeKind.Page query={query} onTabChange={changeTab} />
              ) : serverStatus.search === "down" ? (
                // The relay is the thing that is down: the results area says so, and
                // the box, the tabs and Filters above stay usable.
                <SorryPage scope="search" variant="inline" onRetry={() => retryNow("search")} signedIn={!!userPubkey} />
              ) : composed ? (
                <ComposedResults
                  onOpenKind={openKind}
                  query={query}
                  personMedia={personMedia}
                  onSections={takeSections}
                  onSectionHits={rememberSections}
                  seeds={composedSeeds}
                  peopleSeedIsGuess={peopleSeedIsGuess}
                  pov={pov}
                  userPubkey={userPubkey}
                  onTabChange={changeTab}
                  onOpenProfile={openProfile}
                  onQueryRewrite={onQueryRewrite}
                />
              ) : tagTab ? (
                // A tag's tab holds what carries it, not a search of the words.
                <TagTabResults
                  tag={tagTab}
                  scoreOf={scoreOf}
                  query={query}
                  observer={pov === "mywot" && userPubkey ? userPubkey : "house"}
                />
              ) : snapshot?.error ? (
                <div
                  className="rounded-xl border border-red-100 bg-red-50/60 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300"
                  data-testid="search-error"
                >
                  {snapshot.error}
                </div>
              ) : searching || categoryWaiting || tagWaiting ? (
                <div className="space-y-2 sm:space-y-3" data-testid="container-search-loading">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex animate-pulse items-start gap-3 rounded-xl border border-slate-100 bg-white/70 p-3 dark:border-slate-800/60 dark:bg-slate-900/70 sm:gap-4 sm:p-4"
                      style={{ animationDelay: `${i * 0.08}s` }}
                    >
                      <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 sm:h-11 sm:w-11" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-3 w-28 rounded-full bg-slate-200 dark:bg-slate-700 sm:h-3.5 sm:w-36" />
                        <div className="h-2.5 w-full max-w-md rounded-full bg-slate-100 dark:bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : noResults && tab === "music" && scopedTo ? (
                // A person's music view with nothing here yet: say so, and offer the
                // person — a face in a music context opens their music, and this is
                // where a Bandcamp-only musician lands.
                <div className="mt-4 sm:mt-6" data-testid="music-scoped-empty">
                  <div className="rounded-xl border border-slate-100 bg-white/60 p-2 dark:border-slate-800/60 dark:bg-slate-900/60 sm:rounded-2xl">
                    <EmptyState
                      icon={Radar}
                      compact
                      title={`No songs from ${panelPerson ? getDisplayLabel(panelPerson) : "them"} here yet`}
                      description="Nothing on Nostr or Wavlake under their key so far."
                      action={
                        <Link
                          href={`/p/${(() => {
                            try {
                              return nip19.npubEncode(scopedTo);
                            } catch {
                              return scopedTo;
                            }
                          })()}`}
                          className="text-sm font-semibold text-brand-link hover:underline"
                        >
                          See their profile →
                        </Link>
                      }
                    />
                  </div>
                </div>
              ) : noResults ? (
                <div className="mt-4 sm:mt-6" data-testid="container-no-results">
                  <div className="rounded-xl border border-slate-100 bg-white/60 p-2 dark:border-slate-800/60 dark:bg-slate-900/60 sm:rounded-2xl">
                    {scopedTo && hiddenBelowLine === 0 ? (
                      (() => {
                        const who = scopedName ?? "This person";
                        const thing = isKindlessTab(tab) ? "anything" : tabLabel(tab).toLowerCase();
                        const others = {
                          chips: (scopedContent.get(scopedTo)?.chips ?? []).filter((c) => c.tab !== tab),
                        };
                        return (
                          <EmptyState
                            icon={Radar}
                            compact
                            title={`${who} hasn't published ${thing} here yet`}
                            description={
                              others.chips.length
                                ? `What ${scopedName ? who : "they"} ${scopedName ? "does" : "do"} publish:`
                                : "Try another tab, or everything they have published."
                            }
                            action={
                              <div className="flex flex-col items-center gap-3" data-testid="scoped-empty">
                                {others.chips.length > 0 && (
                                  <PersonContentChips
                                    pubkey={scopedTo}
                                    name={who}
                                    content={others}
                                    onPick={(c) => changeTab(c.tab as SearchTab)}
                                    testId="scoped-empty-chips"
                                  />
                                )}
                                {!isKindlessTab(tab) && (
                                  // The page reads its tab once, on mount: a link that only rewrites the URL
                                  // moved nothing. It switches the tab in place, the way the chips do; the
                                  // href stays for a middle-click or a copied link.
                                  <Link
                                    href={scopedSearchHref(scopedTo, "top", scope?.rest)}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      changeTab("top");
                                    }}
                                    className="text-xs font-semibold text-brand-link hover:underline"
                                    data-testid="scoped-empty-all"
                                  >
                                    See everything from {who === "This person" ? "them" : who} →
                                  </Link>
                                )}
                              </div>
                            }
                          />
                        );
                      })()
                    ) : (
                      <EmptyState
                        icon={Radar}
                        compact
                        title="Nothing found"
                        description={
                          hiddenBelowLine > 0
                            ? "Everything that matched came from accounts below the verified line."
                            : "Try different words, another tab, or paste an npub directly."
                        }
                      />
                    )}
                  </div>
                  {floorNotice}
                </div>
              ) : (
                <>
                  <TabFacetRows
                    {...{
                      tab,
                      eventCounts,
                      effectiveWhen,
                      setEventWhen,
                      eventsFellBack,
                      displayHits,
                      repoStateFacets,
                      repoLabelFacets,
                      repoState,
                      setRepoState,
                      repoLabel,
                      setRepoLabel,
                      liveShowable,
                      hits,
                      snapshot,
                      proofs,
                      scopedTo,
                      query,
                      liveCounts,
                      effectiveShelf,
                      setLiveShelf,
                      articleFacets,
                      articleType,
                      setArticleType,
                      recipeFacets,
                      recipeTopic,
                      setRecipeTopic,
                      shopFacets,
                      shopCategory,
                      setShopCategory,
                      rates,
                      rawHits,
                      bands,
                      shopPrice,
                      setShopPrice,
                      appFacets,
                      appCategoryFacets,
                      appPlatform,
                      setAppPlatform,
                      appCategory,
                      setAppCategory,
                    }}
                  />
                  {/* No count by default — Google dropped it from the default view too.
              The number does work only when a chip or a filter narrows the
              page: what matched, of how many. */}
                  {/* A category's page says what it holds: all of it where its count is its page's,
                  else what has come so far. More below turns the next page. */}
                  {category && (
                    <p className="mb-2 px-1 text-xs text-slate-500 dark:text-slate-400" data-testid="category-count">
                      {categories.totals.has(category.key)
                        ? pagedWords(category, categories.totals.get(category.key)!)
                        : `${pagedWords(category, displayHits.length)}${snapshot?.exhausted ? "" : " so far"}`}
                    </p>
                  )}
                  {narrowed && totalCount > 0 && (
                    <div className="mb-2 px-1 sm:mb-3">
                      <p className="text-xs text-slate-400 dark:text-slate-500" data-testid="text-search-stats">
                        {/* A pressed tag says what it found, not "of" the rows loaded so far: those are a
                        page of the search, not what the words match. */}
                        {tagFilter && !narrowedBesidesTag
                          ? `${displayedCount} ${displayedCount === 1 ? "result" : "results"} tagged ${tagName}${snapshot?.exhausted ? "" : " so far"}`
                          : `${displayedCount} of ${totalCount} match`}
                      </p>
                    </div>
                  )}
                  {tab === "all" ? (
                    // Every kind, in the relay's order, one row shape: the pill says which is which.
                    <AllResults
                      hits={shownHits}
                      settled={!!snapshot?.eose && !snapshot.loadingMore}
                      scoreOf={scoreOf}
                      query={query}
                      skipOffscreen={!rowsWhole}
                    />
                  ) : tab === "music" ? (
                    <MusicResults
                      hits={shownHits}
                      query={query}
                      wavlake={wavlake}
                      podcastIndex={podcastIndex}
                      tagged={tagged}
                      fountain={fountain}
                      person={panelPerson}
                      scoreOf={scoreOf}
                      onOpenProfile={openProfile}
                    />
                  ) : (
                    <div
                      className={
                        tab === "shop"
                          ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3"
                          : tab === "live"
                            ? "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3"
                            : tab === "apps" || isGitTab(tab) || isThingTab(tab)
                              ? "grid grid-cols-1 gap-2.5 lg:grid-cols-2"
                              : "space-y-2 sm:space-y-3"
                      }
                      data-testid="container-search-results"
                    >
                      {tab === "media" && panelPerson && personMedia.length > 0 && (
                        <div className="col-span-full mb-1" data-testid="media-from-person">
                          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            From {getDisplayLabel(panelPerson)}
                          </p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {personMedia.map((h) => (
                              <MediaCard
                                key={h.event.id}
                                event={h.event}
                                author={h.author}
                                score={scoreOf(h.event.pubkey)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {(() => {
                        // The people cards' order among the rows, for the first few's "followed by".
                        let people = 0;
                        return displayHits
                          .filter((h) => !(tab === "media" && personMediaIds.has(h.hit.event.id)))
                          .map((row) => (
                            <TabResultCard
                              key={row.hit.event.id}
                              row={row}
                              personIdx={isPersonCard(row.hit, cardContext) ? people++ : -1}
                              ctx={cardContext}
                            />
                          ));
                      })()}
                    </div>
                  )}
                  <MoreResults
                    show={!!snapshot?.eose && !snapshot.error && !snapshot.exhausted}
                    loading={!!snapshot?.loadingMore}
                    onMore={turnPage}
                  />
                  {floorNotice}
                </>
              )}
            </div>
          </div>
        </div>
      </QuietTrustChrome>
    </SearchPriorityContext.Provider>
  );
});
