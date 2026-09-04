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
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { fetchAppsByAddress, type SearchHit, type SearchPov, type SearchTab } from "@/services/search";
import { eventPath } from "@/lib/shareId";
import { Package } from "lucide-react";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useNoteEngagement } from "@/hooks/useNoteEngagement";
import { useWheelScrollX } from "@/hooks/useWheelScrollX";
import { collapseHits } from "@/lib/searchCollapse";
import { filterEventsByWhen } from "@/lib/eventFilters";
import { trendingTags } from "@/lib/feedTrending";
import { ClusterRows, Section, useSectionStream, useSettledSnapshot } from "@/components/search/sections";
import { MediaTiles, TopStories, hasVisual, pickTopStories } from "@/components/search/RichSections";
import { EventCard, LiveCard } from "@/components/search/cards";

const DAY = 86_400;
/** Under this many items in a day, a network is "quiet" and the wider block leads. */
const QUIET_BELOW = 5;

/** One lens's worth of bands. */
function FeedBlock({
  id,
  kicker,
  pov,
  userPubkey,
  since,
  onBrowse,
  onSettled,
}: {
  id: "personal" | "house";
  kicker: string;
  pov: SearchPov;
  userPubkey?: string;
  since: number;
  onBrowse: (tab: SearchTab) => void;
  /** How many items the block has once its first page lands. */
  onSettled?: (count: number) => void;
}) {
  // Every band asks through the block's lens, for the same 24 hours.
  const liveStream = useSectionStream("sort:recent", "live", pov, userPubkey, 12, since);
  const latestStream = useSectionStream("sort:recent", "notes", pov, userPubkey, 30, since);
  // Events are announced weeks ahead — look back a month for what's coming up this week.
  const eventsStream = useSectionStream("sort:recent", "events", pov, userPubkey, 60, since - 29 * DAY);
  const mediaStream = useSectionStream("sort:recent", "media", pov, userPubkey, 12, since);
  // Releases ship less often than people post — a week, not a day.
  const releasesStream = useSectionStream("sort:recent", "releases", pov, userPubkey, 30, since - 6 * DAY);
  const latest = useSettledSnapshot(latestStream);

  // New releases: one per app, newest first, wearing the listing's icon.
  const releases = useMemo(() => {
    const newestPerApp = new Map<string, SearchHit>();
    for (const h of releasesStream?.hits ?? []) {
      const address = h.event.tags.find((t) => t[0] === "a" && t[1]?.startsWith("32267:"))?.[1];
      if (!address) continue;
      const prev = newestPerApp.get(address);
      if (!prev || prev.event.created_at < h.event.created_at) newestPerApp.set(address, h);
    }
    return [...newestPerApp.entries()].sort((a, b) => b[1].event.created_at - a[1].event.created_at).slice(0, 8);
  }, [releasesStream]);
  const [listings, setListings] = useState<Map<string, NostrEvent>>(new Map());
  const releaseAddresses = useMemo(() => releases.map(([address]) => address), [releases]);
  useEffect(() => {
    if (releaseAddresses.length === 0) return;
    let alive = true;
    void fetchAppsByAddress(releaseAddresses).then((map) => {
      if (alive) setListings(map);
    });
    return () => {
      alive = false;
    };
  }, [releaseAddresses.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live now: streams that say they are live, and nothing else.
  const liveNow = useMemo(
    () => (liveStream?.hits ?? []).filter((h) => (h.event.tags.find((t) => t[0] === "status")?.[1] ?? "").toLowerCase() === "live"),
    [liveStream],
  );
  // This week's events: upcoming within seven days, soonest first (the
  // relay only knows publish time — eventFilters does the calendar work).
  const eventsThisWeek = useMemo(() => filterEventsByWhen(eventsStream?.hits ?? [], "week").slice(0, 6), [eventsStream]);
  const mediaTiles = useMemo(() => (mediaStream?.hits ?? []).filter((h) => hasVisual(h.event)).slice(0, 8), [mediaStream]);
  // Top stories lead Latest; the rest are rows, an author's near-duplicates folded.
  const stories = useMemo(() => pickTopStories(latest.hits), [latest.hits]);
  const storyIds = useMemo(() => new Set(stories.map((st) => st.hit.event.id)), [stories]);
  const latestClusters = useMemo(
    () => collapseHits(latest.hits.filter((h) => !storyIds.has(h.event.id)), undefined, { maxPerAuthor: 2 }),
    [latest.hits, storyIds],
  );
  const trending = useMemo(() => trendingTags(latest.hits), [latest.hits]);

  const allHits: SearchHit[] = useMemo(
    () => [...liveNow, ...latest.hits, ...eventsThisWeek, ...mediaTiles],
    [liveNow, latest.hits, eventsThisWeek, mediaTiles],
  );
  const scoreOf = useAuthorScores(useMemo(() => [...new Set(allHits.map((h) => h.event.pubkey))], [allHits]));
  // Quiet engagement — zaps and replies the relay can count — for the rows.
  const engagementOf = useNoteEngagement(useMemo(() => latest.hits.map((h) => h.event.id), [latest.hits]));
  const storiesRef = useWheelScrollX();

  const settled = latest.settled;
  const anyContent = liveNow.length > 0 || latest.hits.length > 0 || eventsThisWeek.length > 0 || mediaTiles.length > 0;
  const empty = settled && !anyContent;
  useEffect(() => {
    if (settled) onSettled?.(latest.hits.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  return (
    <div className="mt-6 first:mt-0" data-testid={`feed-block-${id}`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500" data-testid={`feed-kicker-${id}`}>
        {kicker}
      </p>
      {liveNow.length > 0 && (
        <Section id="live" kicker="Live now" tab="live" onTabChange={onBrowse} testIdPrefix="feed-band">
          <div className="space-y-2">
            {liveNow.slice(0, 3).map((h) => (
              <LiveCard key={h.event.id} event={h.event} author={h.author} score={scoreOf(h.event.pubkey)} />
            ))}
          </div>
        </Section>
      )}
      {(stories.length > 0 || latestClusters.length > 0 || latest.pendingCount > 0) && (
        <Section id="latest" kicker="Latest" tab="notes" onTabChange={onBrowse} testIdPrefix="feed-band">
          {/* New posts wait here, at the top of the band they belong to. */}
          {latest.pendingCount > 0 && (
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={latest.release}
                className="rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
                data-testid="feed-new-pill"
              >
                {latest.pendingCount} new
              </button>
            </div>
          )}
          <TopStories stories={stories} stripRef={storiesRef} />
          <div className="space-y-0.5">
            {latestClusters.map((c) => (
              <ClusterRows key={c.primary.event.id} cluster={c} scoreOf={scoreOf} query="" engagementOf={engagementOf} />
            ))}
          </div>
        </Section>
      )}
      {trending.length > 0 && (
        <Section id="trending" kicker="Trending" tab="notes" onTabChange={onBrowse} testIdPrefix="feed-band">
          <div className="flex flex-wrap gap-1.5">
            {trending.map((t) => (
              <Link
                key={t.tag}
                href={`/?q=${encodeURIComponent(`#${t.tag}`)}`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 hover:text-brand-deep dark:hover:text-white transition-colors"
                data-testid={`feed-trend-${t.tag}`}
              >
                #{t.tag} <span className="text-[10px] text-slate-400 dark:text-slate-500">{t.voices}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
      {eventsThisWeek.length > 0 && (
        <Section id="events" kicker="This week" tab="events" onTabChange={onBrowse} testIdPrefix="feed-band">
          <div className="space-y-2">
            {eventsThisWeek.map((h) => (
              <EventCard key={h.event.id} event={h.event} author={h.author} score={scoreOf(h.event.pubkey)} />
            ))}
          </div>
        </Section>
      )}
      {releases.length > 0 && (
        <Section id="releases" kicker="New releases" tab="apps" onTabChange={onBrowse} testIdPrefix="feed-band">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {releases.map(([address, h]) => {
              const listing = listings.get(address);
              const tag = (e: NostrEvent | undefined, k: string) => e?.tags.find((t) => t[0] === k)?.[1];
              const d = tag(h.event, "d") ?? "";
              const version = d.includes("@") ? d.slice(d.lastIndexOf("@") + 1) : tag(h.event, "version") ?? "";
              const name = tag(listing, "name") ?? (d.includes("@") ? d.slice(0, d.lastIndexOf("@")) : d) ?? "App";
              const icon = tag(listing, "icon") ?? tag(listing, "image");
              return (
                <Link
                  key={h.event.id}
                  href={eventPath(h.event)}
                  className="flex w-40 shrink-0 items-center gap-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 p-2.5 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                  data-testid={`feed-release-${h.event.id}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-900/5 dark:ring-white/10">
                    {icon ? <img src={icon} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Package className="h-4 w-4 text-slate-400" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{name}</span>
                    {version && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">v{version}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}
      {mediaTiles.length > 0 && (
        <Section id="media" kicker="Media" tab="media" onTabChange={onBrowse} testIdPrefix="feed-band">
          <MediaTiles hits={mediaTiles} scoreOf={scoreOf} />
        </Section>
      )}
      {!settled && !anyContent && (
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
  // A quiet network (a new account, few follows) shouldn't lead with an
  // almost-empty block: say so in a line and let the wider block go first.
  const [personalCount, setPersonalCount] = useState<number | null>(null);
  const showPersonal = personal && !!userPubkey;
  const quiet = showPersonal && personalCount !== null && personalCount < QUIET_BELOW;
  const personalBlock = showPersonal ? (
    // Keyed so a reorder (quiet network) moves the block instead of remounting it — its streams stay open.
    <FeedBlock key="personal" id="personal" kicker="From people you trust" pov="mywot" userPubkey={userPubkey} since={since} onBrowse={onBrowse} onSettled={setPersonalCount} />
  ) : null;
  const houseBlock = <FeedBlock key="house" id="house" kicker="Across Nostr" pov="nosfabrica" userPubkey={userPubkey} since={since} onBrowse={onBrowse} />;
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
      {quiet && (
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400" data-testid="feed-quiet-network">
          Your network has been quiet in the last 24 hours — here's the wider network first.
        </p>
      )}
      {quiet ? (
        <>
          {houseBlock}
          {personalBlock}
        </>
      ) : (
        <>
          {personalBlock}
          {houseBlock}
        </>
      )}
    </div>
  );
}
