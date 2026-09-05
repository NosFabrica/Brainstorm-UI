/**
 * The results half of the search page — Google anatomy: vertical tabs under
 * the header, a left-aligned column of typed result cards, count line at
 * EOSE. Owns the stream lifecycle: any change to query/tab/POV cancels the
 * in-flight stream and starts a fresh one (a cancelled handle never calls
 * back, so stale results structurally cannot flash).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { ChevronDown, Radar, SlidersHorizontal } from "lucide-react";
import { BROWSE_UNAVAILABLE_SORTS, activeFilterCount, applyFilters, browseSafeQuery, datePreset, readFilters, sinceForPreset, splitFilters, type DatePreset, type SearchFilterPatch } from "@/lib/searchSyntax";
import { clientFilterHits } from "@/lib/clientFilters";
import { useNetworkReach } from "@/hooks/useNetworkReach";
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

import { fetchEventRsvps, fetchGitCommentCounts, fetchGitStatuses, type EventRsvps } from "@/services/search";
import { GIT_STATE_LABEL, foldForks, gitLabelsOf, gitStateOf, isGitItem, peopleBeforeAgents, type GitState } from "@/lib/gitStatus";
import { isMediaFile, isSoundtrackFile } from "@/lib/fileMetadata";
import { AppCard, EventCard, LiveCard, ListCard, MediaCard, RepoCard, TrackCard, platformWords, mediaUrlOf, ListingCard } from "@/components/search/cards";
import { EVENT_WHEN_LABELS, EVENT_WHEN_ORDER, eventWhenCounts, filterEventsByWhen, type EventWhen } from "@/lib/eventFilters";
import { EventDateTile } from "@/components/share/EventDateTile";
import { parseCalendarEvent as parseCal, relativeEventTime as relativeDay } from "@/lib/calendarEvent";
import { isTestTrack, parseTrack } from "@/lib/trackEvent";
import { isSellable, parseListing } from "@/lib/listing";
import { fetchRecentByKinds } from "@/services/nostr";
import { useWavlakeSearch } from "@/hooks/useWavlakeSongs";
import { MusicResults } from "@/components/search/MusicResults";
import { FacetRow } from "@/components/search/sections";
import { KnowledgePanel } from "@/components/search/KnowledgePanel";
import { ComposedResults } from "@/components/search/ComposedResults";
import { collapseHits } from "@/lib/searchCollapse";

const NOTE_KINDS = new Set(TAB_KINDS.notes);
const ARTICLE_KINDS = new Set(TAB_KINDS.articles);
const MEDIA_KINDS = new Set(TAB_KINDS.media);
const APP_KINDS = new Set(TAB_KINDS.apps);
const REPO_KINDS = new Set(TAB_KINDS.repos);

/** One row of the flat list: a hit, and — when it leads a fold — how many it
 *  hides, the chip's words, and (for an opened fork) whose fork it is. */
type DisplayRow = { hit: SearchHit; collapsedCount: number; clusterId: string; chipLabel?: string; forkOf?: string };
const LIVE_KINDS = new Set(TAB_KINDS.live);
const EVENT_KINDS = new Set(TAB_KINDS.events);
const MUSIC_KINDS = new Set(TAB_KINDS.music);
const SHOP_KINDS = new Set(TAB_KINDS.shop);
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

/** Google's row: five verticals in view, the long tail behind More ▾. */
const PRIMARY_TABS: { key: SearchTab; label: string }[] = [
  { key: "everything", label: "Everything" },
  { key: "people", label: "People" },
  { key: "notes", label: "Notes" },
  { key: "articles", label: "Articles" },
  { key: "media", label: "Media" },
];
const MORE_TABS: { key: SearchTab; label: string }[] = [
  { key: "apps", label: "Apps" },
  { key: "shop", label: "Shop" },
  { key: "repos", label: "Repos" },
  { key: "events", label: "Events" },
  { key: "music", label: "Music" },
  { key: "live", label: "Live" },
  { key: "lists", label: "Lists" },
];
const TABS = [...PRIMARY_TABS, ...MORE_TABS];

const TAB_KEYS = new Set(TABS.map((t) => t.key));

const tabClass = (active: boolean) =>
  "shrink-0 px-2.5 sm:px-3 py-1.5 text-xs sm:text-[13px] font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-t " +
  (active
    ? "border-brand-primary text-brand-deep dark:text-brand-link"
    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200");

/** The More ▾ slot: names the folded vertical that is active (so the row
 *  always says where you are), otherwise "More". A plain disclosure, not a
 *  portal — it sits OUTSIDE the scrolling strip so nothing clips it. */
function MoreTabs({ tab, onChange }: { tab: SearchTab; onChange: (next: SearchTab) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = MORE_TABS.find((t) => t.key === tab);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        role="tab"
        aria-selected={!!active}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={tabClass(!!active) + " inline-flex items-center gap-0.5"}
        data-testid="search-tab-more"
      >
        {active ? active.label : "More"}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="More result types"
          className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {MORE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="menuitem"
              aria-current={tab === t.key ? "true" : undefined}
              onClick={() => {
                setOpen(false);
                onChange(t.key);
              }}
              className={
                "flex w-full items-center rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 " +
                (tab === t.key
                  ? "font-semibold text-brand-deep dark:text-brand-link"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800")
              }
              data-testid={`search-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  // What the relay will actually run: a wordless browse cannot be rank- or
  // follower-sorted, so the panel shows the fallback and greys those two.
  const browsing = !splitFilters(query).text;
  const state = readFilters(browsing ? browseSafeQuery(query) : query);
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
      {!userPubkey && (
        <p className="basis-full text-xs text-slate-500 dark:text-slate-400" data-testid="filters-signin">
          Sign in to rank through your own network.{" "}
          <Link href="/login" className="font-medium text-brand-link hover:underline">
            Sign in →
          </Link>
        </p>
      )}
      <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Sort
        <select
          className={field}
          value={state.sort ?? ""}
          onChange={(e) => write({ sort: e.target.value || null })}
          data-testid="filter-sort"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={browsing && BROWSE_UNAVAILABLE_SORTS.has(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        {browsing && (
          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500" data-testid="filter-sort-hint">
            Trust and follower sorts need a search term
          </span>
        )}
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
}) {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<SearchTab>(tabFromUrl);
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);
  // Media on Nostr is mostly a NOTE with a file attached (Rabbit Hole Recap:
  // 254 notes, no media-kind events, a video in most of them). The Media tab
  // asks for notes too and keeps the ones that carry something to look at.
  const [mediaNotes, setMediaNotes] = useState<SearchSnapshot | null>(null);
  // When the query IS a person, the Media tab leads with what they published
  // — their episode posts don't repeat their own name in the text.
  const [panelPerson, setPanelPerson] = useState<SearchResult | null>(null);
  const [personMedia, setPersonMedia] = useState<SearchHit[]>([]);
  useEffect(() => {
    setPersonMedia([]);
    // The Media tab and the composed Everything page both lead with it.
    const everything = tab === "everything" && !/(^|\s)sort:/i.test(query);
    if ((tab !== "media" && !everything) || !panelPerson) return;
    let cancelled = false;
    const who = panelPerson;
    fetchRecentByKinds(who.pubkey, [1, 20, 21, 22, 34235, 34236], 40)
      .then((events) => {
        if (cancelled) return;
        setPersonMedia(
          events
            .filter((e) => mediaUrlOf(e as NostrEvent) !== null)
            .map((e) => ({ event: e as NostrEvent, author: who, rank: null })),
        );
      })
      .catch(() => {
        if (!cancelled) setPersonMedia([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, query, panelPerson?.pubkey]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Everything composes its own purpose-ranked section streams — unless the
  // user typed a sort:, which is them choosing ONE order for one list.
  const userSorted = /(^|\s)sort:/i.test(query);
  const composed = tab === "everything" && !userSorted;
  // Content tabs land on what's fresh by default; People keeps trust rank,
  // and a typed sort: is always honored verbatim.
  // A browse (no words) asking for a sort the relay cannot run over the whole
  // index falls back to newest — the relay never answers it, and a hung
  // request stalls everything else on the connection (RELAY-ASKS #12).
  const safeQuery = browseSafeQuery(query);
  const effectiveQuery =
    !userSorted && tab !== "everything" && tab !== "people"
      ? `${safeQuery} sort:recent`.trim()
      : safeQuery;

  useEffect(() => {
    if (composed) {
      setSnapshot(null);
      return;
    }
    setSnapshot(null);
    // Client-side filters (Verified only, reach) thin the page after the
    // fact — ask the relay for a deeper one so there is something left.
    const clientFiltered = readFilters(effectiveQuery);
    // Events too: the relay only knows created_at, so the When facet works
    // over a deep recent page (probed: no start-tag filter or sort).
    const limit = clientFiltered.verifiedOnly || clientFiltered.reach || tab === "events" ? 300 : undefined;
    return searchStream(effectiveQuery, { tab, pov, userPubkey, limit }, setSnapshot);
  }, [effectiveQuery, tab, pov, userPubkey, composed]);

  useEffect(() => {
    setMediaNotes(null);
    if (composed || tab !== "media") return;
    return searchStream(effectiveQuery, { tab: "notes", pov, userPubkey, limit: 60 }, setMediaNotes);
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

  // Keep a ref so the render below sees a stable list even mid-stream. On the
  // Media tab the notes that carry media join the media-kind hits.
  const rawHits = useMemo(() => {
    const base = snapshot?.hits ?? [];
    // A listing is for sale or it is not a result: sold, hidden and priceless
    // never count, so the count line and the cards agree.
    if (tab === "shop") return base.filter((h) => { const l = parseListing(h.event); return !!l && isSellable(l); });
    if (tab !== "media" || !mediaNotes) return base;
    const seen = new Set(base.map((h) => h.event.id));
    const visual = mediaNotes.hits.filter((h) => !seen.has(h.event.id) && mediaUrlOf(h.event) !== null);
    return [...base, ...visual];
  }, [snapshot, mediaNotes, tab]);
  // The person's own media is its own group above the list; the list drops its duplicates.
  const personMediaIds = useMemo(() => new Set(personMedia.map((h) => h.event.id)), [personMedia]);
  // The relay only ORDERS by rank — per-card scores come from the shared
  // author-score cache (hashtag-page discipline) for EVERY hit, kind-0
  // included: without this, people cards render bare and the user's
  // verification-display settings have nothing to show.
  const allAuthors = useMemo(() => [...new Set(rawHits.map((h) => h.event.pubkey))], [rawHits]);
  const scoreOf = useAuthorScores(allAuthors);
  // The filters the relay can't do, done here (probed: filter:rank ignored,
  // no hops): Verified only via those scores, reach via the viewer's graph.
  const reach = useNetworkReach(userPubkey);
  const clientState = readFilters(safeQuery);
  // The box no longer shows filter tokens — the Filters button says how many are on.
  const activeFilters = activeFilterCount(clientState);
  const hits = useMemo(
    () => clientFilterHits(rawHits, { verifiedOnly: clientState.verifiedOnly, reach: clientState.reach }, { scoreOf, reach }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawHits, clientState.verifiedOnly, clientState.reach, reach, allAuthors.map((pk) => scoreOf(pk)).join(",")],
  );
  // Wavlake is the Music tab's second source: the same words, its catalogue.
  const wavlake = useWavlakeSearch(query, tab === "music");
  const mediaSettled = tab !== "media" || !!mediaNotes?.eose || !!mediaNotes?.error;
  const searching =
    personMedia.length === 0 &&
    (!snapshot || (!snapshot.eose && !snapshot.error && hits.length === 0 && (tab !== "music" || wavlake.loading)) || (tab === "media" && !mediaSettled && hits.length === 0));
  const noResults = !!snapshot?.eose && mediaSettled && hits.length === 0 && personMedia.length === 0 && (tab !== "music" || (!wavlake.loading && wavlake.songs.length === 0));
  // What the count line counts: every source the tab shows.
  const shownCount = hits.length + (tab === "music" ? wavlake.songs.length : 0) + (tab === "media" ? personMedia.filter((h) => !hits.some((x) => x.event.id === h.event.id)).length : 0);
  const peopleIdx = useRef(0);
  peopleIdx.current = 0;

  // Recurring events (the "liverpool" monthly-meetup dump) collapse on the
  // event-shaped tabs; a chip expands the rest of each cluster.
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const clustered = tab === "events" || tab === "live" || tab === "lists";
  // Events facet by WHEN — Upcoming by default (soonest first); with nothing
  // upcoming the tab shows what just happened and says so.
  const [eventWhen, setEventWhen] = useState<EventWhen>("upcoming");
  useEffect(() => setEventWhen("upcoming"), [query]);
  const eventCounts = useMemo(() => (tab === "events" ? eventWhenCounts(hits) : null), [tab, hits]);
  const eventsFellBack = tab === "events" && eventWhen === "upcoming" && !!eventCounts && eventCounts.upcoming === 0 && eventCounts.past > 0;
  const effectiveWhen: EventWhen = eventsFellBack ? "past" : eventWhen;
  // Apps facet by PLATFORM — a one-tap chip row (Benjamin's "categorize by
  // the chips"), computed from what the results actually run on.
  const [appPlatform, setAppPlatform] = useState<string | null>(null);
  const [appCategory, setAppCategory] = useState<string | null>(null);
  const [shopCategory, setShopCategory] = useState<string | null>(null);
  // Repos tab: what became of each issue and patch — one request per page,
  // keyed by item id (NIP-34 status events, newest wins; none means open).
  const [repoState, setRepoState] = useState<GitState | null>(null);
  const [gitStatuses, setGitStatuses] = useState<Map<string, { kind: number; at: number }>>(new Map());
  const [gitComments, setGitComments] = useState<Map<string, number>>(new Map());
  // Events tab: who is going — one request per page, keyed by event coordinate.
  const [eventRsvps, setEventRsvps] = useState<Map<string, EventRsvps>>(new Map());
  const eventAddresses = useMemo(
    () =>
      tab === "events"
        ? hits.filter((h) => h.event.kind === 31922 || h.event.kind === 31923).map((h) => `${h.event.kind}:${h.event.pubkey}:${h.event.tags.find((t) => t[0] === "d")?.[1] ?? ""}`)
        : [],
    [hits, tab],
  );
  const eventAddrKey = eventAddresses.join(",");
  useEffect(() => {
    if (!eventAddrKey) {
      setEventRsvps(new Map());
      return;
    }
    let alive = true;
    void fetchEventRsvps(eventAddrKey.split(",")).then((m) => {
      if (alive) setEventRsvps(m);
    });
    return () => {
      alive = false;
    };
  }, [eventAddrKey]);
  const rsvpsOf = (e: NostrEvent) => eventRsvps.get(`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`);
  const gitItemIds = useMemo(
    () => (tab === "repos" ? hits.filter((h) => isGitItem(h.event.kind)).map((h) => h.event.id) : []),
    [hits, tab],
  );
  const gitIdsKey = gitItemIds.join(",");
  useEffect(() => {
    if (!gitIdsKey) {
      setGitStatuses(new Map());
      return;
    }
    let alive = true;
    const ids = gitIdsKey.split(",");
    void fetchGitStatuses(ids).then((m) => {
      if (alive) setGitStatuses(m);
    });
    void fetchGitCommentCounts(ids).then((m) => {
      if (alive) setGitComments(m);
    });
    return () => {
      alive = false;
    };
  }, [gitIdsKey]);
  const stateOf = (e: NostrEvent): GitState | null => (isGitItem(e.kind) ? gitStateOf(gitStatuses.get(e.id)?.kind, e.kind) : null);
  const [repoLabel, setRepoLabel] = useState<string | null>(null);
  // The labels maintainers actually used on these results, most common first.
  const repoLabelFacets = useMemo(() => {
    if (tab !== "repos") return [] as [string, number][];
    const counts = new Map<string, number>();
    for (const h of hits) {
      if (!isGitItem(h.event.kind)) continue;
      for (const l of gitLabelsOf(h.event)) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [hits, tab]);
  const repoStateFacets = useMemo(() => {
    if (tab !== "repos") return [] as [GitState, number][];
    const counts = new Map<GitState, number>();
    for (const h of hits) {
      const st = stateOf(h.event);
      if (st) counts.set(st, (counts.get(st) ?? 0) + 1);
    }
    const order: GitState[] = ["open", "merged", "resolved", "closed", "draft"];
    return order.filter((k) => counts.has(k)).map((k) => [k, counts.get(k)!] as [GitState, number]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, tab, gitStatuses]);
  useEffect(() => {
    setAppPlatform(null);
    setAppCategory(null);
    setShopCategory(null);
  }, [tab, query]);
  // The listings' own categories, counted — the Shop's facets.
  const shopFacets = useMemo(() => {
    if (tab !== "shop") return [];
    const counts = new Map<string, number>();
    for (const h of hits) for (const c of parseListing(h.event)?.categories ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [tab, hits]);
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
  const displayHits = useMemo<DisplayRow[]>(() => {
    let shown = hits;
    if (tab === "events") shown = filterEventsByWhen(shown, effectiveWhen);
    // A 31337 without a title and audio is not a song (the kind is abused).
    if (tab === "music") shown = shown.filter((h) => parseTrack(h.event) !== null && !isTestTrack(h.event));
    if (tab === "apps" && appPlatform) {
      shown = shown.filter((h) => platformWords(h.event).includes(appPlatform));
    }
    if (tab === "apps" && appCategory) {
      shown = shown.filter((h) => appCategoryTags(h.event).includes(appCategory));
    }
    if (tab === "apps" && appLicense) {
      shown = shown.filter((h) => appLicenseOf(h.event) === appLicense);
    }
    if (tab === "shop" && shopCategory) {
      shown = shown.filter((h) => (parseListing(h.event)?.categories ?? []).includes(shopCategory));
    }
    if (tab === "repos" && repoState) {
      // A state names issues and patches; repo announcements have none.
      shown = shown.filter((h) => stateOf(h.event) === repoState);
    }
    if (tab === "repos" && repoLabel) {
      shown = shown.filter((h) => gitLabelsOf(h.event).includes(repoLabel));
    }
    if (tab === "repos") {
      // People's issues before agents' — the partition Latest uses for feeds.
      shown = peopleBeforeAgents(shown, (h) => ({ event: h.event, author: h.author }));
    }
    if (tab === "media") {
      // Kind 1063 is generic file metadata — Zap Store APKs and other blobs
      // ride it. The Media tab means media: a 1063 stays only when its
      // declared mime is image/video/audio, and not when it is a video's
      // reusable soundtrack (lib/fileMetadata). Everything still shows the rest.
      shown = hits.filter((h) => h.event.kind !== 1063 || (isMediaFile(h.event) && !isSoundtrackFile(h.event)));
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
    if (tab === "repos") {
      // One codebase, one card: forks fold behind the most trusted
      // maintainer's announcement and open on a tap, each naming its parent.
      const repoName = (h: SearchHit) => h.event.tags.find((t) => t[0] === "name")?.[1] ?? h.event.tags.find((t) => t[0] === "d")?.[1] ?? "the original";
      const folded: DisplayRow[] = [];
      for (const g of foldForks(shown, (h) => ({ event: h.event, score: h.author?.wotRank ?? scoreOf(h.event.pubkey) ?? null }))) {
        const id = g.primary.event.id;
        const open = expandedClusters.has(id);
        const n = g.forks.length;
        folded.push({ hit: g.primary, collapsedCount: open ? 0 : n, clusterId: id, chipLabel: `${n} ${n === 1 ? "fork" : "forks"}` });
        if (open) for (const f of g.forks) folded.push({ hit: f, collapsedCount: 0, clusterId: "", forkOf: repoName(g.primary) });
      }
      return folded;
    }
    if (!clustered) return shown.map((h) => ({ hit: h, collapsedCount: 0, clusterId: "" }));
    const out: DisplayRow[] = [];
    for (const cluster of collapseHits(shown)) {
      const id = cluster.primary.event.id;
      const open = expandedClusters.has(id);
      out.push({ hit: cluster.primary, collapsedCount: open ? 0 : cluster.others.length, clusterId: id });
      if (open) for (const h of cluster.others) out.push({ hit: h, collapsedCount: 0, clusterId: "" });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, tab, appPlatform, appCategory, appLicense, shopCategory, repoState, repoLabel, gitStatuses, appCategoryTags, clustered, expandedClusters, effectiveWhen, scoreOf]);

  // The Events tab is a timeline: the first card of each day carries a header
  // that says the date once — "Today · Fri, Sep 4" — so cards can lead with
  // their time. Undated events gather at the end.
  const eventDayHeaders = useMemo(() => {
    const out = new Map<string, { key: string; startSec: number; label: string }>();
    if (tab !== "events") return out;
    let last: string | null = null;
    for (const row of displayHits) {
      const cal = parseCal(row.hit.event);
      const d = cal.startSec ? new Date(cal.startSec * 1000) : null;
      const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "tba";
      if (key === last) continue;
      last = key;
      const rel = d ? relativeDay(cal.startSec) : "";
      const dayWord = rel === "Today" || rel === "Tomorrow" || rel === "Yesterday" ? rel : null;
      const long = d ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
      out.set(row.hit.event.id, { key, startSec: cal.startSec, label: d ? (dayWord ? `${dayWord} · ${long}` : long) : "Date to be announced" });
    }
    return out;
  }, [displayHits, tab]);

  const profiles = useMemo(() => profilesOf(hits), [hits]);

  return (
    <div className="w-full max-w-2xl lg:max-w-[62rem] mx-auto mt-4 sm:mt-5 text-left" data-testid="search-results">
      {/* One quiet row, Google's anatomy: five tabs (scrolling on phones),
          then pinned at the right edge — More ▾, the perspective control and
          Filters — so nothing a person needs ever scrolls out of view. */}
      <div
        className="mb-2 sm:mb-3 -mx-1 flex items-stretch border-b border-slate-100 dark:border-slate-800/60 px-1"
        data-testid="search-toolbar"
      >
        <div
          role="tablist"
          aria-label="Result types"
          className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-testid="search-tabs"
        >
          {PRIMARY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => changeTab(t.key)}
              className={tabClass(tab === t.key)}
              data-testid={`search-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1 sm:gap-2">
          <MoreTabs tab={tab} onChange={changeTab} />
          {perspective}
          {onQueryRewrite && (
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-label="Filters"
              onClick={() => setFiltersOpen((v) => !v)}
              className={tabClass(filtersOpen) + " inline-flex items-center gap-1 !px-2 sm:!px-2.5"}
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
        onPerson={setPanelPerson}
        className="lg:order-2 lg:w-72 lg:shrink-0 lg:sticky lg:top-4"
      />
      <div className="min-w-0 w-full lg:order-1 lg:w-[42rem] lg:flex-none">
      {composed ? (
        <ComposedResults
          query={query}
          personMedia={personMedia}
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
          {tab === "events" && eventCounts && (
            <div className="mb-2.5">
              <FacetRow testId="event-facets">
                {EVENT_WHEN_ORDER.filter((when) => !((when === "today" || when === "weekend") && eventCounts[when] === 0)).map((when) => (
                  <button
                    key={when}
                    type="button"
                    aria-pressed={effectiveWhen === when}
                    onClick={() => setEventWhen(when)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      effectiveWhen === when
                        ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"
                    }`}
                    data-testid={`event-facet-${when}`}
                  >
                    {EVENT_WHEN_LABELS[when]} <span className="opacity-60">{eventCounts[when]}</span>
                  </button>
                ))}
              </FacetRow>
              {eventsFellBack && (
                <p className="mt-1 px-1 text-xs text-slate-400 dark:text-slate-500" data-testid="event-facets-note">
                  No upcoming events for this search — showing past events.
                </p>
              )}
              {displayHits.length === 0 && !eventsFellBack && (
                <p className="mt-1 px-1 text-xs text-slate-400 dark:text-slate-500" data-testid="event-facets-empty">
                  No {EVENT_WHEN_LABELS[effectiveWhen].toLowerCase()} events here — try another window.
                </p>
              )}
            </div>
          )}
          {tab === "repos" && (repoStateFacets.length > 0 || repoLabelFacets.length > 0) && (
            <FacetRow className="mb-2" testId="repo-state-facets">
              <button
                type="button"
                onClick={() => setRepoState(null)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${repoState === null ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"}`}
                data-testid="repo-state-all"
              >
                All
              </button>
              {repoStateFacets.map(([st, count]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setRepoState(repoState === st ? null : st)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${repoState === st ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"}`}
                  data-testid={`repo-state-${st}`}
                >
                  {GIT_STATE_LABEL[st]} {count}
                </button>
              ))}
              {repoStateFacets.length > 0 && repoLabelFacets.length > 0 && (
                <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
              )}
              {repoLabelFacets.map(([label, count]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setRepoLabel(repoLabel === label ? null : label)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${repoLabel === label ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"}`}
                  data-testid={`repo-label-${label}`}
                >
                  {label} {count}
                </button>
              ))}
            </FacetRow>
          )}
          {tab === "shop" && shopFacets.length > 0 && (
            <FacetRow className="mb-2" testId="shop-facets">
              <button
                type="button"
                onClick={() => setShopCategory(null)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  shopCategory === null
                    ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"
                }`}
                data-testid="shop-facet-all"
              >
                All
              </button>
              {shopFacets.map(([cat, count]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setShopCategory((cur) => (cur === cat ? null : cat))}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    shopCategory === cat
                      ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"
                  }`}
                  data-testid={`shop-facet-${cat}`}
                >
                  {cat} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </FacetRow>
          )}
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
                About {shownCount} result{shownCount !== 1 ? "s" : ""}
                {snapshot.timeMs != null ? ` (${(snapshot.timeMs / 1000).toFixed(2)} seconds)` : ""}
              </p>
            </div>
          )}
          {tab === "music" ? (
            <MusicResults hits={displayHits.map((d) => d.hit)} query={query} wavlake={wavlake} scoreOf={scoreOf} onOpenProfile={openProfile} />
          ) : (
          <div
            className={
              tab === "shop"
                ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3"
                : tab === "apps" || tab === "repos"
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
                    <MediaCard key={h.event.id} event={h.event} author={h.author} score={scoreOf(h.event.pubkey)} />
                  ))}
                </div>
              </div>
            )}
            {displayHits.filter((h) => !(tab === "media" && personMediaIds.has(h.hit.event.id))).map(({ hit, collapsedCount, clusterId, chipLabel, forkOf }) => {
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
                    {chipLabel ?? `+${collapsedCount} more like this`}
                  </button>
                ) : null;
              // Grid tabs (Apps, Repos) stretch every cell so a row of cards
              // shares one height; list tabs are unaffected by h-full.
              const day = eventDayHeaders.get(event.id);
              const wrap = (card: React.ReactNode) => (
                <div key={event.id} className="h-full">
                  {day && (
                    <div className={`flex items-center gap-2.5 ${eventDayHeaders.keys().next().value === event.id ? "" : "pt-3"} pb-1.5`} data-testid={`event-day-${day.key}`}>
                      {day.startSec > 0 ? (
                        <EventDateTile startSec={day.startSec} size="sm" testId="day-header-tile" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{day.label}</span>
                      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
                    </div>
                  )}
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
              if (NOTE_KINDS.has(event.kind) && tab !== "media") {
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
              if (EVENT_KINDS.has(event.kind)) {
                const r = rsvpsOf(event);
                return wrap(<EventCard {...typed} going={r?.going ?? 0} faces={r?.faces ?? []} />);
              }
              if (MUSIC_KINDS.has(event.kind)) return wrap(<TrackCard {...typed} />);
              if (SHOP_KINDS.has(event.kind)) return wrap(<ListingCard {...typed} />);
              if (LIVE_KINDS.has(event.kind)) return wrap(<LiveCard {...typed} />);
              if (APP_KINDS.has(event.kind)) return wrap(<AppCard {...typed} />);
              if (REPO_KINDS.has(event.kind)) return wrap(<RepoCard {...typed} state={stateOf(event) ?? undefined} comments={gitComments.get(event.id)} forkOf={forkOf} />);
              if (LIST_KINDS.has(event.kind)) return wrap(<ListCard {...typed} />);
              if (MEDIA_KINDS.has(event.kind)) return wrap(<MediaCard {...typed} />);
              // Open-set posture: an unmapped kind renders as media-style
              // generic rather than vanishing — the relay may index new kinds
              // before this UI learns them.
              return wrap(<MediaCard {...typed} />);
            })}
          </div>
          )}
        </>
      )}
      </div>
      </div>
    </div>
  );
}
