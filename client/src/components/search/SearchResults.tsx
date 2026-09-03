/**
 * The results half of the search page — Google anatomy: vertical tabs under
 * the header, a left-aligned column of typed result cards, count line at
 * EOSE. Owns the stream lifecycle: any change to query/tab/POV cancels the
 * in-flight stream and starts a fresh one (a cancelled handle never calls
 * back, so stale results structurally cannot flash).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { Radar, SlidersHorizontal } from "lucide-react";
import { activeFilterCount, applyFilters, datePreset, readFilters, sinceForPreset, type DatePreset, type SearchFilterPatch } from "@/lib/searchSyntax";
import { clientFilterHits } from "@/lib/clientFilters";
import { useNetworkReach } from "@/hooks/useNetworkReach";
import { useWheelScrollX } from "@/hooks/useWheelScrollX";
import { eventStore } from "@/lib/eventStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonCard } from "@/components/search/PersonCard";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventPath } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import {
  searchStream,
  suggestProfiles,
  TAB_KINDS,
  type SearchHit,
  type SearchPov,
  type SearchSnapshot,
  type SearchTab,
} from "@/services/search";

import { AppCard, LiveCard, ListCard, MediaCard, RepoCard, platformWords } from "@/components/search/cards";
import { KnowledgePanel } from "@/components/search/KnowledgePanel";
import { ComposedResults } from "@/components/search/ComposedResults";
import { collapseHits } from "@/lib/searchCollapse";

const NOTE_KINDS = new Set(TAB_KINDS.notes);
const ARTICLE_KINDS = new Set(TAB_KINDS.articles);
const MEDIA_KINDS = new Set(TAB_KINDS.media);
const APP_KINDS = new Set(TAB_KINDS.apps);
const REPO_KINDS = new Set(TAB_KINDS.repos);
const LIVE_KINDS = new Set(TAB_KINDS.live);
const LIST_KINDS = new Set(TAB_KINDS.lists);
const EMPTY_EVENTS = new Map<string, MinimalEvent>();

/** ShareNoteCard's profile map, built from the hits' hydrated authors. */
function profilesOf(hits: SearchHit[]) {
  const map = new Map<string, { name?: string; display_name?: string; picture?: string; nip05?: string }>();
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

const TABS: { key: SearchTab; label: string }[] = [
  { key: "everything", label: "Everything" },
  { key: "people", label: "People" },
  { key: "notes", label: "Notes" },
  { key: "articles", label: "Articles" },
  { key: "media", label: "Media" },
  { key: "apps", label: "Apps" },
  { key: "repos", label: "Repos" },
  { key: "live", label: "Live" },
  { key: "lists", label: "Lists" },
];

const TAB_KEYS = new Set(TABS.map((t) => t.key));

function tabFromUrl(): SearchTab {
  try {
    const t = new URLSearchParams(window.location.search).get("t");
    // The old combined tab's deep links keep working.
    if (t === "code") return "repos";
    if (t && TAB_KEYS.has(t as SearchTab)) return t as SearchTab;
  } catch {
    /* default below */
  }
  return "everything";
}

function writeTabToUrl(tab: SearchTab) {
  try {
    const url = new URL(window.location.href);
    if (tab === "everything") url.searchParams.delete("t");
    else url.searchParams.set("t", tab);
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* URL sync is a convenience, never a blocker */
  }
}

/** Google's Tools menu for time. */
const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "day", label: "Past 24 hours" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
  { value: "custom", label: "Custom range" },
];

/** A chosen observer shows as a PERSON — name from the store when known,
 *  a short npub degrade when not. Never bare hex. */
function observerDisplay(pubkey: string): { name: string; picture?: string } {
  try {
    const known = eventStore.getReplaceable(0, pubkey);
    if (known) {
      const meta = JSON.parse(known.content) as { name?: string; display_name?: string; picture?: string };
      const name = meta.display_name || meta.name;
      if (name) return { name, picture: meta.picture };
    }
  } catch {
    /* fall through to npub */
  }
  try {
    return { name: `${nip19.npubEncode(pubkey).slice(0, 12)}…` };
  } catch {
    return { name: `${pubkey.slice(0, 8)}…` };
  }
}

// Every option here changes the relay's order — probed 2026-09-03. "Text match
// only" went: it ordered exactly like "Include unranked" and confused people.
const SORT_OPTIONS = [
  { value: "", label: "Best match" },
  { value: "recent", label: "Newest first" },
  { value: "rank", label: "Most trusted authors" },
  { value: "followers", label: "Most followed authors" },
];

/** A one-line facet chip strip: horizontal scroll with the scrollbar hidden,
 *  a soft right-edge fade to signal "more", and mouse-wheel → horizontal so a
 *  desktop mouse scrolls it as easily as a phone swipes (trackpads/touch already
 *  scroll it natively). */
function FacetRow({ testId, className = "", children }: { testId: string; className?: string; children: React.ReactNode }) {
  const ref = useWheelScrollX();
  return (
    <div
      ref={ref}
      className={`-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%_-_1.25rem),transparent)] ${className}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** The filters that are real (probed 2026-09-03). Every control rewrites the
 *  full query (words + tokens) through onQueryRewrite; the landing page keeps
 *  the tokens OUT of the visible box and in the URL's `f` instead. */
function FiltersPanel({
  query,
  pov,
  userPubkey,
  onQueryRewrite,
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  onQueryRewrite: (next: string) => void;
}) {
  const state = readFilters(query);
  const preset = datePreset(state);
  // "Custom range" stays open once chosen, even before a day is picked.
  const [customDates, setCustomDates] = useState(preset === "custom");
  const [rankAsDraft, setRankAsDraft] = useState("");
  const [rankAsOptions, setRankAsOptions] = useState<SearchResult[]>([]);
  const write = (patch: SearchFilterPatch) => onQueryRewrite(applyFilters(query, patch));

  // People are picked by NAME — the box that asked for "npub or hex" is gone.
  useEffect(() => {
    const q = rankAsDraft.trim();
    if (q.length < 2) {
      setRankAsOptions([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void suggestProfiles(q, { pov, userPubkey }, { limit: 5 }).then((people) => {
        if (alive) setRankAsOptions(people);
      });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [rankAsDraft, pov, userPubkey]);

  const showDates = customDates || preset === "custom";
  const segment = (on: boolean) =>
    `h-8 px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/30 ${
      on ? "bg-brand-primary text-white" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;
  const field =
    "h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-accent/30";

  return (
    <div
      className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 p-3"
      data-testid="search-filters-panel"
    >
      <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Sort
        <select
          className={field}
          value={state.sort ?? ""}
          onChange={(e) => write({ sort: e.target.value || null })}
          data-testid="filter-sort"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Time
        <select
          className={field}
          value={showDates ? "custom" : preset}
          onChange={(e) => {
            const next = e.target.value as DatePreset;
            if (next === "custom") {
              setCustomDates(true);
              return;
            }
            setCustomDates(false);
            write({ since: sinceForPreset(next), until: null });
          }}
          data-testid="filter-date"
        >
          {DATE_PRESETS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {showDates && (
        <>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            From day
            <input
              type="date"
              className={field}
              value={state.since ?? ""}
              onChange={(e) => write({ since: e.target.value || null })}
              data-testid="filter-since"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            To day
            <input
              type="date"
              className={field}
              value={state.until ?? ""}
              onChange={(e) => write({ until: e.target.value || null })}
              data-testid="filter-until"
            />
          </label>
        </>
      )}
      {/* Trust distance — how far the search casts its net. The relay has no
          hops, so this reads the viewer's own follow graph (Benjamin's
          slider); with nobody signed in there is no "you", so it isn't there. */}
      {userPubkey && (
        <div className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Trust distance
          <div
            role="group"
            aria-label="Trust distance"
            className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 divide-x divide-slate-200 dark:divide-slate-800"
            data-testid="filter-reach"
          >
            {(
              [
                ["follows", "People you follow"],
                ["friends", "Friends of friends"],
                [null, "Everyone"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={state.reach === value}
                onClick={() => write({ reach: value })}
                className={segment(state.reach === value)}
                data-testid={`filter-reach-${value ?? "all"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-1.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-brand-primary"
          checked={state.verifiedOnly}
          onChange={(e) => write({ verifiedOnly: e.target.checked })}
          data-testid="filter-verified"
        />
        Verified accounts only
      </label>
      <label className="flex items-center gap-1.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-brand-primary"
          checked={state.includeSpam}
          onChange={(e) => write({ includeSpam: e.target.checked })}
          data-testid="filter-spam"
        />
        Include unranked accounts
      </label>
      <div className="relative flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        See results through someone else's eyes
        {state.rankAs ? (
          (() => {
            const who = observerDisplay(state.rankAs);
            return (
              <span
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/5 dark:bg-brand-primary/15 px-2 text-xs font-medium text-slate-700 dark:text-slate-200"
                data-testid="rank-as-selected"
              >
                <Avatar className="h-5 w-5">
                  {who.picture ? <AvatarImage src={who.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                </Avatar>
                <span className="max-w-[10rem] truncate">{who.name}</span>
                <button
                  type="button"
                  aria-label="Stop ranking as this person"
                  className="rounded-full p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  onClick={() => write({ rankAs: null })}
                  data-testid="rank-as-clear"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })()
        ) : (
          <>
            <input
              type="text"
              placeholder="Type a name…"
              className={`${field} w-48`}
              value={rankAsDraft}
              onChange={(e) => setRankAsDraft(e.target.value)}
              data-testid="filter-rank-as"
            />
            {rankAsOptions.length > 0 && (
              <div className="absolute top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
                {rankAsOptions.map((p) => (
                  <button
                    key={p.pubkey}
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => {
                      setRankAsDraft("");
                      setRankAsOptions([]);
                      write({ rankAs: p.pubkey });
                    }}
                    data-testid={`rank-as-option-${p.pubkey.slice(0, 8)}`}
                  >
                    <Avatar className="h-5 w-5 shrink-0">
                      {p.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium text-slate-800 dark:text-slate-100">{getDisplayLabel(p)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SearchResults({
  query,
  pov,
  userPubkey,
  onOpenProfile,
  onPrefetchEnter,
  onPrefetchLeave,
  onQueryRewrite,
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  /** People-card click. Default: the public profile page. */
  onOpenProfile?: (result: SearchResult) => void;
  onPrefetchEnter?: (result: SearchResult) => void;
  onPrefetchLeave?: (result: SearchResult) => void;
  /** The Filters panel rewrites the query THROUGH the caller so the new
   *  tokens land visibly in the search box and resubmit. */
  onQueryRewrite?: (next: string) => void;
}) {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<SearchTab>(tabFromUrl);
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Everything composes its own purpose-ranked section streams — unless the
  // user typed a sort:, which is them choosing ONE order for one list.
  const userSorted = /(^|\s)sort:/i.test(query);
  const composed = tab === "everything" && !userSorted;
  // Content tabs land on what's fresh by default; People keeps trust rank,
  // and a typed sort: is always honored verbatim.
  const effectiveQuery =
    !userSorted && tab !== "everything" && tab !== "people"
      ? `${query} sort:recent`.trim()
      : query;

  useEffect(() => {
    if (composed) {
      setSnapshot(null);
      return;
    }
    setSnapshot(null);
    // Client-side filters (Verified only, reach) thin the page after the
    // fact — ask the relay for a deeper one so there is something left.
    const clientFiltered = readFilters(effectiveQuery);
    const limit = clientFiltered.verifiedOnly || clientFiltered.reach ? 300 : undefined;
    return searchStream(effectiveQuery, { tab, pov, userPubkey, limit }, setSnapshot);
  }, [effectiveQuery, tab, pov, userPubkey, composed]);

  const changeTab = useCallback((next: SearchTab) => {
    setTab(next);
    writeTabToUrl(next);
  }, []);

  const openProfile = useCallback(
    (result: SearchResult) => {
      if (onOpenProfile) onOpenProfile(result);
      else setLocation(`/p/${result.npub}`);
    },
    [onOpenProfile, setLocation],
  );

  // Keep a ref so the render below sees a stable list even mid-stream.
  const rawHits = snapshot?.hits ?? [];
  // The relay only ORDERS by rank — per-card scores come from the shared
  // author-score cache (hashtag-page discipline) for EVERY hit, kind-0
  // included: without this, people cards render bare and the user's
  // verification-display settings have nothing to show.
  const allAuthors = useMemo(() => [...new Set(rawHits.map((h) => h.event.pubkey))], [rawHits]);
  const scoreOf = useAuthorScores(allAuthors);
  // The filters the relay can't do, done here (probed: filter:rank ignored,
  // no hops): Verified only via those scores, reach via the viewer's graph.
  const reach = useNetworkReach(userPubkey);
  const clientState = readFilters(query);
  // The box no longer shows filter tokens — the Filters button says how many are on.
  const activeFilters = activeFilterCount(clientState);
  const hits = useMemo(
    () => clientFilterHits(rawHits, { verifiedOnly: clientState.verifiedOnly, reach: clientState.reach }, { scoreOf, reach }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawHits, clientState.verifiedOnly, clientState.reach, reach, allAuthors.map((pk) => scoreOf(pk)).join(",")],
  );
  const searching = !snapshot || (!snapshot.eose && !snapshot.error && hits.length === 0);
  const noResults = !!snapshot?.eose && hits.length === 0;
  const peopleIdx = useRef(0);
  peopleIdx.current = 0;

  // Recurring events (the "liverpool" monthly-meetup dump) collapse on the
  // event-shaped tabs; a chip expands the rest of each cluster.
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const clustered = tab === "live" || tab === "lists";
  // Apps facet by PLATFORM — a one-tap chip row (Benjamin's "categorize by
  // the chips"), computed from what the results actually run on.
  const [appPlatform, setAppPlatform] = useState<string | null>(null);
  const [appCategory, setAppCategory] = useState<string | null>(null);
  useEffect(() => {
    setAppPlatform(null);
    setAppCategory(null);
  }, [tab, query]);
  const appFacets = useMemo(() => {
    if (tab !== "apps") return [];
    const counts = new Map<string, number>();
    for (const h of hits) {
      for (const w of platformWords(h.event)) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [tab, hits]);
  // Listing t-tags of the current hits — categories. A tag that merely
  // restates a platform word ("android") never doubles as a category.
  const appCategoryTags = useCallback((e: NostrEvent) => {
    const platformSet = new Set(platformWords(e).map((w) => w.toLowerCase()));
    return [...new Set(e.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1].toLowerCase()))].filter(
      (t) => !platformSet.has(t),
    );
  }, []);
  const appCategoryFacets = useMemo(() => {
    if (tab !== "apps") return [];
    const counts = new Map<string, number>();
    for (const h of hits) {
      for (const t of appCategoryTags(h.event)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [tab, hits, appCategoryTags]);
  const [appLicense, setAppLicense] = useState<string | null>(null);
  useEffect(() => setAppLicense(null), [tab, query]);
  const appLicenseOf = (e: NostrEvent) => e.tags.find((t) => t[0] === "license")?.[1]?.trim() ?? null;
  const appLicenseFacets = useMemo(() => {
    if (tab !== "apps") return [];
    const counts = new Map<string, number>();
    for (const h of hits) {
      const lic = appLicenseOf(h.event);
      if (lic) counts.set(lic, (counts.get(lic) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [tab, hits]);
  const displayHits = useMemo(() => {
    let shown = hits;
    if (tab === "apps" && appPlatform) {
      shown = shown.filter((h) => platformWords(h.event).includes(appPlatform));
    }
    if (tab === "apps" && appCategory) {
      shown = shown.filter((h) => appCategoryTags(h.event).includes(appCategory));
    }
    if (tab === "apps" && appLicense) {
      shown = shown.filter((h) => appLicenseOf(h.event) === appLicense);
    }
    if (tab === "media") {
      // Kind 1063 is generic file metadata — Zap Store APKs and other blobs
      // ride it. The Media tab means media: a 1063 stays only when its
      // declared mime is image/video/audio. (Everything still shows the rest.)
      const mimeOf = (e: NostrEvent) => e.tags.find((t) => t[0] === "m")?.[1] ?? "";
      shown = hits.filter((h) => {
        if (h.event.kind !== 1063) return true;
        return /^(image|video|audio)\//.test(mimeOf(h.event));
      });
    }
    if (tab === "lists") {
      // Lists must earn their place: untitled or empty ones are app
      // machine-state, not content (Benjamin's "forced and off" browse).
      // People-packs — the lists a searcher actually wants — lead.
      const titled = (e: NostrEvent) => !!e.tags.find((t) => (t[0] === "title" || t[0] === "name") && t[1]?.trim());
      const itemCount = (e: NostrEvent) => e.tags.filter((t) => ["p", "e", "a", "r"].includes(t[0])).length;
      const isPeoplePack = (e: NostrEvent) =>
        e.tags.some((t) => t[0] === "p") && !e.tags.some((t) => ["e", "a", "r"].includes(t[0]));
      shown = hits.filter((h) => titled(h.event) && itemCount(h.event) > 0);
      shown = [...shown.filter((h) => isPeoplePack(h.event)), ...shown.filter((h) => !isPeoplePack(h.event))];
    }
    if (!clustered) return shown.map((h) => ({ hit: h, collapsedCount: 0, clusterId: "" }));
    const out: { hit: SearchHit; collapsedCount: number; clusterId: string }[] = [];
    for (const cluster of collapseHits(shown)) {
      const id = cluster.primary.event.id;
      const open = expandedClusters.has(id);
      out.push({ hit: cluster.primary, collapsedCount: open ? 0 : cluster.others.length, clusterId: id });
      if (open) for (const h of cluster.others) out.push({ hit: h, collapsedCount: 0, clusterId: "" });
    }
    return out;
  }, [hits, tab, appPlatform, appCategory, appLicense, appCategoryTags, clustered, expandedClusters]);

  const profiles = useMemo(() => profilesOf(hits), [hits]);

  return (
    <div className="w-full max-w-2xl lg:max-w-[62rem] mx-auto mt-4 sm:mt-5 text-left" data-testid="search-results">
      {/* Vertical tabs — underline style on desktop, scrollable on mobile. */}
      {/* The tab strip scrolls on phones; the Filters button stays pinned at
          the right edge OUTSIDE the scroller, so its badge is always in view. */}
      <div className="mb-3 sm:mb-4 -mx-1 flex items-stretch border-b border-slate-100 dark:border-slate-800/60 px-1">
      <div
        role="tablist"
        aria-label="Result types"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="search-tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => changeTab(t.key)}
            className={
              "shrink-0 px-3 py-2 text-xs sm:text-[13px] font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-t " +
              (tab === t.key
                ? "border-brand-primary text-brand-deep dark:text-brand-link"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200")
            }
            data-testid={`search-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>
        {onQueryRewrite && (
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            className={
              "ml-1 shrink-0 inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-t " +
              (filtersOpen
                ? "border-brand-primary text-brand-deep dark:text-brand-link"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200")
            }
            data-testid="search-filters-toggle"
          >
            <SlidersHorizontal className="h-3 w-3" /> Filters
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

      {filtersOpen && onQueryRewrite && <FiltersPanel query={query} pov={pov} userPubkey={userPubkey} onQueryRewrite={onQueryRewrite} />}

      {/* Google anatomy: the knowledge panel is FIRST in the DOM — the top
          card on mobile, the right rail on desktop (flex order). When no
          person clears the confidence bar it renders nothing and the column
          takes the full width. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-center lg:items-start lg:gap-6">
      <KnowledgePanel
        query={query}
        pov={pov}
        userPubkey={userPubkey}
        onOpen={onOpenProfile}
        className="lg:order-2 lg:w-72 lg:shrink-0 lg:sticky lg:top-4"
      />
      <div className="min-w-0 w-full lg:order-1 lg:w-[42rem] lg:flex-none">
      {composed ? (
        <ComposedResults
          query={query}
          pov={pov}
          userPubkey={userPubkey}
          onTabChange={changeTab}
          onOpenProfile={openProfile}
        />
      ) : snapshot?.error ? (
        <div
          className="rounded-xl border border-red-100 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300"
          data-testid="search-error"
        >
          {snapshot.error}
        </div>
      ) : searching ? (
        <div className="space-y-2 sm:space-y-3" data-testid="container-search-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/60 animate-pulse"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 sm:h-3.5 bg-slate-200 dark:bg-slate-700 rounded-full w-28 sm:w-36" />
                <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full w-full max-w-md" />
              </div>
            </div>
          ))}
        </div>
      ) : noResults ? (
        <div className="mt-4 sm:mt-6" data-testid="container-no-results">
          <div className="p-2 rounded-xl sm:rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60">
            <EmptyState
              icon={Radar}
              compact
              title="Nothing found"
              description="Try different words, another tab, or paste an npub directly."
            />
          </div>
        </div>
      ) : (
        <>
          {tab === "apps" && appFacets.length > 0 && (
            <FacetRow className="mb-2" testId="app-facets">
              <button
                type="button"
                onClick={() => setAppPlatform(null)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  appPlatform === null
                    ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"
                }`}
                data-testid="app-facet-all"
              >
                All
              </button>
              {appFacets.map(([platform, count]) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setAppPlatform((cur) => (cur === platform ? null : platform))}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    appPlatform === platform
                      ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"
                  }`}
                  data-testid={`app-facet-${platform.toLowerCase()}`}
                >
                  {platform} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </FacetRow>
          )}
          {tab === "apps" && (appCategoryFacets.length > 0 || appLicenseFacets.length > 0) && (
            <FacetRow className="mb-2.5" testId="app-cat-facets">
              {appCategoryFacets.map(([cat, count]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setAppCategory((cur) => (cur === cat ? null : cat))}
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    appCategory === cat
                      ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-accent/40 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                  data-testid={`app-cat-facet-${cat}`}
                >
                  #{cat} <span className="opacity-60">{count}</span>
                </button>
              ))}
              {appLicenseFacets.map(([lic, count]) => (
                <button
                  key={lic}
                  type="button"
                  onClick={() => setAppLicense((cur) => (cur === lic ? null : lic))}
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                    appLicense === lic
                      ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-accent/40 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                  data-testid={`app-lic-facet-${lic.toLowerCase()}`}
                >
                  {lic} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </FacetRow>
          )}
          {snapshot?.eose && (
            <div className="mb-2 sm:mb-3 px-1">
              <p className="text-xs text-slate-400 dark:text-slate-500" data-testid="text-search-stats">
                About {hits.length} result{hits.length !== 1 ? "s" : ""}
                {snapshot.timeMs != null ? ` (${(snapshot.timeMs / 1000).toFixed(2)} seconds)` : ""}
              </p>
            </div>
          )}
          <div
            className={tab === "apps" || tab === "repos" ? "grid grid-cols-1 gap-2.5 lg:grid-cols-2" : "space-y-2 sm:space-y-3"}
            data-testid="container-search-results"
          >
            {displayHits.map(({ hit, collapsedCount, clusterId }) => {
              const { event } = hit;
              const chip =
                collapsedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedClusters((prev) => new Set(prev).add(clusterId))
                    }
                    className="ml-1 mt-1 rounded-full border border-slate-200 dark:border-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:border-brand-accent/30"
                    data-testid={`cluster-expand-${clusterId}`}
                  >
                    +{collapsedCount} more like this
                  </button>
                ) : null;
              const wrap = (card: React.ReactNode) => (
                <div key={event.id}>
                  {card}
                  {chip}
                </div>
              );
              if (event.kind === 0 && hit.author) {
                const idx = peopleIdx.current++;
                const scored =
                  hit.author.wotRank == null
                    ? { ...hit.author, wotRank: scoreOf(event.pubkey) ?? null }
                    : hit.author;
                return wrap(
                  <PersonCard
                    result={scored}
                    idx={idx}
                    pov={pov}
                    onOpen={openProfile}
                    onPrefetchEnter={onPrefetchEnter}
                    onPrefetchLeave={onPrefetchLeave}
                    showFollowedBy={idx < 3}
                  />
                );
              }
              if (ARTICLE_KINDS.has(event.kind)) {
                return wrap(
                  <EmbeddedArticleCard
                    event={event as MinimalEvent}
                    author={profiles.get(event.pubkey)}
                    trustScore01={scoreOf(event.pubkey) ?? null}
                  />
                );
              }
              if (NOTE_KINDS.has(event.kind)) {
                return wrap(
                  <ShareNoteCard
                    event={event as MinimalEvent}
                    profiles={profiles}
                    eventsById={EMPTY_EVENTS}
                    href={eventPath(event)}
                    showAuthor
                    authorScore={scoreOf(event.pubkey)}
                  />
                );
              }
              const typed = { event, author: hit.author, score: scoreOf(event.pubkey) };
              if (LIVE_KINDS.has(event.kind)) return wrap(<LiveCard {...typed} />);
              if (APP_KINDS.has(event.kind)) return wrap(<AppCard {...typed} />);
              if (REPO_KINDS.has(event.kind)) return wrap(<RepoCard {...typed} />);
              if (LIST_KINDS.has(event.kind)) return wrap(<ListCard {...typed} />);
              if (MEDIA_KINDS.has(event.kind)) return wrap(<MediaCard {...typed} />);
              // Open-set posture: an unmapped kind renders as media-style
              // generic rather than vanishing — the relay may index new kinds
              // before this UI learns them.
              return wrap(<MediaCard {...typed} />);
            })}
          </div>
        </>
      )}
      </div>
      </div>
    </div>
  );
}
