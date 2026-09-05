/**
 * The composed page's building blocks, shared by the search's Everything
 * page and the home feed: one section stream per band, a kicker + "More →"
 * frame, and rows that fold an author's near-duplicates behind a chip.
 */
import { useEffect, useMemo, useState } from "react";
import { SectionHeader } from "@/components/ui/section-header";
import { SerpRow } from "@/components/search/SerpRow";
import { getDisplayLabel } from "@/lib/profileSearch";
import type { HitCluster } from "@/lib/searchCollapse";
import { searchStream, type SearchHit, type SearchPov, type SearchSnapshot, type SearchTab } from "@/services/search";

/** Two section streams as one: hits concatenated in order, settled when both are. */
export function mergeSnapshots(a: SearchSnapshot | null, b: SearchSnapshot | null): SearchSnapshot | null {
  if (!a) return b;
  if (!b) return a;
  return { ...a, hits: [...a.hits, ...b.hits], eose: a.eose && b.eose };
}

export function useSectionStream(
  query: string,
  tab: SearchTab,
  pov: SearchPov,
  userPubkey: string | undefined,
  limit: number,
  since?: number,
): SearchSnapshot | null {
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);
  useEffect(() => {
    setSnapshot(null);
    return searchStream(query, { tab, pov, userPubkey, limit, since }, setSnapshot);
  }, [query, tab, pov, userPubkey, limit, since]);
  return snapshot;
}

/**
 * A live stream without the list jumping under the reader: hits keep
 * arriving until the first EOSE; after that, anything new waits behind a
 * count until the reader asks for it (the feed's "3 new" pill).
 */
export function useSettledSnapshot(snapshot: SearchSnapshot | null): {
  hits: SearchHit[];
  pendingCount: number;
  release: () => void;
  settled: boolean;
} {
  const [shown, setShown] = useState<SearchHit[] | null>(null);
  const settled = !!snapshot && (snapshot.eose || !!snapshot.error);
  useEffect(() => {
    if (!snapshot) {
      setShown(null);
      return;
    }
    // Still filling the first page: show everything as it lands. Freeze on EOSE.
    if (!settled) setShown(snapshot.hits);
    else setShown((prev) => prev ?? snapshot.hits);
  }, [snapshot, settled]);
  const live = snapshot?.hits ?? [];
  const hits = shown ?? live;
  const shownIds = useMemo(() => new Set(hits.map((h) => h.event.id)), [hits]);
  const pendingCount = settled ? live.filter((h) => !shownIds.has(h.event.id)).length : 0;
  const release = () => setShown(live);
  return { hits, pendingCount, release, settled };
}

export function Section({
  id,
  kicker,
  tab,
  onTabChange,
  children,
  testIdPrefix = "serp-section",
}: {
  id: string;
  kicker: string;
  tab: SearchTab;
  onTabChange: (t: SearchTab) => void;
  children: React.ReactNode;
  testIdPrefix?: string;
}) {
  return (
    <section className="mt-5 first:mt-0" data-testid={`${testIdPrefix}-${id}`}>
      <div className="mb-2 flex items-baseline gap-2">
        <SectionHeader variant="title" kicker={kicker} className="flex-1" />
        {/* Quiet until hovered: the title carries the section, the link
            only has to be findable. */}
        <button
          type="button"
          onClick={() => onTabChange(tab)}
          className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
          data-testid={`${testIdPrefix === "serp-section" ? "serp-more" : `${testIdPrefix}-more`}-${id}`}
        >
          See all
        </button>
      </div>
      {children}
    </section>
  );
}

export function ClusterRows({
  cluster,
  scoreOf,
  query,
  engagementOf,
}: {
  cluster: HitCluster;
  scoreOf: (pk: string) => number | null | undefined;
  query: string;
  /** Quiet zap / reply counts for a row, when the caller fetched them. */
  engagementOf?: (id: string) => { zaps: number; replies: number } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const authorName = cluster.primary.author ? getDisplayLabel(cluster.primary.author) : "this author";
  return (
    <div>
      <SerpRow
        event={cluster.primary.event}
        author={cluster.primary.author}
        score={scoreOf(cluster.primary.event.pubkey)}
        query={query}
        engagement={engagementOf?.(cluster.primary.event.id) ?? undefined}
      />
      {cluster.others.length > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-2 mt-0.5 rounded-full border border-slate-200 dark:border-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:border-brand-accent/30"
          data-testid={`serp-expand-${cluster.primary.event.id}`}
        >
          +{cluster.others.length} more from {authorName}
        </button>
      )}
      {expanded &&
        cluster.others.map((h) => (
          <SerpRow
            key={h.event.id}
            event={h.event}
            author={h.author}
            score={scoreOf(h.event.pubkey)}
            query={query}
            engagement={engagementOf?.(h.event.id) ?? undefined}
          />
        ))}
    </div>
  );
}
