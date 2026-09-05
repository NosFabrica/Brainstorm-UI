/**
 * The composed page's building blocks, shared by the search's Everything
 * page and the home feed: one section stream per band, a kicker + "More →"
 * frame, and rows that fold an author's near-duplicates behind a chip.
 */
import { useEffect, useMemo, useState } from "react";
import { useWheelScrollX } from "@/hooks/useWheelScrollX";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
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
  className = "",
}: {
  id: string;
  kicker: string;
  tab: SearchTab;
  onTabChange: (t: SearchTab) => void;
  children: React.ReactNode;
  testIdPrefix?: string;
  className?: string;
}) {
  return (
    <section className={`mt-5 first:mt-0 ${className}`} data-testid={`${testIdPrefix}-${id}`}>
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
  showType = true,
  renderRow,
}: {
  cluster: HitCluster;
  scoreOf: (pk: string) => number | null | undefined;
  query: string;
  /** Quiet zap / reply counts for a row, when the caller fetched them. */
  engagementOf?: (id: string) => { zaps: number; replies: number } | null;
  /** Say the kind on each row only where a section mixes kinds. */
  showType?: boolean;
  /** A different row for this kind of thing — an event row, say. */
  renderRow?: (hit: SearchHit) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const authorName = cluster.primary.author ? getDisplayLabel(cluster.primary.author) : "this author";
  const row = (h: SearchHit) =>
    renderRow ? (
      renderRow(h)
    ) : (
      <SerpRow event={h.event} author={h.author} score={scoreOf(h.event.pubkey)} query={query} engagement={engagementOf?.(h.event.id) ?? undefined} showType={showType} />
    );
  return (
    <div>
      {row(cluster.primary)}
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
      {expanded && cluster.others.map((h) => <div key={h.event.id}>{row(h)}</div>)}
    </div>
  );
}

/**
 * A section's place, held while its stream answers — the title in place and
 * quiet shapes where the content will land, so the page keeps its shape
 * instead of reflowing under the reader. Collapses (the caller renders
 * nothing) when the answer is empty.
 */
export function SectionSkeleton({ id, kicker, shape }: { id: string; kicker: string; shape: "people" | "rows" | "bento" }) {
  return (
    <section className="mt-5 first:mt-0" data-testid={`serp-skeleton-${id}`} aria-busy="true" aria-label={`Loading ${kicker}`}>
      <div className="mb-2 flex items-baseline gap-2">
        <SectionHeader variant="title" kicker={kicker} className="flex-1 opacity-60" />
      </div>
      {shape === "people" && (
        <div className="flex gap-2.5 overflow-hidden -mx-1 px-1">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex w-28 shrink-0 flex-col items-center gap-2 p-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-3 w-16 rounded" />
            </div>
          ))}
        </div>
      )}
      {shape === "rows" && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 px-2 py-3 -mx-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}
      {shape === "bento" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="col-span-2 aspect-[16/9] w-full rounded-2xl sm:row-span-2" />
          <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
          <Skeleton className="hidden aspect-[16/10] w-full rounded-2xl sm:block" />
        </div>
      )}
    </section>
  );
}

/** A one-line, horizontally scrolling row of facet chips, faded at the right edge. */
export function FacetRow({ testId, className = "", children }: { testId: string; className?: string; children: React.ReactNode }) {
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

/** One facet: a pill that is pressed or not, with an optional quiet count. */
export function FacetChip({
  pressed,
  onClick,
  count,
  testId,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  count?: number;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        pressed
          ? "border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link"
          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/40"
      }`}
      data-testid={testId}
    >
      {children}
      {count != null && (
        <>
          {" "}
          <span className="opacity-60">{count}</span>
        </>
      )}
    </button>
  );
}
