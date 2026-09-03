/**
 * The composed Everything page — Google's front-page anatomy, honestly
 * earned: parallel sections, each ranked by what matters for THAT section.
 * People answer in ~0.5s and paint first; Latest asks the relay for
 * sort:recent (the news cluster — where the Liverpool fan's transfer news
 * lives); Articles keep best-match; Happening collapses recurring events;
 * Media rides a compact row. Sections with nothing to show don't render.
 */
import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing, TierWordChip } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { SerpRow } from "@/components/search/SerpRow";
import { collapseHits, type HitCluster } from "@/lib/searchCollapse";
import { visitedPubkeys } from "@/lib/recentSearches";
import { useWheelScrollX } from "@/hooks/useWheelScrollX";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import {
  searchStream,
  type SearchHit,
  type SearchPov,
  type SearchSnapshot,
  type SearchTab,
} from "@/services/search";

function useSectionStream(query: string, tab: SearchTab, pov: SearchPov, userPubkey: string | undefined, limit: number) {
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null);
  useEffect(() => {
    setSnapshot(null);
    return searchStream(query, { tab, pov, userPubkey, limit }, setSnapshot);
  }, [query, tab, pov, userPubkey, limit]);
  return snapshot;
}

function Section({
  id,
  kicker,
  tab,
  onTabChange,
  children,
}: {
  id: string;
  kicker: string;
  tab: SearchTab;
  onTabChange: (t: SearchTab) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0" data-testid={`serp-section-${id}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <SectionHeader kicker={kicker} className="flex-1" />
        <button
          type="button"
          onClick={() => onTabChange(tab)}
          className="shrink-0 text-xs font-medium text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
          data-testid={`serp-more-${id}`}
        >
          More →
        </button>
      </div>
      {children}
    </section>
  );
}

/** Compact person chip for the People strip. */
function PersonChip({
  person,
  score,
  visited,
  onOpen,
}: {
  person: SearchResult;
  score: number | null;
  visited: boolean;
  onOpen: (p: SearchResult) => void;
}) {
  const tierRing = useTierRing();
  const pk8 = person.pubkey.slice(0, 8);
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      className="flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 p-3 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid={`serp-person-${pk8}`}
    >
      <Avatar className={`h-12 w-12 border-2 border-slate-200/80 dark:border-slate-800/80 ${tierRing(score) ?? ""}`}>
        {person.picture ? <AvatarImage src={person.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <span className="w-full truncate text-center text-xs font-semibold text-slate-800 dark:text-slate-100">
        {getDisplayLabel(person)}
      </span>
      <TierWordChip score01={score} />
      {visited && (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500"
          data-testid={`visited-${pk8}`}
        >
          <Clock className="h-2.5 w-2.5" /> Visited
        </span>
      )}
    </button>
  );
}

function ClusterRows({
  cluster,
  scoreOf,
  query,
}: {
  cluster: HitCluster;
  scoreOf: (pk: string) => number | null | undefined;
  query: string;
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
          <SerpRow key={h.event.id} event={h.event} author={h.author} score={scoreOf(h.event.pubkey)} query={query} />
        ))}
    </div>
  );
}

export function ComposedResults({
  query,
  pov,
  userPubkey,
  onTabChange,
  onOpenProfile,
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  onTabChange: (t: SearchTab) => void;
  onOpenProfile?: (person: SearchResult) => void;
}) {
  const people = useSectionStream(query, "people", pov, userPubkey, 8);
  // Every CONTENT section leads with what's fresh (Benjamin's call:
  // scattered timestamps read as random) — the relay sorts, we ask for
  // recent. People stays trust-ranked; there are no timestamps to scatter.
  const fresh = `${query} sort:recent`.trim();
  const latest = useSectionStream(fresh, "notes", pov, userPubkey, 10);
  const articles = useSectionStream(fresh, "articles", pov, userPubkey, 5);
  const happening = useSectionStream(fresh, "live", pov, userPubkey, 12);
  const media = useSectionStream(fresh, "media", pov, userPubkey, 8);

  const allHits = useMemo(
    () =>
      [people, latest, articles, happening, media]
        .flatMap((s) => s?.hits ?? [])
        .map((h) => h.event.pubkey),
    [people, latest, articles, happening, media],
  );
  const scoreOf = useAuthorScores(useMemo(() => [...new Set(allHits)], [allHits]));

  const visited = useMemo(() => visitedPubkeys(), []);
  // The strip scrolls with a plain mouse wheel too — same feel as the facet chips.
  const stripRef = useWheelScrollX();
  const peopleOrdered = useMemo(() => {
    const hits = people?.hits.filter((h) => h.author) ?? [];
    // Transparent on-device personalization: faces you've opened lead.
    return [...hits].sort(
      (a, b) => Number(visited.has(b.event.pubkey)) - Number(visited.has(a.event.pubkey)),
    );
  }, [people, visited]);

  const happeningClusters = useMemo(
    () => (happening ? collapseHits(happening.hits, undefined, { maxPerAuthor: 2 }) : []),
    [happening],
  );

  const sections = [people, latest, articles, happening, media];
  const anyContent = sections.some((s) => (s?.hits.length ?? 0) > 0);
  const allSettled = sections.every((s) => s?.eose || s?.error);
  // EVERY section collapses near-duplicates — live verification found the
  // Latest section dominated by one author's three near-identical posts
  // within minutes of shipping the Happening-only version.
  const clustersOf = (snapshot: SearchSnapshot | null) =>
    (snapshot ? collapseHits(snapshot.hits, undefined, { maxPerAuthor: 2 }) : []).map((c) => (
      <ClusterRows key={c.primary.event.id} cluster={c} scoreOf={scoreOf} query={query} />
    ));

  return (
    <div data-testid="composed-results">
      {!anyContent && !allSettled && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400 dark:text-slate-500" data-testid="composed-loading">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}
      {!anyContent && allSettled && (
        <p className="py-6 text-sm text-slate-500 dark:text-slate-400" data-testid="composed-empty">
          Nothing found — try different words, or a specific tab.
        </p>
      )}

      {peopleOrdered.length > 0 && (
        <Section id="people" kicker="People" tab="people" onTabChange={onTabChange}>
          {/* More people than fit → arrow paging, Google-carousel style.
              Touch scrolling still works; the arrows are for mouse users
              who otherwise see a stagnant strip. */}
          <div className="relative">
            <div
              ref={stripRef}
              className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)]"
              data-testid="people-strip"
            >
              {peopleOrdered.map((h) => (
                <PersonChip
                  key={h.event.pubkey}
                  person={h.author!}
                  score={h.author!.wotRank ?? scoreOf(h.event.pubkey) ?? null}
                  visited={visited.has(h.event.pubkey)}
                  onOpen={(p) => onOpenProfile?.(p)}
                />
              ))}
            </div>
          </div>
        </Section>
      )}

      {(latest?.hits.length ?? 0) > 0 && (
        <Section id="latest" kicker="Latest" tab="notes" onTabChange={onTabChange}>
          <div className="space-y-0.5">{clustersOf(latest)}</div>
        </Section>
      )}

      {(articles?.hits.length ?? 0) > 0 && (
        <Section id="articles" kicker="Articles" tab="articles" onTabChange={onTabChange}>
          <div className="space-y-0.5">{clustersOf(articles)}</div>
        </Section>
      )}

      {happeningClusters.length > 0 && (
        <Section id="happening" kicker="Happening" tab="live" onTabChange={onTabChange}>
          <div className="space-y-1">
            {happeningClusters.map((c) => (
              <ClusterRows key={c.primary.event.id} cluster={c} scoreOf={scoreOf} query={query} />
            ))}
          </div>
        </Section>
      )}

      {(media?.hits.length ?? 0) > 0 && (
        <Section id="media" kicker="Media" tab="media" onTabChange={onTabChange}>
          <div className="space-y-0.5">{clustersOf(media)}</div>
        </Section>
      )}
    </div>
  );
}
