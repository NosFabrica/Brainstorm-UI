/**
 * The composed Everything page — Google's front-page anatomy, honestly
 * earned: parallel sections, each ranked by what matters for THAT section.
 * People answer in ~0.5s and paint first; Latest asks the relay for
 * sort:recent (the news cluster — where the Liverpool fan's transfer news
 * lives); Articles keep best-match; Happening collapses recurring events;
 * Media rides a compact row. Sections with nothing to show don't render.
 */
import { useEffect, useMemo, useState } from "react";
import { ListingCard, TrackCard, WavlakeSongCard } from "@/components/search/cards";
import { isSellable, parseListing } from "@/lib/listing";
import { noteTitle } from "@/lib/noteTitle";
import { useWavlakeSongs } from "@/hooks/useWavlakeSongs";
import { parseTrack } from "@/lib/trackEvent";
import { setPlaylist } from "@/lib/audioPlayer";
import { Clock, Loader2 } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing, TierWordChip } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { SerpRow } from "@/components/search/SerpRow";
import { ArticlesBento, MediaTiles, TopStories, hasVisual, pickTopStories } from "@/components/search/RichSections";
import { collapseHits } from "@/lib/searchCollapse";
import { ClusterRows, Section, mergeSnapshots, useSectionStream } from "@/components/search/sections";
import { filterEventsByWhen } from "@/lib/eventFilters";
import { clientFilterHits } from "@/lib/clientFilters";
import { readFilters } from "@/lib/searchSyntax";
import { useNetworkReach } from "@/hooks/useNetworkReach";
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

export function ComposedResults({
  query,
  pov,
  userPubkey,
  onTabChange,
  onOpenProfile,
  personMedia = [],
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  onTabChange: (t: SearchTab) => void;
  /** When the query IS a person: their own media, which leads the Media section. */
  personMedia?: SearchHit[];
  onOpenProfile?: (person: SearchResult) => void;
}) {
  const people = useSectionStream(query, "people", pov, userPubkey, 8);
  // Every CONTENT section leads with what's fresh (Benjamin's call:
  // scattered timestamps read as random) — the relay sorts, we ask for
  // recent. People stays trust-ranked; there are no timestamps to scatter.
  const fresh = `${query} sort:recent`.trim();
  const latest = useSectionStream(fresh, "notes", pov, userPubkey, 10);
  const articles = useSectionStream(fresh, "articles", pov, userPubkey, 5);
  // Happening = calendar events AND live streams, two verticals since the
  // Events split; events lead (a meetup you can still attend beats a replay).
  const happeningEvents = useSectionStream(fresh, "events", pov, userPubkey, 12);
  const happeningLive = useSectionStream(fresh, "live", pov, userPubkey, 8);
  const happening = useMemo(
    () =>
      mergeSnapshots(
        // Happening means now or next: past meetups don't lead the page
        // just because they were posted recently.
        happeningEvents ? { ...happeningEvents, hits: filterEventsByWhen(happeningEvents.hits, "upcoming") } : null,
        happeningLive,
      ),
    [happeningEvents, happeningLive],
  );
  const media = useSectionStream(fresh, "media", pov, userPubkey, 8);
  // Listen: native tracks (kind 31337) that match the words — best match, not
  // recency, because "jazz" should find jazz. The kind is abused for game
  // state and ad-skip data, so only hits that parse as a song count.
  const music = useSectionStream(query, "music", pov, userPubkey, 12);
  // Shop: things for sale that match the words — best match, since "cashmere"
  // should find cashmere. Sold, hidden and priceless are gated (lib/listing).
  const shop = useSectionStream(query, "shop", pov, userPubkey, 12);

  const allHits = useMemo(
    () =>
      [people, latest, articles, happening, media, music, shop]
        .flatMap((s) => s?.hits ?? [])
        .map((h) => h.event.pubkey),
    [people, latest, articles, happening, media, music, shop],
  );
  const scoreOf = useAuthorScores(useMemo(() => [...new Set(allHits)], [allHits]));
  // The client-side filters (Verified only, reach) apply here too, so the
  // composed page and the tabs agree on what the box says.
  const reach = useNetworkReach(userPubkey);
  const clientState = readFilters(query);
  const filtered = (s: SearchSnapshot | null): SearchSnapshot | null =>
    s ? { ...s, hits: clientFilterHits(s.hits, { verifiedOnly: clientState.verifiedOnly, reach: clientState.reach }, { scoreOf, reach }) } : null;
  const peopleF = filtered(people);
  const latestF = filtered(latest);
  const articlesF = filtered(articles);
  const happeningF = filtered(happening);
  const mediaF = filtered(media);
  const musicF = filtered(music);
  const shopF = filtered(shop);
  // Two per seller at most, four in all — one shop's forty mugs are not the row.
  const shopRow = useMemo(() => {
    const perSeller = new Map<string, number>();
    const out: SearchHit[] = [];
    for (const h of shopF?.hits ?? []) {
      const l = parseListing(h.event);
      if (!l || !isSellable(l)) continue;
      const n = perSeller.get(h.event.pubkey) ?? 0;
      if (n >= 2) continue;
      perSeller.set(h.event.pubkey, n + 1);
      out.push(h);
      if (out.length >= 4) break;
    }
    return out;
  }, [shopF]);
  // Wavlake is the second source: the same words, its catalogue. Native
  // tracks lead (Nostr's own, trust-ranked); Wavlake's fill the row.
  const wavlake = useWavlakeSongs(query, true);
  const listen = useMemo(() => (musicF?.hits ?? []).filter((h) => parseTrack(h.event) !== null).slice(0, 4), [musicF]);
  const listenWavlake = useMemo(() => wavlake.songs.slice(0, Math.max(0, 4 - listen.length)), [wavlake.songs, listen.length]);
  // The row is a queue: a song that ends hands off to the next one shown.
  useEffect(() => {
    if (listen.length + listenWavlake.length === 0) return;
    setPlaylist([
      ...listen.map((h) => parseTrack(h.event)!).map((tr) => ({ id: tr.id, src: tr.audio })),
      ...listenWavlake.map((s) => ({ id: s.id, src: s.audio })),
    ]);
  }, [listen, listenWavlake]);

  const visited = useMemo(() => visitedPubkeys(), []);
  // The strip scrolls with a plain mouse wheel too — same feel as the facet chips.
  const stripRef = useWheelScrollX();
  const peopleOrdered = useMemo(() => {
    const hits = peopleF?.hits.filter((h) => h.author) ?? [];
    // Transparent on-device personalization: faces you've opened lead.
    return [...hits].sort(
      (a, b) => Number(visited.has(b.event.pubkey)) - Number(visited.has(a.event.pubkey)),
    );
  }, [peopleF, visited]);

  const articleClusters = useMemo(() => (articlesF ? collapseHits(articlesF.hits, undefined, { maxPerAuthor: 2 }) : []), [articlesF]);
  const happeningClusters = useMemo(
    () => (happeningF ? collapseHits(happeningF.hits, undefined, { maxPerAuthor: 2 }) : []),
    [happeningF],
  );

  const sections = [peopleF, latestF, articlesF, happeningF, mediaF, musicF, shopF];
  const anyContent = sections.some((s) => (s?.hits.length ?? 0) > 0) || listenWavlake.length > 0 || personMedia.length > 0;
  const allSettled = sections.every((s) => s?.eose || s?.error);
  // EVERY section collapses near-duplicates — live verification found the
  // Latest section dominated by one author's three near-identical posts
  // within minutes of shipping the Happening-only version.
  const clustersOf = (snapshot: SearchSnapshot | null, exclude?: Set<string>) =>
    (snapshot ? collapseHits(snapshot.hits.filter((h) => !exclude?.has(h.event.id)), undefined, { maxPerAuthor: 2 }) : []).map((c) => (
      <ClusterRows key={c.primary.event.id} cluster={c} scoreOf={scoreOf} query={query} />
    ));
  // Google leads its news with a Top stories strip: pictured news-shaped
  // notes become cards, the rest stay rows beneath.
  const topStories = useMemo(() => (latestF ? pickTopStories(latestF.hits) : []), [latestF]);
  const storyIds = useMemo(() => new Set(topStories.map((s) => s.hit.event.id)), [topStories]);
  const storiesRef = useWheelScrollX();
  // Media tiles: anything with a picture or a video; the odd text-only media
  // event (a bare file, say) still gets a row.
  // The person's own media leads the tiles, newest first; the stream's fill in.
  const mediaTiles = useMemo(() => {
    // Newest first, one tile per title (a show reposts an episode), six at most —
    // the Media tab has the rest.
    const seenTitles = new Set<string>();
    const own = [...personMedia]
      .filter((h) => hasVisual(h.event))
      .sort((a, b) => b.event.created_at - a.event.created_at)
      .filter((h) => {
        const key = noteTitle(h.event.content).toLowerCase() || h.event.id;
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      })
      .slice(0, 6);
    const ownIds = new Set(own.map((h) => h.event.id));
    const rest = (mediaF?.hits ?? []).filter((h) => hasVisual(h.event) && !ownIds.has(h.event.id));
    return [...own, ...rest];
  }, [mediaF, personMedia]);
  const mediaTileIds = useMemo(() => new Set(mediaTiles.map((h) => h.event.id)), [mediaTiles]);

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

      {(latestF?.hits.length ?? 0) > 0 && (
        <Section id="latest" kicker="Latest" tab="notes" onTabChange={onTabChange}>
          <TopStories stories={topStories} stripRef={storiesRef} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">{clustersOf(latestF, storyIds)}</div>
        </Section>
      )}

      {(articlesF?.hits.length ?? 0) > 0 && (
        <Section id="articles" kicker="Articles" tab="articles" onTabChange={onTabChange}>
          {/* A bento — lead + tiles — breaks the run of rows; overflow stays rows. */}
          <ArticlesBento clusters={articleClusters} scoreOf={scoreOf} />
          {articleClusters.length > 4 && (
            <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/60">
              {articleClusters.slice(4).map((c) => (
                <ClusterRows key={c.primary.event.id} cluster={c} scoreOf={scoreOf} query={query} />
              ))}
            </div>
          )}
        </Section>
      )}

      {shopRow.length > 0 && (
        <Section id="shop" kicker="Shop" tab="shop" onTabChange={onTabChange}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {shopRow.map((h) => (
              <ListingCard key={h.event.id} event={h.event} author={h.author} score={scoreOf(h.event.pubkey)} />
            ))}
          </div>
        </Section>
      )}

      {listen.length + listenWavlake.length > 0 && (
        <Section id="listen" kicker="Listen" tab="music" onTabChange={onTabChange}>
          {/* Rows, not boxes: a stream of songs reads like a list. */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {listen.map((h) => (
              <TrackCard key={h.event.id} event={h.event} author={h.author} score={scoreOf(h.event.pubkey)} flat />
            ))}
            {listenWavlake.map((song) => (
              <WavlakeSongCard key={song.id} song={song} flat />
            ))}
          </div>
        </Section>
      )}

      {happeningClusters.length > 0 && (
        <Section id="happening" kicker="Happening" tab="events" onTabChange={onTabChange}>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {happeningClusters.map((c) => (
              <ClusterRows key={c.primary.event.id} cluster={c} scoreOf={scoreOf} query={query} />
            ))}
          </div>
        </Section>
      )}

      {(mediaF?.hits.length ?? 0) + mediaTiles.length > 0 && (
        <Section id="media" kicker="Media" tab="media" onTabChange={onTabChange}>
          <MediaTiles hits={mediaTiles} scoreOf={scoreOf} />
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">{clustersOf(mediaF, mediaTileIds)}</div>
        </Section>
      )}
    </div>
  );
}
