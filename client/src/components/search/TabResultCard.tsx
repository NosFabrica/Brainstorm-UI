/**
 * One row of a search tab's result list or grid: the card its kind draws (a person, a note, an
 * article, a listing, a repo…), under the Events timeline's day header when it starts a day, with
 * the chip that opens the fold it leads. components/search/SearchResults hands every row the
 * page's shared context.
 */
import type { ReactNode } from "react";
import type { NostrEvent } from "nostr-tools";
import { NewAccountResult } from "@/components/compromised/NewAccountResult";
import { CurrentAccountResult } from "@/components/retired/CurrentAccountResult";
import { retiredBy, retiredStatus } from "@/services/retired";
import { PersonCard } from "@/components/search/PersonCard";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { EventDateTile } from "@/components/share/EventDateTile";
import { SerpRow } from "@/components/search/SerpRow";
import { ThingCard } from "@/components/search/thingCards";
import { GitStatusCard, ReleaseCard, RepoStateCard } from "@/components/search/kindCards";
import {
  AppCard,
  EventCard,
  LiveTile,
  ListCard,
  MediaCard,
  RepoCard,
  TrackCard,
  mediaUrlOf,
  ListingCard,
} from "@/components/search/cards";
import type { useNoteRefs } from "@/hooks/useNoteRefs";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { SearchResult } from "@/lib/profileSearch";
import { eventPath } from "@/lib/shareId";
import { parseHighlight } from "@/lib/nip84";
import { describeThing, THING_KINDS } from "@/lib/thing";
import { DRAFT_LISTING_KIND } from "@/lib/listing";
import { EVENT_ITEM_KIND } from "@/lib/calendarEvent";
import { GIT_STATUS_KIND_SET, REPO_STATE_KIND } from "@/lib/gitEvents";
import { RELEASE_KIND } from "@/lib/release";
import { WEB_BOOKMARK_KIND } from "@/lib/webBookmark";
import { liveHostOf, liveStateOf } from "@/lib/liveStream";
import type { GitState } from "@/lib/gitStatus";
import type { BtcRates } from "@/lib/exchangeRate";
import type { cardGroupOf } from "@/lib/listingVariants";
import { matchedTagChip, tagsCarriedBy } from "@/lib/tagCarrierPeople";
import type { SearchHit, SearchPov, SearchTab, GoalProgress, EventRsvps } from "@/services/search";
import {
  APP_KINDS,
  ARTICLE_KINDS,
  EVENT_KINDS,
  LIST_KINDS,
  LIVE_KINDS,
  MEDIA_KINDS,
  MUSIC_KINDS,
  NOTE_KINDS,
  REPO_KINDS,
  SHOP_KINDS,
} from "./tabKinds";
import type { DisplayRow } from "./pipelines";
import type { DayHeader } from "./pipelines/events";
import type { LiveStates } from "./pipelines/live";

/** ShareNoteCard's profile map, built from the hits' hydrated authors. */
export type CardProfile = { name?: string; display_name?: string; picture?: string; nip05?: string };

/** The empty answers rows are handed when there is nothing: one array, so a memoised card sees no change. */
const NO_FACES: string[] = [];

/**
 * A person card's author with the score the page fetched, made once per author and
 * score: a copy per render was a new prop for every memoised PersonCard.
 */
const SCORED = new WeakMap<SearchResult, { score: number | null; result: SearchResult }>();
function withScore(author: SearchResult, score: number | null): SearchResult {
  if (author.wotRank != null) return author;
  const held = SCORED.get(author);
  if (held && held.score === score) return held.result;
  const result = { ...author, wotRank: score };
  SCORED.set(author, { score, result });
  return result;
}

/** The chip for the matched tag a person carries, one object per tag (matchedTagChip makes a new one per call). */
const TAG_CHIPS = new WeakMap<object, ReturnType<typeof matchedTagChip>>();
function tagChipFor(carried: Parameters<typeof matchedTagChip>[0]): ReturnType<typeof matchedTagChip> {
  const tag = carried[0];
  if (!tag) return undefined;
  if (!TAG_CHIPS.has(tag)) TAG_CHIPS.set(tag, matchedTagChip(carried));
  return TAG_CHIPS.get(tag);
}

/**
 * A result row skips layout and paint while it is far off screen. `auto` in the
 * intrinsic size remembers the height a row last rendered at, so the scrollbar
 * settles as the reader goes; 180px is a typical card's height before then.
 */
const OFFSCREEN_ROW = "[content-visibility:auto] [contain-intrinsic-size:auto_180px]";

/** What every row of the page reads: the tab, its lookups and the page's answers per row. */
export interface TabCardContext {
  tab: SearchTab;
  pov: SearchPov;
  query: string;
  /** Rows are laid out whole while a remembered scroll is restored (OFFSCREEN_ROW otherwise). */
  rowsWhole: boolean;
  eventDayHeaders: ReadonlyMap<string, DayHeader>;
  onExpand: (clusterId: string) => void;
  /** The page's rows, for a Retired account's Current one. */
  displayHits: readonly DisplayRow[];
  /** The people on the page, and whose new account each compromised one's is. */
  peopleOnPage: readonly string[];
  newAccountOf: ReadonlyMap<string, string>;
  scoreOf: (pubkey: string) => number | null | undefined;
  tagMatches: Parameters<typeof tagsCarriedBy>[2];
  carriersSettled: boolean;
  carrierSets: Parameters<typeof tagsCarriedBy>[1];
  pointedNames: ReadonlyMap<string, string[]>;
  openProfile: (result: SearchResult) => void;
  onPrefetchEnter?: (result: SearchResult) => void;
  onPrefetchLeave?: (result: SearchResult) => void;
  progressOf: (e: NostrEvent) => GoalProgress | undefined;
  /** The kinds the box asked for (`kind:30078`): a spec card leads with them. */
  searchedKinds: string[];
  profiles: Map<string, CardProfile>;
  noteRefs: ReturnType<typeof useNoteRefs>;
  rsvpsOf: (e: NostrEvent) => EventRsvps | undefined;
  shopGroupOf: (id: string) => ReturnType<typeof cardGroupOf> | undefined;
  rates: BtcRates | null;
  hitsBySeller: ReadonlyMap<string, NostrEvent[]>;
  liveStates: LiveStates;
  stateOf: (e: NostrEvent) => GitState | null;
  gitComments: ReadonlyMap<string, number>;
}

/**
 * A person's row steps aside for one shown above another of the page's: a new account whose
 * compromised one is on this page is already shown, above that one; the same for a Current
 * account whose Retired one is on this page.
 */
export function personRowSteppedAside(pubkey: string, ctx: Pick<TabCardContext, "newAccountOf" | "peopleOnPage">) {
  const replaced = ctx.newAccountOf.get(pubkey);
  if (replaced && ctx.peopleOnPage.includes(replaced)) return true;
  const retiredOne = retiredBy(pubkey)?.pubkey;
  return !!(retiredOne && ctx.peopleOnPage.includes(retiredOne));
}

/** Whether a row draws a person card: a profile with its author, not stepping aside. */
export function isPersonCard(hit: SearchHit, ctx: Pick<TabCardContext, "newAccountOf" | "peopleOnPage">): boolean {
  return hit.event.kind === 0 && !!hit.author && !personRowSteppedAside(hit.event.pubkey, ctx);
}

export function TabResultCard({
  row: { hit, collapsedCount, clusterId, chipLabel, forkOf, listGroup },
  personIdx,
  ctx,
}: {
  row: DisplayRow;
  /** The person card's place among the page's people (isPersonCard), -1 for any other row. */
  personIdx: number;
  ctx: TabCardContext;
}) {
  const {
    tab,
    pov,
    query,
    rowsWhole,
    eventDayHeaders,
    onExpand,
    displayHits,
    scoreOf,
    tagMatches,
    carriersSettled,
    carrierSets,
    pointedNames,
    openProfile,
    onPrefetchEnter,
    onPrefetchLeave,
    progressOf,
    searchedKinds,
    profiles,
    noteRefs,
    rsvpsOf,
    shopGroupOf,
    rates,
    hitsBySeller,
    liveStates,
    stateOf,
    gitComments,
  } = ctx;
  const { event } = hit;
  const chip =
    collapsedCount > 0 ? (
      <button
        type="button"
        onClick={() => onExpand(clusterId)}
        className="ml-1 mt-1 rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 hover:border-brand-accent/30 dark:border-slate-800 dark:text-slate-400"
        data-testid={`cluster-expand-${clusterId}`}
      >
        {chipLabel ?? `+${collapsedCount} more like this`}
      </button>
    ) : null;
  // Grid tabs (Apps, Repos, Issues, PRs) stretch every cell so a row of cards
  // shares one height; list tabs are unaffected by h-full.
  const day = eventDayHeaders.get(event.id);
  const wrap = (card: ReactNode) => (
    <div className={rowsWhole ? "h-full" : `h-full ${OFFSCREEN_ROW}`}>
      {day && (
        <div
          className={`flex items-center gap-2.5 ${eventDayHeaders.keys().next().value === event.id ? "" : "pt-3"} pb-1.5`}
          data-testid={`event-day-${day.key}`}
        >
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
    if (personRowSteppedAside(event.pubkey, ctx)) return null;
    // …and a Retired account leads with its owner's Current one: that account's
    // own row from this page when it has one, so its score comes along.
    const currentOne = retiredStatus(event.pubkey)?.currentPubkey;
    const currentRow = currentOne
      ? displayHits.find((d) => d.hit.event.kind === 0 && d.hit.event.pubkey === currentOne)?.hit
      : undefined;
    const currentAuthor = currentRow?.author
      ? {
          ...currentRow.author,
          wotRank: currentRow.author.wotRank ?? scoreOf(currentRow.event.pubkey) ?? null,
        }
      : undefined;
    const idx = personIdx;
    // The one tag the words matched, if this person carries it.
    const cardTag =
      tagMatches.length > 0 && carriersSettled
        ? tagChipFor(tagsCarriedBy(event.pubkey, carrierSets, tagMatches))
        : undefined;
    const scored = withScore(hit.author, scoreOf(event.pubkey) ?? null);
    return wrap(
      <>
        {/* A compromised account: the owner's new one goes first, highlighted. */}
        <NewAccountResult compromisedPubkey={event.pubkey} pov={pov} onOpen={openProfile} />
        {/* A retired account: the owner's current one goes first, lightly set apart. */}
        <CurrentAccountResult retiredPubkey={event.pubkey} known={currentAuthor} pov={pov} onOpen={openProfile} />
        <PersonCard
          result={scored}
          idx={idx}
          pov={pov}
          onOpen={openProfile}
          onPrefetchEnter={onPrefetchEnter}
          onPrefetchLeave={onPrefetchLeave}
          showFollowedBy={idx < 3}
          tag={cardTag}
          pointedBy={pointedNames.get(event.pubkey)}
        />
      </>,
    );
  }
  // The kinds with no card of their own, whichever tab they are on.
  if (THING_KINDS.has(event.kind)) {
    const thing = describeThing(event);
    if (thing)
      return wrap(
        <ThingCard
          event={event}
          author={hit.author}
          score={scoreOf(event.pubkey)}
          thing={thing}
          progress={progressOf(event)}
        />,
      );
  }
  if (ARTICLE_KINDS.has(event.kind)) {
    return wrap(
      <EmbeddedArticleCard
        leadKinds={searchedKinds}
        mixed={tab === "articles"}
        event={event as MinimalEvent}
        author={profiles.get(event.pubkey)}
        trustScore01={scoreOf(event.pubkey) ?? null}
      />,
    );
  }
  // A NIP-84 highlight is its passage marked and where it is from (SerpRow's
  // HighlightRow), as on the Top page and the All tab — never its passage as a bare note.
  if (event.kind === 9802 && parseHighlight(event))
    return wrap(<SerpRow event={event} author={hit.author} score={scoreOf(event.pubkey)} query={query} />);
  if (NOTE_KINDS.has(event.kind) && tab !== "media") {
    return wrap(
      <ShareNoteCard
        event={event as MinimalEvent}
        profiles={profiles}
        eventsById={noteRefs.eventsById}
        addrByCoord={noteRefs.addrByCoord}
        href={eventPath(event)}
        showAuthor
        authorScore={scoreOf(event.pubkey)}
      />,
    );
  }
  const typed = { event, author: hit.author, score: scoreOf(event.pubkey) };
  if (EVENT_KINDS.has(event.kind) || (tab === "events" && event.kind === EVENT_ITEM_KIND)) {
    const r = rsvpsOf(event);
    return wrap(<EventCard {...typed} going={r?.going ?? 0} faces={r?.faces ?? NO_FACES} />);
  }
  if (MUSIC_KINDS.has(event.kind)) return wrap(<TrackCard {...typed} />);
  // A NIP-99 draft is not in the Shop, but drawn where it turns up as the listing it is.
  if (SHOP_KINDS.has(event.kind) || event.kind === DRAFT_LISTING_KIND)
    return wrap(
      <ListingCard
        {...typed}
        group={shopGroupOf(event.id)}
        rates={rates}
        sellerListings={hitsBySeller.get(event.pubkey)}
      />,
    );
  if (LIVE_KINDS.has(event.kind)) {
    const hostPk = liveHostOf(event);
    return wrap(
      <LiveTile
        {...typed}
        state={liveStates.get(event.id) ?? liveStateOf(event)}
        hostScore={hostPk ? scoreOf(hostPk) : undefined}
      />,
    );
  }
  if (APP_KINDS.has(event.kind)) return wrap(<AppCard {...typed} />);
  if (REPO_KINDS.has(event.kind))
    return wrap(
      <RepoCard {...typed} state={stateOf(event) ?? undefined} comments={gitComments.get(event.id)} forkOf={forkOf} />,
    );
  // NIP-34 statuses and repo state, and releases: their own cards (components/search/kindCards).
  if (GIT_STATUS_KIND_SET.has(event.kind)) return wrap(<GitStatusCard {...typed} />);
  if (event.kind === REPO_STATE_KIND) return wrap(<RepoStateCard {...typed} />);
  if (event.kind === RELEASE_KIND) return wrap(<ReleaseCard {...typed} />);
  if (event.kind === WEB_BOOKMARK_KIND) return wrap(<SerpRow {...typed} query={query} />);
  if (LIST_KINDS.has(event.kind)) return wrap(<ListCard {...typed} group={listGroup} />);
  if (MEDIA_KINDS.has(event.kind)) return wrap(<MediaCard {...typed} />);
  // Open-set posture: an unmapped kind renders rather than vanishing —
  // the relay may index new kinds before this UI learns them. With
  // something to show it is a media card; without, the composed
  // page's generic row, which reads a `name` tag, a kind label and an
  // `alt` line (a kind-39999 place has no content and no picture, and
  // was a blank media tile).
  if (mediaUrlOf(event) !== null) return wrap(<MediaCard {...typed} />);
  return wrap(<SerpRow {...typed} query={query} />);
}
