/**
 * "What's happening now" — the home feed behind the landing page's toggle.
 *
 * Grilled 2026-09-03. Signed in, your own perspective leads under "From
 * people you trust"; an "Across Nostr" house-lens block follows. Visitors get
 * only the wider block. Everything is the last 24 hours, to the second, and
 * the streams stay open so new posts keep arriving. No tab strip: the
 * perspective control and one way out sit above the bands, and every band
 * carries its own "More →" into that vertical's browse.
 */
import { useMemo } from "react";
import type { SearchPov, SearchTab, SearchSnapshot } from "@/services/search";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { collapseHits } from "@/lib/searchCollapse";
import { ClusterRows, Section, useSectionStream } from "@/components/search/sections";

const DAY = 86_400;

/** One lens's worth of bands. */
function FeedBlock({
  id,
  kicker,
  pov,
  userPubkey,
  since,
  onBrowse,
}: {
  id: "personal" | "house";
  kicker: string;
  pov: SearchPov;
  userPubkey?: string;
  since: number;
  onBrowse: (tab: SearchTab) => void;
}) {
  const latest = useSectionStream("sort:recent", "notes", pov, userPubkey, 30, since);
  const scoreOf = useAuthorScores(useMemo(() => [...new Set((latest?.hits ?? []).map((h) => h.event.pubkey))], [latest]));
  const latestClusters = useMemo(() => (latest ? collapseHits(latest.hits, undefined, { maxPerAuthor: 2 }) : []), [latest]);
  const settled = (s: SearchSnapshot | null) => !!s && (s.eose || !!s.error);
  const empty = settled(latest) && latestClusters.length === 0;

  return (
    <div className="mt-6 first:mt-0" data-testid={`feed-block-${id}`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500" data-testid={`feed-kicker-${id}`}>
        {kicker}
      </p>
      {latestClusters.length > 0 && (
        <Section id="latest" kicker="Latest" tab="notes" onTabChange={onBrowse} testIdPrefix="feed-band">
          <div className="space-y-0.5">
            {latestClusters.map((c) => (
              <ClusterRows key={c.primary.event.id} cluster={c} scoreOf={scoreOf} query="" />
            ))}
          </div>
        </Section>
      )}
      {!settled(latest) && latestClusters.length === 0 && (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-500" data-testid={`feed-loading-${id}`}>
          Listening…
        </p>
      )}
      {empty && (
        <p className="py-2 text-sm text-slate-400 dark:text-slate-500" data-testid={`feed-empty-${id}`}>
          Quiet in the last 24 hours.
        </p>
      )}
    </div>
  );
}

export function HomeFeed({
  personal,
  userPubkey,
  onHide,
  onBrowse,
  perspective,
}: {
  /** Signed in with a usable perspective: the "From people you trust" block leads. */
  personal: boolean;
  userPubkey?: string;
  onHide: () => void;
  onBrowse: (tab: SearchTab) => void;
  /** The page's Brainstorm / My perspective control (compact). */
  perspective?: React.ReactNode;
}) {
  // One "now" for the whole feed, fixed when it opens, so every band agrees.
  const since = useMemo(() => Math.floor(Date.now() / 1000) - DAY, []);
  return (
    <div className="w-full max-w-2xl mx-auto mt-4 sm:mt-5 text-left" data-testid="home-feed">
      <div className="mb-3 flex items-center justify-between gap-2" data-testid="home-feed-header">
        <div className="flex min-w-0 items-center gap-2">
          {perspective}
        </div>
        <button
          type="button"
          onClick={onHide}
          className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="home-feed-hide"
        >
          Hide the feed ▴
        </button>
      </div>
      {personal && userPubkey && (
        <FeedBlock id="personal" kicker="From people you trust" pov="mywot" userPubkey={userPubkey} since={since} onBrowse={onBrowse} />
      )}
      <FeedBlock id="house" kicker="Across Nostr" pov="nosfabrica" userPubkey={userPubkey} since={since} onBrowse={onBrowse} />
    </div>
  );
}
