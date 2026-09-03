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
import { Radar, SlidersHorizontal } from "lucide-react";
import { applyFilters, readFilters, type SearchFilterPatch } from "@/lib/searchSyntax";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { DEFAULT_VERIFIED_LINE, TIER_LABELS, TIER_THRESHOLDS } from "@/services/trustThreshold";
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

import { AppCard, LiveCard, ListCard, MediaCard, RepoCard } from "@/components/search/cards";
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

/**
 * The trust floor in the USER'S OWN ladder vocabulary (their Settings
 * granularity) — never a raw 0–100 ask. Values are the wire numbers the
 * relay's filter:rank:gte: takes, derived from the one threshold source.
 */
function tierFloorOptions(granularity: "simple" | "detailed"): { value: string; label: string }[] {
  const pct = (x: number) => String(Math.round(x * 100));
  if (granularity === "simple") {
    return [
      { value: "", label: "Anyone" },
      { value: pct(DEFAULT_VERIFIED_LINE), label: "Verified only" },
    ];
  }
  return [
    { value: "", label: "Anyone" },
    { value: pct(DEFAULT_VERIFIED_LINE), label: `${TIER_LABELS.low} and up` },
    { value: pct(TIER_THRESHOLDS.medium), label: `${TIER_LABELS.neutral} and up` },
    { value: pct(TIER_THRESHOLDS.medium_high), label: `${TIER_LABELS.trusted} and up` },
    { value: pct(TIER_THRESHOLDS.high), label: `${TIER_LABELS.high} only` },
  ];
}

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

const SORT_OPTIONS = [
  { value: "", label: "Best match" },
  { value: "recent", label: "Newest first" },
  { value: "rank", label: "Most trusted authors" },
  { value: "followers", label: "Most followed authors" },
  { value: "text", label: "Text match only" },
];

/** The five grilled filters. Every control WRITES SYNTAX into the query box
 *  (via onQueryRewrite) — users learn the grammar by watching it appear. */
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
  const [granularity] = useTierGranularity();
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

  const floorOptions = tierFloorOptions(granularity);
  const floorValue = state.minRank != null ? String(state.minRank) : "";
  // A hand-typed value outside the ladder stays honored, shown as itself.
  const customFloor = floorValue !== "" && !floorOptions.some((o) => o.value === floorValue);
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
      <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Show authors
        <select
          className={field}
          value={floorValue}
          onChange={(e) => write({ minRank: e.target.value === "" ? null : Number(e.target.value) })}
          data-testid="filter-min-tier"
        >
          {floorOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          {customFloor && <option value={floorValue}>Custom ({floorValue})</option>}
        </select>
      </label>
      <label className="flex items-center gap-1.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-brand-primary"
          checked={state.includeSpam}
          onChange={(e) => write({ includeSpam: e.target.checked })}
          data-testid="filter-spam"
        />
        Include what your web of trust doesn't rank
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
    return searchStream(effectiveQuery, { tab, pov, userPubkey }, setSnapshot);
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
  const hits = snapshot?.hits ?? [];
  const searching = !snapshot || (!snapshot.eose && !snapshot.error && hits.length === 0);
  const noResults = !!snapshot?.eose && hits.length === 0;
  const peopleIdx = useRef(0);
  peopleIdx.current = 0;

  // Recurring events (the "liverpool" monthly-meetup dump) collapse on the
  // event-shaped tabs; a chip expands the rest of each cluster.
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const clustered = tab === "live" || tab === "lists";
  const displayHits = useMemo(() => {
    if (!clustered) return hits.map((h) => ({ hit: h, collapsedCount: 0, clusterId: "" }));
    const out: { hit: SearchHit; collapsedCount: number; clusterId: string }[] = [];
    for (const cluster of collapseHits(hits)) {
      const id = cluster.primary.event.id;
      const open = expandedClusters.has(id);
      out.push({ hit: cluster.primary, collapsedCount: open ? 0 : cluster.others.length, clusterId: id });
      if (open) for (const h of cluster.others) out.push({ hit: h, collapsedCount: 0, clusterId: "" });
    }
    return out;
  }, [hits, clustered, expandedClusters]);

  const profiles = useMemo(() => profilesOf(hits), [hits]);
  // The relay only ORDERS by rank — per-card scores come from the shared
  // author-score cache (hashtag-page discipline) for EVERY hit, kind-0
  // included: without this, people cards render bare and the user's
  // verification-display settings have nothing to show.
  const allAuthors = useMemo(
    () => [...new Set(hits.map((h) => h.event.pubkey))],
    [hits],
  );
  const scoreOf = useAuthorScores(allAuthors);

  return (
    <div className="w-full max-w-2xl lg:max-w-[62rem] mx-auto mt-4 sm:mt-5 text-left" data-testid="search-results">
      {/* Vertical tabs — underline style on desktop, scrollable on mobile. */}
      <div
        role="tablist"
        aria-label="Result types"
        className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 dark:border-slate-800/60 mb-3 sm:mb-4 -mx-1 px-1"
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
        {onQueryRewrite && (
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            className={
              "ml-auto shrink-0 inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-t " +
              (filtersOpen
                ? "border-brand-primary text-brand-deep dark:text-brand-link"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200")
            }
            data-testid="search-filters-toggle"
          >
            <SlidersHorizontal className="h-3 w-3" /> Filters
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
          {snapshot?.eose && (
            <div className="mb-2 sm:mb-3 px-1">
              <p className="text-xs text-slate-400 dark:text-slate-500" data-testid="text-search-stats">
                About {hits.length} result{hits.length !== 1 ? "s" : ""}
                {snapshot.timeMs != null ? ` (${(snapshot.timeMs / 1000).toFixed(2)} seconds)` : ""}
              </p>
            </div>
          )}
          <div className="space-y-2 sm:space-y-3" data-testid="container-search-results">
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
