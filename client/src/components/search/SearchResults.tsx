/**
 * The results half of the search page — Google anatomy: vertical tabs under
 * the header, a left-aligned column of typed result cards, count line at
 * EOSE. Owns the stream lifecycle: any change to query/tab/POV cancels the
 * in-flight stream and starts a fresh one (a cancelled handle never calls
 * back, so stale results structurally cannot flash).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Radar } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonCard } from "@/components/search/PersonCard";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventPath } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { SearchResult } from "@/lib/profileSearch";
import {
  searchStream,
  TAB_KINDS,
  type SearchHit,
  type SearchPov,
  type SearchSnapshot,
  type SearchTab,
} from "@/services/search";

import { LiveCard, ListCard, MediaCard, RepoCard } from "@/components/search/cards";

const NOTE_KINDS = new Set(TAB_KINDS.notes);
const ARTICLE_KINDS = new Set(TAB_KINDS.articles);
const MEDIA_KINDS = new Set(TAB_KINDS.media);
const CODE_KINDS = new Set(TAB_KINDS.code);
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
  { key: "code", label: "Code & git" },
  { key: "live", label: "Live" },
  { key: "lists", label: "Lists" },
];

const TAB_KEYS = new Set(TABS.map((t) => t.key));

function tabFromUrl(): SearchTab {
  try {
    const t = new URLSearchParams(window.location.search).get("t");
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

export function SearchResults({
  query,
  pov,
  userPubkey,
  onOpenProfile,
  onPrefetchEnter,
  onPrefetchLeave,
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  /** People-card click. Default: the public profile page. */
  onOpenProfile?: (result: SearchResult) => void;
  onPrefetchEnter?: (result: SearchResult) => void;
  onPrefetchLeave?: (result: SearchResult) => void;
}) {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<SearchTab>(tabFromUrl);
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);

  useEffect(() => {
    setSnapshot(null);
    const cancel = searchStream(query, { tab, pov, userPubkey }, setSnapshot);
    return cancel;
  }, [query, tab, pov, userPubkey]);

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

  const profiles = useMemo(() => profilesOf(hits), [hits]);
  // House-POV rings for content authors — the relay only ORDERS by rank, so
  // per-card scores come from the shared author-score cache (hashtag-page
  // discipline: one batched pass, authors beyond the cap stay honest-unrated).
  const contentAuthors = useMemo(
    () => [...new Set(hits.filter((h) => h.event.kind !== 0).map((h) => h.event.pubkey))],
    [hits],
  );
  const scoreOf = useAuthorScores(contentAuthors);

  return (
    <div className="w-full max-w-2xl mx-auto mt-4 sm:mt-5 text-left" data-testid="search-results">
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
      </div>

      {snapshot?.error ? (
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
            {hits.map((hit) => {
              const { event } = hit;
              if (event.kind === 0 && hit.author) {
                const idx = peopleIdx.current++;
                return (
                  <PersonCard
                    key={event.id}
                    result={hit.author}
                    idx={idx}
                    pov={pov}
                    onOpen={openProfile}
                    onPrefetchEnter={onPrefetchEnter}
                    onPrefetchLeave={onPrefetchLeave}
                  />
                );
              }
              if (ARTICLE_KINDS.has(event.kind)) {
                return (
                  <EmbeddedArticleCard
                    key={event.id}
                    event={event as MinimalEvent}
                    author={profiles.get(event.pubkey)}
                    trustScore01={scoreOf(event.pubkey) ?? null}
                  />
                );
              }
              if (NOTE_KINDS.has(event.kind)) {
                return (
                  <ShareNoteCard
                    key={event.id}
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
              if (LIVE_KINDS.has(event.kind)) return <LiveCard key={event.id} {...typed} />;
              if (CODE_KINDS.has(event.kind)) return <RepoCard key={event.id} {...typed} />;
              if (LIST_KINDS.has(event.kind)) return <ListCard key={event.id} {...typed} />;
              if (MEDIA_KINDS.has(event.kind)) return <MediaCard key={event.id} {...typed} />;
              // Open-set posture: an unmapped kind renders as media-style
              // generic rather than vanishing — the relay may index new kinds
              // before this UI learns them.
              return <MediaCard key={event.id} {...typed} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}
