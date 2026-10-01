/**
 * Relay-backed search — the seam between the search UI and the
 * SearchOverTrust relay (NIP-50, extended grammar).
 *
 * Verified against the staging relay (2026-09-02, read-only probes):
 * - The RELAY parses the whole grammar (`from:` `since:` `sort:` `observer:`
 *   `include:spam` …) — the query text passes through verbatim; this module
 *   appends `observer:` and nothing else. The UI never string-builds syntax.
 * - Frames are plain NIP-01 `["EVENT", subid, event]` — rank is expressed as
 *   ORDER, never as numbers. `SearchHit.rank` stays null until a separate
 *   score fetch fills it (same per-author pattern as the hashtag page).
 * - A read with no lens (no `observer:`, no `include:spam`) is refused with
 *   `auth-required:` — so every query we send carries a lens.
 * - Kind-less REQs work: the Everything tab is one REQ with no `kinds`.
 * - `sort:rank`/best-match flush near EOSE (~4s); `sort:recent` streams.
 */
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { RelayClosedError } from "applesauce-relay";
import type { Relay, RelayReqMessage } from "applesauce-relay";
import { reportSearchFailure } from "@/lib/serverStatus";
import { searchRelay } from "@/lib/searchRelay";
import { zapstoreRelay } from "@/lib/zapstoreRelay";
import { eventStore } from "@/lib/eventStore";
import { liftQuery, searchFilters, typeaheadWords, withObserver } from "@/lib/searchSyntax";
import { isSellable, parseListing } from "@/lib/listing";
import { resolveHouseObserver } from "@/services/trustSource";
import { wantProfile } from "@/services/authorProfileQueue";
import type { SearchResult } from "@/lib/profileSearch";
import { RECIPE_TAGS } from "@/lib/sourceApp";
import { isBlankEvent } from "@/lib/blankEvent";

export type SearchTab =
  | "everything"
  | "people"
  | "notes"
  | "articles"
  | "media"
  | "apps"
  | "shop"
  | "repos"
  | "issues"
  | "prs"
  | "events"
  | "live"
  | "music"
  | "releases"
  | "lists"
  | "recipes"
  | "nips"
  | "communities"
  | "fundraisers"
  | "reviews";

/** One truth for tab → kinds, extracted from the SearchOverTrust app. */
export const TAB_KINDS: Record<Exclude<SearchTab, "everything">, number[]> = {
  people: [0],
  // NIP-84 highlights (a quoted passage) and NIP-88 / zap polls read as notes.
  notes: [1, 11, 1111, 9802, 1068, 6969],
  // 30817 = specs (NIPs on Nostr): Markdown, addressable, indexed by the
  // search relay — read like an article, labelled "Spec".
  // 30142 = learning resources (lesson plans, courses), read like an article.
  articles: [30023, 30024, 30818, 30040, 30041, 30817, 30142],
  // Specs alone, as their own vertical under More — "NIPs" is the word people
  // search (Benjamin, 2026-09-23). They stay in Articles too, labelled.
  nips: [30817],
  // Pictures, NIP-71 clips, files (by mime), voice. Kind 1986 was here once — a NIP-32 label, not media.
  // 2003 = NIP-35 torrents.
  media: [20, 21, 22, 1063, 1222, 34235, 34236, 2003],
  // Vitor's split: Zap Store app listings and git-shaped kinds were one
  // confusing tab. Kind 1337 "snippets" is deliberately in NEITHER — live
  // probing showed it ~90% JSON junk; it still surfaces via Everything.
  // Beside them: NIP-89 app handlers, NIP-5A Nostr sites, NIP-5D mini apps.
  apps: [32267, 31990, 35128, 15128, 35129],
  // NIP-99 classifieds — the Shop. Sold, hidden and priceless are gated in the UI (lib/listing).
  // NIP-15 beside it: products and auctions sell in the grid; stalls and
  // marketplaces are shops, shown by name.
  shop: [30402, 30018, 30020, 30017, 30019],
  // Native tracks (Wavlake, Stemstr, Tunestr). The kind is also abused for
  // game state and ad-skip data, so the UI keeps only hits with a title and
  // audio — see lib/trackEvent.
  // 36787 is the newer addressable track (26x the 31337s on staging,
  // 2026-09-29); 54/30054/30055 are podcast episodes and trailers.
  music: [31337, 36787, 54, 30054, 30055],
  // NIP-34 git, one vertical per thing people look for: repo announcements,
  // issues, and patches with pull requests (both are code up for review).
  repos: [30617],
  issues: [1621],
  prs: [1617, 1618],
  // Benjamin: "filter by events also". NIP-52 calendar events are their own
  // vertical (the tab does the calendar work — the relay only knows
  // created_at); Live keeps the NIP-53 streams. Kind 31924 calendars (event
  // containers) join the Events tab, below the dated events.
  events: [31922, 31923, 31924],
  live: [30311, 30312, 30313],
  // Not a tab — the home feed's New releases band streams Zap Store releases.
  releases: [30063],
  // 30000 = NIP-51 follow sets — Brainstorm's own pinned-tag exports live here.
  // Also starter packs, curation sets (articles, videos, pictures), music
  // playlists, emoji packs, and NIP-58 badges.
  lists: [30000, 10003, 10015, 30001, 30003, 30015, 30267, 39701, 39089, 30004, 30005, 30006, 34139, 30030, 30009],
  // Recipes are long-form articles wearing zap.cooking's tag — the same kind as
  // Articles, narrowed by tag (TAB_TAGS). They stay in Articles too, labelled.
  recipes: [30023],
  // NIP-72 moderated communities, NIP-29 relay groups, NIP-28 public channels.
  communities: [34550, 39000, 40, 41],
  // NIP-75 zap goals and Agora fundraisers.
  fundraisers: [9041, 33863],
  // Ratings of anything (34259), relay reviews (31987), NIP-87 mint reviews.
  reviews: [34259, 31987, 38000],
};

/**
 * The verticals that are a kind narrowed by tag. The relay filters `#t`
 * alongside `search` and `kinds` (probed 2026-09-22), so this is a real
 * vertical, not a client-side sieve.
 */
const TAB_TAGS: Partial<Record<SearchTab, readonly string[]>> = {
  recipes: RECIPE_TAGS,
};

/** Everything is deliberately unconstrained — the relay blends and ranks. */
/** The word each tab wears — for anything that names a tab away from the tab bar. */
export const TAB_LABELS: Record<SearchTab, string> = {
  everything: "Everything",
  people: "People",
  notes: "Notes",
  articles: "Articles",
  media: "Media",
  apps: "Apps",
  shop: "Shop",
  repos: "Repos",
  issues: "Issues",
  prs: "PRs",
  events: "Events",
  live: "Live",
  music: "Music",
  releases: "Releases",
  lists: "Lists",
  recipes: "Recipes",
  nips: "NIPs",
  communities: "Communities",
  fundraisers: "Fundraisers",
  reviews: "Reviews",
};
export const tabLabel = (tab: string): string => TAB_LABELS[tab as SearchTab] ?? tab;

const MINT_REVIEW_KIND = 38000;
/** NIP-87's own `k` on a kind-38000: the mint it recommends is a Cashu mint (38172) or a Fedimint (38173). */
const MINT_REVIEW_KS = ["38172", "38173"];

/**
 * Reviews asks the relay for NIP-87's mint reviews alone. Kind 38000 is shared — BAO's
 * prediction markets, an election app's ballots, thousands of one-key test votes
 * (lib/thing's kind38000Format) — and asked bare, they filled the page the tab then
 * emptied: on the production relay, through the house lens, 29 of the first 100 Reviews
 * hits were markets, and 87 of 100 on "bitcoin" (2026-10-01). So 38000 goes in a filter
 * of its own, narrowed by `#k`, ORed with the other review kinds. The handful of old
 * reviews published before NIP-87 had a `k` are left out.
 */
export function askMintReviewsOnly<F extends { kinds?: number[]; "#k"?: string[] }>(filters: F[]): F[] {
  return filters.flatMap((f) => {
    if (!f.kinds?.includes(MINT_REVIEW_KIND) || f["#k"]) return [f];
    const rest = f.kinds.filter((k) => k !== MINT_REVIEW_KIND);
    const mint = { ...f, kinds: [MINT_REVIEW_KIND], "#k": MINT_REVIEW_KS };
    return rest.length ? [{ ...f, kinds: rest }, mint] : [mint];
  });
}
export function kindsForTab(tab: SearchTab): number[] | undefined {
  return tab === "everything" ? undefined : TAB_KINDS[tab];
}

/**
 * What a preview band asks of a tab — an Everything section, a home-feed
 * band, a panel rail — where it differs from the tab: the kinds only the
 * tab itself can show are left out, since a band would ask for them, fill
 * its few slots with them, and then drop them. Calendars have no date for
 * Happening's upcoming window; stalls and marketplaces have no price for
 * the Shop row; a torrent has nothing to see in a media tile; the panel's
 * app rail draws Zap Store listings.
 */
const BAND_KINDS: Partial<Record<SearchTab, number[]>> = {
  events: [31922, 31923],
  shop: [30402, 30018, 30020],
  media: [20, 21, 22, 1063, 1222, 34235, 34236],
  apps: [32267],
};

export function bandKindsForTab(tab: SearchTab): number[] | undefined {
  return BAND_KINDS[tab] ?? kindsForTab(tab);
}

/** The `#t` a vertical is defined by, if any — a typed `#tag` in the query wins over it. */
export function tagsForTab(tab: SearchTab): string[] | undefined {
  const tags = TAB_TAGS[tab];
  return tags ? [...tags] : undefined;
}

export interface SearchHit {
  event: NostrEvent;
  /** Kind-0-derived card data — the hit itself for People, the author for
   *  everything else (filled by hydration; null until then). */
  author: SearchResult | null;
  /** 0..1 when a score fetch has answered; the relay itself only ORDERS. */
  rank: number | null;
}

export interface SearchSnapshot {
  /** Relay order preserved — the relay owns `sort:`. */
  hits: SearchHit[];
  eose: boolean;
  /** Stamped at EOSE — the "About N results in Xs" line. */
  timeMs: number | null;
  error: string | null;
  /** A further page is on its way (the handle's `more`). */
  loadingMore?: boolean;
  /** The last page brought nothing new — there is no more to turn. */
  exhausted?: boolean;
}

/** Cancel by calling it; `more` turns the next page once the current one has ended. */
export type SearchHandle = (() => void) & { more: () => void };

export type SearchPov = "nosfabrica" | "mywot";

/**
 * A page whose sections share one REQ. Not a tab — the Everything page is both
 * a tab and a group. Members are routed to by kind, so a group's sections must
 * ask for disjoint kinds; a section that names no kinds never joins.
 */
export type SearchGroup = "search-everything" | "home-feed-personal" | "home-feed-house";

export interface SearchParams {
  tab: SearchTab;
  pov: SearchPov;
  /** Required for pov === "mywot". */
  userPubkey?: string;
  limit?: number;
  /** Epoch lower bound, to the second — the home feed's "last 24 hours".
   *  (The grammar's since:YYYY-MM-DD is day-precision; this is not.) */
  since?: number;
  /**
   * The pages a previous life of this search had loaded (a reader came back
   * from a result): shown at once, the first page refreshes in front of them,
   * and the next page turns from their end.
   */
  seed?: SearchHit[];
  /**
   * The seed is a placeholder, not an answer: anything in it that the relay's
   * own first page does not return is dropped at EOSE. The typeahead's people
   * are shown this way — they are what the box guessed, and the section's
   * answer is what the search actually says.
   */
  provisionalSeed?: boolean;
  /**
   * Streams naming the same group share ONE REQ — one filter each, events
   * routed back by kind. The relay works a socket's REQs as a queue, so the
   * Everything page's eight sections were eight turns in it (probed
   * 2026-09-16: 5,145ms vs 2,514ms for the same 75 events). Only the first
   * page joins; a "more" page opens its own REQ as before.
   */
  group?: SearchGroup;
  /**
   * Exactly these kinds, in place of the tab's — Everything's section for a
   * typed kind that none of its sections carry. Not intersected with the
   * query's own `kind:` tokens; it IS them.
   */
  kinds?: number[];
  /**
   * A preview band rather than the tab itself: asks the tab's band kinds
   * (bandKindsForTab), still narrowed by a typed `kind:`.
   */
  band?: boolean;
}

const DEFAULT_LIMIT = 100;
/**
 * How deep best match will go. It has no cursor, so each further page is a
 * bigger ask that repeats the ranking so far — and the relay sends MORE than
 * asked (probed 2026-09-09: asked 600, got 1003). Six pages of a hundred is
 * the honest depth; past it the list says it has reached the end.
 */
const RANKED_PAGE_CEILING = 600;
/** How long a page may go unanswered before the stream says something. */
const REQ_DEADLINE_MS = 10_000;
/** What the reader sees when the relay is the reason — the sorry page's line. */
const SEARCH_BREAK = "Search is running behind.";

/** Kind-0 event → the SearchResult currency the whole app renders. */
export function kind0ToSearchResult(event: NostrEvent): SearchResult {
  let meta: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.content);
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
  } catch {
    /* unparseable profile content renders as pubkey-only */
  }
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : undefined);
  let npub = "";
  try {
    npub = nip19.npubEncode(event.pubkey);
  } catch {
    /* malformed pubkey — leave npub empty, card falls back to hex */
  }
  return {
    pubkey: event.pubkey,
    npub,
    name: str("name"),
    displayName: str("display_name") ?? str("displayName"),
    picture: str("picture"),
    about: str("about"),
    nip05: str("nip05"),
    website: str("website"),
    lud16: str("lud16"),
    banner: str("banner"),
    bot: meta.bot === true ? true : undefined,
    createdAt: event.created_at,
    wotRank: null,
    wotFollowers: null,
  };
}

async function resolveObserver(params: SearchParams): Promise<string | null> {
  if (params.pov === "mywot" && params.userPubkey) return params.userPubkey;
  return resolveHouseObserver();
}

interface GroupMember {
  kinds: Set<number>;
  filter: import("nostr-tools").Filter;
  next: (msg: RelayReqMessage) => void;
  error: (err: unknown) => void;
  live: boolean;
  /** Set when the member could not share, and got a REQ of its own. */
  sub: { unsubscribe: () => void } | null;
}

interface PendingGroup {
  members: GroupMember[];
  timer: ReturnType<typeof setTimeout>;
  /** The shared REQ, once the group has opened it. */
  sub: { unsubscribe: () => void } | null;
}

/** Groups still collecting members. An opened group is no longer joinable. */
const pendingGroups = new Map<SearchGroup, PendingGroup>();

/**
 * Join `filter` to the group's single REQ, opened once the tick the first
 * member arrived in has run out. A member only sees events its own kinds asked
 * for; EOSE, CLOSED and errors reach every member of its REQ.
 */
function joinGroupReq(
  relay: Pick<Relay, "req">,
  key: SearchGroup,
  filter: import("nostr-tools").Filter,
  handlers: { next: GroupMember["next"]; error: GroupMember["error"] },
): { unsubscribe: () => void } {
  const member: GroupMember = { kinds: new Set(filter.kinds), filter, ...handlers, live: true, sub: null };
  let group = pendingGroups.get(key);
  if (!group) {
    group = {
      members: [],
      sub: null,
      timer: setTimeout(() => {
        pendingGroups.delete(key);
        const watch = (members: GroupMember[]) => ({
          next: (msg: RelayReqMessage) => {
            const kind = msg.type === "EVENT" ? msg.event.kind : undefined;
            for (const m of members) {
              if (!m.live || (kind !== undefined && !m.kinds.has(kind))) continue;
              m.next(msg);
            }
          },
          error: (err: unknown) => members.forEach((m) => m.live && m.error(err)),
        });
        // Events come back attributed to nothing but their kind, so two members
        // asking for one kind cannot share: the second takes a REQ of its own.
        const taken = new Set<number>();
        const shared: GroupMember[] = [];
        const alone: GroupMember[] = [];
        for (const m of group!.members) {
          if (!m.live) continue;
          if ([...m.kinds].some((kind) => taken.has(kind))) {
            alone.push(m);
            continue;
          }
          m.kinds.forEach((kind) => taken.add(kind));
          shared.push(m);
        }
        if (shared.length > 0) group!.sub = relay.req(shared.map((m) => m.filter)).subscribe(watch(shared));
        for (const m of alone) m.sub = relay.req([m.filter]).subscribe(watch([m]));
      }, 0),
    };
    pendingGroups.set(key, group);
  }
  group.members.push(member);
  const self = group;
  return {
    unsubscribe: () => {
      member.live = false;
      member.sub?.unsubscribe();
      // The shared REQ closes with its last member; while any remain it stays
      // open — the relay cannot be told to drop one filter from a live one.
      if (self.members.every((m) => !m.live)) {
        clearTimeout(self.timer);
        if (pendingGroups.get(key) === self) pendingGroups.delete(key);
        self.sub?.unsubscribe();
      }
    },
  };
}

/** Test seam. */
export function __resetSearchGroups(): void {
  for (const group of pendingGroups.values()) clearTimeout(group.timer);
  pendingGroups.clear();
}

/**
 * Streaming full search. Each callback delivers the WHOLE current list —
 * one setState per emit, and a cancelled handle never calls back again,
 * which is the entire stale-results story.
 */
export function searchStream(
  query: string,
  params: SearchParams,
  onSnapshot: (snapshot: SearchSnapshot) => void,
): SearchHandle {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;
  let turnPage: (() => void) | null = null;

  const hits: SearchHit[] = [];
  // Paging state — the page's end, whether another is on its way, and
  // whether the relay has anything left to give. Hits are deduped by id
  // across pages (and against the seed); `oldest` is the recent-sort cursor.
  let eose = false;
  let loadingMore = false;
  let exhausted = false;
  const seen = new Set<string>();
  const pageLimit = params.limit ?? DEFAULT_LIMIT;
  let oldest = Infinity;
  let pagesTurned = 0;
  const seed = params.seed ?? [];
  /** Seeded ids, and the ones the relay's own page confirmed. */
  const seeded = new Set(seed.map((h) => h.event.id));
  const confirmed = new Set<string>();
  for (const h of seed) {
    if (seen.has(h.event.id)) continue;
    seen.add(h.event.id);
    hits.push(h);
    oldest = Math.min(oldest, h.event.created_at);
  }
  // A seed of three pages means the next best-match ask is the fourth.
  if (seed.length) pagesTurned = Math.max(0, Math.ceil(seed.length / pageLimit) - 1);
  const startedAt = Date.now();
  const emit = (partial: Partial<SearchSnapshot>) => {
    if (cancelled) return;
    onSnapshot({ hits: [...hits], eose, timeMs: null, error: null, loadingMore, exhausted, ...partial });
  };

  void (async () => {
    const relay = searchRelay();
    if (!relay) {
      emit({ error: "Search is not configured" });
      return;
    }
    const observer = await resolveObserver(params);
    if (cancelled) return;

    // from:/to:/#tag/since:/until:/group:/label:/kind:/the NIP-73 scopes become NIP-01
    // filter FIELDS (the relay never sees those prefixes — verified by probing); the relay's
    // own extensions (sort:/include:spam/filter:rank:/observer:) stay in `search`. A #tag, a
    // group:, a label: or a scope asks several questions at once, so what comes back is a
    // UNION of filters ORed in one REQ.
    const lifted = liftQuery(query);
    // A typed kind: (or spec:) narrows whatever tab it is on. Everything is
    // one request with a filter per section, each routed by kind, so the typed
    // kind narrows each section rather than replacing its kinds — otherwise
    // Latest, Happening and Media would all ask for specs and fill with them.
    // Agents filter by kind this way; no chip needed.
    // On the NIPs tab a kind is what a spec COVERS (its `k` tags), not what
    // it is — `kind:5905` is the specs that define kind 5905. The relay
    // narrows by `#k` (probed 2026-09-23).
    const tabKinds = params.kinds ?? (params.band ? bandKindsForTab(params.tab) : kindsForTab(params.tab));
    const coveredKinds = params.tab === "nips" ? lifted.kinds : undefined;
    const kinds =
      lifted.kinds && !coveredKinds && !params.kinds
        ? tabKinds
          ? tabKinds.filter((k) => lifted.kinds!.includes(k))
          : lifted.kinds
        : tabKinds;
    // A section the typed kind doesn't fit asks nothing and is simply done.
    if (kinds && kinds.length === 0) {
      emit({ hits: [], eose: true, timeMs: 0, exhausted: true });
      return;
    }
    // A NIP-53 stream is published by the streaming platform's key with the
    // streamer as its `p` host, so a person's live streams are the ones they
    // HOST, not the ones their key authored (probed 2026-09-09: mar's own key
    // holds 161 ended streams with no recording; the platform's holds her 300
    // recent ones, 67 with replays). On the Live tab a person scope asks by host.
    const byHost = params.tab === "live" && !!lifted.authors;
    // `#p` matches any role; a stream is theirs when they host it (a missing
    // role reads as host — self-published streams often carry none).
    const hosts = byHost ? new Set(lifted.authors) : null;
    const hostedByThem = (event: NostrEvent) =>
      !hosts || event.tags.some((t) => t[0] === "p" && hosts.has(t[1]) && (!t[3] || t[3].toLowerCase() === "host"));
    const limit = params.limit ?? DEFAULT_LIMIT;
    // On the Live tab the author question moves to `#p`, so the grammar's own `authors` is
    // dropped and the keys ride the base every filter carries.
    const askedBy = byHost ? query.replace(/(^|\s)from:\S+/gi, " ") : query;
    const built = searchFilters(askedBy, {
      kinds,
      limit,
      searchString: (terms) => withObserver(terms, observer),
      base: {
        // What a spec COVERS rather than what it is, on the NIPs tab.
        ...(coveredKinds ? { "#k": coveredKinds.map(String) } : {}),
        // A tab with a tag of its own asks it — unless the query named tags, which the
        // grammar then asks for in a filter of their own.
        ...(!lifted["#t"] && tagsForTab(params.tab) ? { "#t": tagsForTab(params.tab)! } : {}),
        ...(byHost && lifted.authors ? { "#p": lifted.authors } : {}),
      },
      since: params.since,
    });
    const filters = params.tab === "reviews" ? askMintReviewsOnly(built) : built;
    // A scope asked of a tab that holds no comments has nothing to ask.
    if (filters.length === 0) {
      emit({ hits: [], eose: true, timeMs: 0, exhausted: true });
      return;
    }
    // What the deadline, the sort probe and the paging cursor read: every filter of a union
    // carries the same words, window and lens.
    const filter = filters[0];

    // --- Author hydration: the store answers known authors; the rest go to the shared queue.
    const wantedAuthors = new Map<string, () => void>();

    const applyProfile = (profile: NostrEvent | null) => {
      // null means the relay has nobody by that key — nothing to apply.
      if (cancelled || !profile) return;
      const author = kind0ToSearchResult(profile);
      for (const hit of hits) {
        if (hit.event.kind !== 0 && hit.event.pubkey === profile.pubkey) hit.author = author;
      }
      emit({});
    };

    const noteAuthor = (event: NostrEvent): SearchResult | null => {
      if (event.kind === 0) return kind0ToSearchResult(event);
      const known = eventStore.getReplaceable(0, event.pubkey);
      if (known) return kind0ToSearchResult(known);
      if (!wantedAuthors.has(event.pubkey)) wantedAuthors.set(event.pubkey, wantProfile(event.pubkey, applyProfile));
      return null;
    };

    // A seed from the head start (lib/headStart) carries events, not authors:
    // page one repeats those events and is deduped away, so nothing else would
    // ever fill their names in.
    if (seed.length) {
      for (const hit of hits) if (!hit.author) hit.author = noteAuthor(hit.event);
      emit({});
    }

    // --- Pages. The first REQ stays open so the relay can keep streaming
    // what arrives; every further page closes at its EOSE (the relay caps
    // concurrent subscriptions). Hits are deduped by id across pages: a
    // recent-sorted page is asked `until` the oldest second seen, which
    // returns that second again, and a best-match page is a bigger ask that
    // repeats the whole ranking so far (probed 2026-09-09: the top of the
    // ranking is stable as the limit grows).
    const recent = /(^|\s)sort:recent(\s|$)/.test(filter.search ?? "");
    const pageSubs: { unsubscribe: () => void }[] = [];

    // A union whose filters ask pairwise-disjoint kinds (Reviews: the ratings and relay
    // reviews, and NIP-87's mint reviews narrowed by `#k`) can say, by an event's kind,
    // which filter it answered — so each filter keeps a cursor of its own and runs short
    // on its own, and the union walks back like one filter does.
    const kindOwner = new Map<number, number>();
    const disjoint =
      filters.length > 1 &&
      filters.every(
        (f, i) =>
          (f.kinds?.length ?? 0) > 0 &&
          f.kinds!.every((k) => {
            if (kindOwner.has(k)) return false;
            kindOwner.set(k, i);
            return true;
          }),
      );
    const ownerOf = (event: NostrEvent): number => (filters.length === 1 ? 0 : (kindOwner.get(event.kind) ?? -1));
    // How the next page is asked for. Walking back with `until` is only correct per filter:
    // rewinding every filter of a union to the oldest second ANY of them returned skips what
    // a filter had between its own oldest and that one — silently, and for good. A union
    // that cannot route its events grows its limits instead and leans on the dedupe, which
    // is what the ranked path has always done.
    const walksBack = recent && (filters.length === 1 || disjoint);
    const filterOldest = filters.map(() => Infinity);
    const filterDone = filters.map(() => false);
    for (const h of hits) {
      const i = ownerOf(h.event);
      if (i >= 0) filterOldest[i] = Math.min(filterOldest[i], h.event.created_at);
    }
    // Two filters answer one after the other; a list read newest-first stays in time order.
    const byTime = walksBack && filters.length > 1 && !seed.length;

    const openPage = (page: import("nostr-tools").Filter[], closeAtEose: boolean, members: number[]) => {
      // The page's own size, for the short-page test below. Only meaningful when ONE filter
      // was asked: a union's filters run short independently, and `#l` finding nothing says
      // nothing about whether `#t` has more.
      const single = page.length === 1;
      const pageLimit_ = page[0]?.limit ?? pageLimit;
      let received = 0;
      const receivedBy = new Map<number, number>();
      let fresh = 0;
      // The first page of a seeded stream is a refresh: what it brings is
      // newer than the seed and goes in front of it, in arrival order.
      let insertAt = 0;
      // Ten seconds with no frame at all: on a dead socket that is the
      // outage (the request hangs in the library's reconnect backoff); on a
      // live one it is a half-open socket nothing can tell apart from slow.
      const deadline = setTimeout(() => {
        if (cancelled || answered) return;
        if (!relay.connected) {
          reportSearchFailure();
          emit({ error: SEARCH_BREAK });
        } else if (Date.now() - relay.lastMessageAt > REQ_DEADLINE_MS) {
          emit({ error: "Search is not answering right now. Try again in a moment." });
        }
      }, REQ_DEADLINE_MS);
      let answered = false;
      // Routing back from a shared REQ is by kind, so a member must name kinds
      // (Everything names none — it would be handed every other section's hits)
      // and the group's members must not ask for the same kind twice.
      //
      // A union cannot join one at all: its filters ask different tag questions of the SAME
      // kinds, so a kind no longer says which filter — or which section — an event came back
      // for. It gets a REQ of its own.
      const canGroup = single && !!params.group && !closeAtEose && !!page[0].kinds?.length;
      const open = (o: {
        error: (err: unknown) => void;
        next: (msg: { type: string; event?: NostrEvent; reason?: string }) => void;
      }) => (canGroup ? joinGroupReq(relay, params.group!, page[0], o) : relay.req(page).subscribe(o));
      const sub = open({
        error: (err: unknown) => {
          clearTimeout(deadline);
          if (cancelled) return;
          loadingMore = false;
          // A prefixed CLOSED — rate-limited:, error:, blocked: — errors the
          // observable instead of arriving as a frame. The socket is fine.
          if (err instanceof RelayClosedError) {
            emit({
              error: /rate-limited/i.test(err.message)
                ? "Too many searches are open — give it a moment and try again."
                : `Search was refused: ${err.message}`,
            });
            return;
          }
          if (!relay.connected) reportSearchFailure();
          emit({ error: relay.connected ? "Search ended unexpectedly" : SEARCH_BREAK });
        },
        next: (msg: { type: string; event?: NostrEvent; reason?: string }) => {
          if (cancelled) return;
          answered = true;
          if (msg.type === "EVENT" && msg.event) {
            const event = msg.event;
            received++;
            const owner = walksBack ? ownerOf(event) : -1;
            if (owner >= 0) receivedBy.set(owner, (receivedBy.get(owner) ?? 0) + 1);
            if (!hostedByThem(event)) return;
            // A husk deleted by overwriting is not a result (lib/blankEvent).
            if (isBlankEvent(event)) return;
            confirmed.add(event.id);
            if (seen.has(event.id)) return;
            seen.add(event.id);
            fresh++;
            oldest = Math.min(oldest, event.created_at);
            if (owner >= 0) filterOldest[owner] = Math.min(filterOldest[owner], event.created_at);
            // Into the store the moment it arrives: the search relay's corpus is
            // wider than the content relays', so a clicked result must render
            // from what we already hold, not from relays that may lack it.
            eventStore.add(event);
            const hit = { event, author: noteAuthor(event), rank: null };
            if (!closeAtEose && seed.length) hits.splice(insertAt++, 0, hit);
            else if (byTime) {
              const at = hits.findIndex((h) => h.event.created_at < event.created_at);
              hits.splice(at < 0 ? hits.length : at, 0, hit);
            } else hits.push(hit);
            emit({});
          } else if (msg.type === "EOSE") {
            eose = true;
            loadingMore = false;
            // A guess the search did not stand behind does not stay on screen.
            if (params.provisionalSeed && !closeAtEose && seeded.size > 0) {
              for (let i = hits.length - 1; i >= 0; i--) {
                const id = hits[i].event.id;
                if (seeded.has(id) && !confirmed.has(id)) {
                  hits.splice(i, 1);
                  seen.delete(id);
                }
              }
              seeded.clear();
            }
            // A page the relay returned short is the last one — counted as the relay sent it,
            // before dedupe: an `until` page always carries the boundary second again. A full
            // page with nothing new is the end too, and for a union it is the ONLY end: the
            // filters are short independently, so their total says nothing.
            // Walking back, each filter is short on its own and the list ends when all are.
            if (walksBack) {
              members.forEach((m, j) => {
                if ((receivedBy.get(m) ?? 0) < (page[j].limit ?? pageLimit)) filterDone[m] = true;
              });
              if (fresh === 0 || filterDone.every(Boolean)) exhausted = true;
            } else if (fresh === 0 || (single && received < pageLimit_)) exhausted = true;
            if (closeAtEose) sub.unsubscribe();
            emit({ timeMs: Date.now() - startedAt });
          } else if (msg.type === "CLOSED") {
            loadingMore = false;
            emit({ error: msg.reason ?? "Search ended unexpectedly" });
          }
        },
      });
      pageSubs.push({
        unsubscribe: () => {
          clearTimeout(deadline);
          sub.unsubscribe();
        },
      });
    };

    turnPage = () => {
      if (cancelled || !eose || loadingMore || exhausted) return;
      const factor = pagesTurned + 2;
      const nextLimit = pageLimit * factor;
      if (!walksBack && nextLimit > RANKED_PAGE_CEILING) {
        exhausted = true;
        emit({});
        return;
      }
      loadingMore = true;
      pagesTurned++;
      // `since` belongs to page one only: it says "we already hold everything older"
      // (SearchParams.seed). Carried onto a page asked `until` the oldest hit, it describes
      // an empty window and the section reads as exhausted.
      //
      // Every filter of the union turns together, and the side questions grow in proportion
      // so a wider page does not keep re-reading the same quarter of them.
      // Walking back, only the filters still running turn, each from its own oldest second;
      // one that brought nothing fresh has nothing to walk back from.
      const members = filters
        .map((_, i) => i)
        .filter((i) => !walksBack || (!filterDone[i] && filterOldest[i] !== Infinity));
      if (members.length === 0) {
        loadingMore = false;
        pagesTurned--;
        exhausted = true;
        emit({});
        return;
      }
      const next = members.map((i) => {
        const { since: _pageOneOnly, ...f } = filters[i];
        return walksBack ? { ...f, until: filterOldest[i] } : { ...f, limit: (f.limit ?? pageLimit) * factor };
      });
      emit({});
      openPage(next, true, members);
    };

    openPage(
      filters,
      false,
      filters.map((_, i) => i),
    );
    unsubscribe = () => {
      for (const sub of pageSubs) sub.unsubscribe();
      wantedAuthors.forEach((withdraw) => withdraw());
      wantedAuthors.clear();
    };
    if (cancelled) unsubscribe();
  })();

  const handle = (() => {
    cancelled = true;
    unsubscribe?.();
  }) as SearchHandle;
  handle.more = () => turnPage?.();
  // A seeded search has something to show before the relay answers.
  if (seed.length) emit({});
  return handle;
}

export interface AppRelease {
  version: string;
  at: number;
  /** The release event's content — Zap Store publishes markdown notes here. */
  notes: string;
  /** The release's e-tags: its asset events (the APK itself lives there). */
  assetIds: string[];
}

/**
 * Where you actually GET an app: Zap Store's page for the listing, keyed by
 * its naddr (probed: zapstore.dev/apps/<naddr> answers 200). Zap Store
 * verifies the APK's signature against the developer's Nostr key — the
 * install path that continues the trust story. Null without a d identifier.
 */
export function zapStoreUrl(event: { kind?: number; pubkey: string; tags: string[][] }): string | null {
  const d = event.tags.find((t) => t[0] === "d")?.[1];
  if (d === undefined) return null;
  try {
    return `https://zapstore.dev/apps/${nip19.naddrEncode({ kind: 32267, pubkey: event.pubkey, identifier: d })}`;
  } catch {
    return null;
  }
}

export interface ReleaseAsset {
  /** Direct download — Zap Store releases point at the APK itself. */
  url: string;
  mime: string;
  /** Bytes, when the publisher declared them. */
  size: number | null;
  version: string | null;
  /** The declared file hash (x tag) — the verify-it-yourself detail. */
  hash: string | null;
}

/**
 * The release's asset event — the APK — from the Zap Store relay. Our
 * search relay indexes listings and releases but not these (RELAY-ASKS
 * #6), so the app page makes one extra hop for the download link. Kind
 * 3063 (Zap Store's asset kind), tolerating legacy 1063 file metadata.
 * Null when the release has no assets or the relay has none of them.
 */
export function fetchReleaseAsset(ids: string[], timeoutMs = 5000): Promise<ReleaseAsset | null> {
  return new Promise((resolve) => {
    if (ids.length === 0) return resolve(null);
    const relay = zapstoreRelay();
    if (!relay) return resolve(null);
    let asset: ReleaseAsset | null = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(asset);
    };
    const timer = setTimeout(finish, timeoutMs);
    const sub = relay.req({ ids }).subscribe((msg: { type: string; event?: NostrEvent }) => {
      if (msg.type === "EVENT" && msg.event && (msg.event.kind === 3063 || msg.event.kind === 1063)) {
        const tag = (n: string) => msg.event!.tags.find((t) => t[0] === n)?.[1];
        const url = tag("url");
        if (url && !asset) {
          const size = Number(tag("size"));
          asset = {
            url,
            mime: tag("m") ?? "",
            size: Number.isFinite(size) && size > 0 ? size : null,
            version: tag("version") ?? null,
            hash: tag("x") ?? null,
          };
        }
      } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
        finish();
      }
    });
  });
}

/**
 * An app's Zap Store releases, newest first — [0] is the "What's new"
 * release, the rest are the version history. Releases are kind 30063 by
 * the same publisher, with d = "<app-d>@<version>"; the lens is
 * include:spam because we want the publisher's own releases regardless
 * of how the observer ranks them.
 */
export function fetchReleases(appD: string, publisher: string, timeoutMs = 5000): Promise<AppRelease[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const releases: AppRelease[] = [];
    const sub = relay
      .req({ kinds: [30063], authors: [publisher], search: "include:spam", limit: 50 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const d = msg.event.tags.find((t) => t[0] === "d")?.[1] ?? "";
          if (!d.startsWith(`${appD}@`)) return;
          releases.push({
            version: d.slice(appD.length + 1),
            at: msg.event.created_at,
            notes: msg.event.content ?? "",
            assetIds: msg.event.tags.filter((t) => t[0] === "e" && t[1]).map((t) => t[1]),
          });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(releases.sort((a, b) => b.at - a.at));
    }
  });
}

/** The NIP-01 address of an addressable app listing. */
export function appAddress(event: { kind?: number; pubkey: string; tags: string[][] }): string {
  const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  return `32267:${event.pubkey}:${d}`;
}

/** One Zap Store review: a comment on the listing address. */
export interface AppReview {
  id: string;
  pubkey: string;
  text: string;
  at: number;
  /** The app version the reviewer was running (`v` tag), when they said. */
  version: string | null;
  /** NIP-22 root kind (`k` tag) — "32267" for a top-level review; a reply to
   *  a review names the review's kind instead. Null on legacy kind-1 notes. */
  k: string | null;
  kind: number;
}

/**
 * Zap Store reviews: NIP-22 comments (kind 1111, plus legacy kind-1 notes)
 * whose #a is the app address. Fetched through include:spam deliberately —
 * probed 2026-09-03, the observer lens is a set FILTER applied before the
 * relay's newest-first sort (jack's perspective drops Amethyst's 14 reviews
 * to 0), not a ranker. Trust order is decided on-device, where it can be
 * labeled ("from people you follow", "verified accounts").
 */
export function fetchAppReviews(
  address: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<AppReview[]> {
  const { limit = 50, timeoutMs = 5000 } = opts;
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const reviews: AppReview[] = [];
    const sub = relay
      .req({ kinds: [1111, 1], "#a": [address], search: "include:spam", limit })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const tag = (name: string) => e.tags.find((t) => t[0] === name)?.[1] ?? null;
          reviews.push({
            id: e.id,
            pubkey: e.pubkey,
            text: e.content,
            at: e.created_at,
            version: tag("v"),
            k: tag("k"),
            kind: e.kind,
          });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(reviews.sort((a, b) => b.at - a.at));
    }
  });
}

/** One zap to an app — a micro-endorsement, sometimes with a memo. */
/** What a NIP-57 zap receipt (kind 9735) says, read once for every caller. */
export interface ZapReceipt {
  /** The zapper: the receipt's `P` tag, else the embedded zap request's pubkey — only a 64-hex key. */
  pubkey: string | null;
  /** The receipt's content, else the zap request's message, trimmed. */
  memo: string;
  /**
   * What the invoice was for, in millisats — the amount the payer paid for,
   * read from the bolt11's human-readable part. Null when the receipt names
   * no invoice amount, or when its zap request asked for a different amount
   * (NIP-57: the two must match; a receipt where they don't is not counted).
   */
  msats: number | null;
}

const HEX_KEY = /^[0-9a-f]{64}$/i;

/** Millisats per unit of a bolt11 amount's multiplier (1 BTC = 1e11 msat). */
const BOLT11_MSATS: Record<string, number> = { "": 1e11, m: 1e8, u: 1e5, n: 100, p: 0.1 };

/** A bolt11 invoice's amount in millisats, from its human-readable part ("lnbc2500u1…"); null when it names none. */
export function bolt11Msats(invoice: string | undefined): number | null {
  const m = invoice?.trim().match(/^ln(?:bcrt|bc|tbs|tb|sb)(\d+)([munp]?)1/i);
  if (!m) return null;
  const msats = Number(m[1]) * BOLT11_MSATS[m[2].toLowerCase()];
  return Number.isFinite(msats) && msats > 0 ? Math.floor(msats) : null;
}

export function parseZapReceipt(e: NostrEvent): ZapReceipt {
  let request: { pubkey?: unknown; content?: unknown; tags?: unknown } | null = null;
  try {
    const raw = e.tags.find((t) => t[0] === "description")?.[1];
    if (raw) request = JSON.parse(raw);
  } catch {
    request = null;
  }
  const P = e.tags.find((t) => t[0] === "P")?.[1];
  const candidate = P ?? (typeof request?.pubkey === "string" ? request.pubkey : null);
  const memo = (e.content.trim() || (typeof request?.content === "string" ? request.content : "")).trim();
  const invoice = bolt11Msats(e.tags.find((t) => t[0] === "bolt11")?.[1]);
  const tags = Array.isArray(request?.tags) ? (request.tags as unknown[]) : [];
  const asked = Number(tags.find((t): t is string[] => Array.isArray(t) && t[0] === "amount")?.[1]);
  const mismatched = invoice !== null && Number.isFinite(asked) && asked > 0 && asked !== invoice;
  return {
    pubkey: candidate && HEX_KEY.test(candidate) ? candidate.toLowerCase() : null,
    memo,
    msats: mismatched ? null : invoice,
  };
}

export interface AppZap {
  id: string;
  /** The zapper (receipt `P` tag, else the embedded zap request's pubkey). */
  pubkey: string | null;
  /** The zap request's message ("love amethyst"), trimmed; "" when silent. */
  memo: string;
  at: number;
}

/**
 * Zaps to an app: NIP-57 receipts (kind 9735) whose #a is the listing
 * address (Amethyst: 101, probed 2026-09-03). The receipt's `e` tag points
 * at the APK's file-metadata event, never the release — so the address is
 * the only key worth joining on.
 */
export function fetchAppZaps(address: string, opts: { limit?: number; timeoutMs?: number } = {}): Promise<AppZap[]> {
  const { limit = 50, timeoutMs = 5000 } = opts;
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const zaps: AppZap[] = [];
    const sub = relay
      .req({ kinds: [9735], "#a": [address], search: "include:spam", limit })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const { pubkey, memo } = parseZapReceipt(e);
          zaps.push({ id: e.id, pubkey, memo, at: e.created_at });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(zaps.sort((a, b) => b.at - a.at));
    }
  });
}

/**
 * The numbers on an app card: reviews (kinds 1111/1), zaps (9735) and how
 * many curated app collections (kind 30267) feature it — three NIP-45
 * COUNTs keyed by the listing address. Counts off the wire, never pages of
 * events: a results page full of cards must stay cheap.
 */
/**
 * Engagement the relay can count today (probed 2026-09-03): zaps (9735) and
 * replies (1 / 1111) that e-tag the note. Reactions and reposts aren't
 * indexed (RELAY-ASKS). Two NIP-45 COUNTs, never a page of events; a failed
 * or slow count reads as zero.
 */
/**
 * App listings (kind 32267) by address `32267:<pubkey>:<d>` — one REQ on the
 * search relay for however many addresses, keyed back by address. The home
 * feed's New releases band needs the listing's name and icon for each
 * release it shows. EOSE or timeout resolves; never rejects.
 */
export function fetchAppsByAddress(addresses: string[], timeoutMs = 5000): Promise<Map<string, NostrEvent>> {
  return new Promise((resolve) => {
    const out = new Map<string, NostrEvent>();
    const parsed = addresses
      .map((a) => a.split(":"))
      .filter((p) => p.length >= 3 && p[0] === "32267")
      .map((p) => ({ pubkey: p[1], d: p.slice(2).join(":") }));
    if (parsed.length === 0) return resolve(out);
    const relay = searchRelay();
    if (!relay) return resolve(out);
    let sub: { unsubscribe: () => void } | null = null;
    const timer = setTimeout(finish, timeoutMs);
    try {
      sub = relay
        .req({
          kinds: [32267],
          authors: [...new Set(parsed.map((p) => p.pubkey))],
          "#d": [...new Set(parsed.map((p) => p.d))],
          search: "include:spam",
          limit: parsed.length * 2,
        })
        .subscribe((msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            const e = msg.event;
            const d = e.tags.find((t) => t[0] === "d")?.[1];
            if (d === undefined) return;
            const key = `32267:${e.pubkey}:${d}`;
            const prev = out.get(key);
            if (!prev || prev.created_at < e.created_at) out.set(key, e);
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        });
    } catch {
      finish();
    }
    function finish() {
      clearTimeout(timer);
      sub?.unsubscribe();
      resolve(out);
    }
  });
}

export function fetchNoteEngagement(id: string, timeoutMs = 5000): Promise<{ zaps: number; replies: number }> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve({ zaps: 0, replies: 0 });
    const result = { zaps: 0, replies: 0 };
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve(result);
    };
    const one = () => {
      if (++done >= 2) finish();
    };
    const count = (kinds: number[], key: keyof typeof result) => {
      try {
        subs.push(
          relay.count({ kinds, "#e": [id], search: "include:spam" }).subscribe({
            next: (r: { count?: number }) => {
              result[key] = r?.count ?? 0;
            },
            error: one,
            complete: one,
          }),
        );
      } catch {
        one();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    count([9735], "zaps");
    count([1, 1111], "replies");
  });
}

export function fetchAppEndorsementCounts(
  address: string,
  timeoutMs = 5000,
): Promise<{ reviews: number; zaps: number; collections: number }> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve({ reviews: 0, zaps: 0, collections: 0 });
    const result = { reviews: 0, zaps: 0, collections: 0 };
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve(result);
    };
    const one = () => {
      if (++done >= 3) finish();
    };
    const count = (kinds: number[], key: keyof typeof result) => {
      subs.push(
        relay.count({ kinds, "#a": [address], search: "include:spam" }).subscribe({
          next: (r: { count?: number }) => {
            result[key] = r?.count ?? 0;
          },
          error: one,
          complete: one,
        }),
      );
    };
    // Timer before subscribing — see fetchRepoCounts.
    const timer = setTimeout(finish, timeoutMs);
    count([1111, 1], "reviews");
    count([9735], "zaps");
    count([30267], "collections");
  });
}

/** One trust review of a person — a Relay Outpost vouch. */
export interface PersonVouch {
  id: string;
  /** The reviewer. */
  pubkey: string;
  /** "identity" = "I personally know this is really them"; "vouch" = endorsement. */
  type: "vouch" | "identity";
  text: string;
  at: number;
}

const VOUCH_KIND = 31871;

/**
 * Trust reviews about a person: Relay Outpost's kind-31871 vouches, addressable
 * on the subject (d = p = subject), typed vouch | identity, prose content.
 * Probed 2026-09-03: the same kind also carries WalletScrutiny attestations
 * with a different schema, so only events that say s=vouched (or carry a
 * vouch/identity t) count. The event is addressable per author+subject, so
 * one voice per author — the newest.
 */
export function fetchPersonVouches(pubkey: string, timeoutMs = 5000): Promise<PersonVouch[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const byAuthor = new Map<string, PersonVouch>();
    const sub = relay
      .req({ kinds: [VOUCH_KIND], "#p": [pubkey], search: "include:spam", limit: 50 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const tag = (name: string) => e.tags.find((t) => t[0] === name)?.[1];
          const t = tag("t");
          const isVouch = tag("s") === "vouched" || t === "vouch" || t === "identity";
          if (!isVouch) return;
          const prev = byAuthor.get(e.pubkey);
          if (prev && prev.at >= e.created_at) return;
          byAuthor.set(e.pubkey, {
            id: e.id,
            pubkey: e.pubkey,
            type: t === "identity" ? "identity" : "vouch",
            text: e.content.trim(),
            at: e.created_at,
          });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve([...byAuthor.values()].sort((a, b) => b.at - a.at));
    }
  });
}

export interface VouchReply {
  id: string;
  pubkey: string;
  text: string;
  at: number;
}

/**
 * The reviewed person's public answers to vouches — NIP-22 comments (kind
 * 1111) pointing at the vouch with K=31871. Newest reply per vouch.
 */
export function fetchVouchReplies(vouchIds: string[], timeoutMs = 5000): Promise<Map<string, VouchReply>> {
  return new Promise((resolve) => {
    const replies = new Map<string, VouchReply>();
    if (vouchIds.length === 0) return resolve(replies);
    const relay = searchRelay();
    if (!relay) return resolve(replies);
    const sub = relay
      .req({ kinds: [1111], "#e": vouchIds, "#K": [String(VOUCH_KIND)], search: "include:spam", limit: 100 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const target = e.tags.find((t) => t[0] === "e")?.[1];
          if (!target) return;
          const prev = replies.get(target);
          if (prev && prev.at >= e.created_at) return;
          replies.set(target, { id: e.id, pubkey: e.pubkey, text: e.content.trim(), at: e.created_at });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(replies);
    }
  });
}

export interface PersonSetMembership {
  title: string;
  /** How many distinct exporters' follow sets include the person — the
   *  social-proof number ("Verified Human · 3"). */
  exporters: number;
  /** Who published those sets — a lone list is only as good as its author. */
  exporterPubkeys: string[];
  /** The sets themselves, so a badge can open one list's page. */
  sets: { id: string; pubkey: string }[];
}

/**
 * The follow sets a person appears in (kind 30000, #p), grouped by title
 * with a distinct-exporter count. Multiple Brainstorm instances export the
 * same pinned tag — three "Verified Human" sets naming you is three webs
 * of trust vouching, and THAT is the badge.
 */
export function fetchPersonSets(pubkey: string, timeoutMs = 5000): Promise<PersonSetMembership[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    // Per title, one set per publisher (the newest, if a publisher has several).
    const byTitle = new Map<string, Map<string, { id: string; pubkey: string; at: number }>>();
    const sub = relay
      // 200, not 50: a well-listed person sits in more sets than that, and a
      // sample-dependent tally made "Verified Human · 6" come and go between loads.
      .req({ kinds: [30000], "#p": [pubkey], search: "include:spam", limit: 200 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const title = e.tags.find((t) => t[0] === "title" || t[0] === "name")?.[1]?.trim();
          if (!title) return;
          if (!byTitle.has(title)) byTitle.set(title, new Map());
          const perPublisher = byTitle.get(title)!;
          const prev = perPublisher.get(e.pubkey);
          if (!prev || prev.at < e.created_at)
            perPublisher.set(e.pubkey, { id: e.id, pubkey: e.pubkey, at: e.created_at });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(
        [...byTitle.entries()]
          .map(([title, perPublisher]) => ({
            title,
            exporters: perPublisher.size,
            exporterPubkeys: [...perPublisher.keys()],
            sets: [...perPublisher.values()].map(({ id, pubkey: pk }) => ({ id, pubkey: pk })),
          }))
          .sort((a, b) => b.exporters - a.exporters)
          .slice(0, 6),
      );
    }
  });
}

/**
 * A repo's live activity: NIP-34 issues (1621) and patches (1617) that
 * reference the repo address by "a" tag (probed live). Newest first —
 * the repo page's "is anyone working on this?" feed.
 */
export function fetchRepoActivity(address: string, timeoutMs = 5000): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const items: NostrEvent[] = [];
    const sub = relay
      .req({ kinds: [1621, 1617, 1618], "#a": [address], search: "include:spam", limit: 20 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) items.push(msg.event);
        else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(items.sort((a, b) => b.created_at - a.created_at));
    }
  });
}

/**
 * A repo's issue and patch counts (NIP-45 COUNT, kinds 1621/1617 keyed by the
 * repo address) — the "is anyone working on this?" signal for the repo card.
 * These are TOTALS referencing the repo, not open-vs-closed: distinguishing
 * open from resolved needs NIP-34 status events, which COUNT can't filter on.
 */
export interface RepoCounts {
  issues: number;
  patches: number;
  /** Distinct authors of the repo's patches and pull requests, newest first. */
  contributors: string[];
  /** When anything — issue, patch, pull request — last touched the repo. */
  lastAt: number | null;
}

/**
 * The "is anyone working on this?" signals for a repo card: how many issues
 * and patches (NIP-45 COUNTs, keyed by the repo address), who has sent
 * patches or pull requests, and when anything last happened — the last two
 * read off one small recent page of the repo's items.
 */
export function fetchRepoCounts(address: string, timeoutMs = 5000): Promise<RepoCounts> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    const result: RepoCounts = { issues: 0, patches: 0, contributors: [], lastAt: null };
    if (!relay) return resolve(result);
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve(result);
    };
    const one = () => {
      if (++done >= 3) finish();
    };
    const count = (kind: number, key: "issues" | "patches") => {
      subs.push(
        relay.count({ kinds: [kind], "#a": [address], search: "include:spam" }).subscribe({
          next: (r: { count?: number }) => {
            result[key] = r?.count ?? 0;
          },
          error: one,
          complete: one,
        }),
      );
    };
    // Set the timer BEFORE subscribing: a synchronous count response (or the
    // fake transport in tests) can complete during subscribe, and finish()
    // clears this timer — so it must already exist.
    const timer = setTimeout(finish, timeoutMs);
    count(1621, "issues");
    count(1617, "patches");
    const seen = new Set<string>();
    subs.push(
      relay
        .req({ kinds: [1617, 1618, 1621], "#a": [address], search: "include:spam", limit: 24 })
        .subscribe((msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            const ev = msg.event;
            if (ev.created_at > (result.lastAt ?? 0)) result.lastAt = ev.created_at;
            if ((ev.kind === 1617 || ev.kind === 1618) && !seen.has(ev.pubkey)) {
              seen.add(ev.pubkey);
              result.contributors.push(ev.pubkey);
            }
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
            one();
          }
        }),
    );
  });
}

/**
 * The specs (kind 30817) that define a kind — the `k` tags they carry name
 * it, and the relay narrows by them (probed 2026-09-23). A structural
 * event's page says what its kind is by pointing here.
 */
export function fetchSpecsForKind(kind: number, timeoutMs = 5000): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const found: NostrEvent[] = [];
    const sub = relay
      .req({ kinds: [30817], "#k": [String(kind)], search: "include:spam", limit: 5 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) found.push(msg.event);
        else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(found);
    }
  });
}

/**
 * The wiki page for a NIP (kind 30818, d = "nip-46"). Several authors
 * publish competing versions — probed live, a real 10KB spec sits next to
 * 7-character stubs — so the most substantial page wins.
 */
export function fetchNipPage(dTags: string[], timeoutMs = 5000): Promise<NostrEvent | null> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay || dTags.length === 0) return resolve(null);
    let best: NostrEvent | null = null;
    const sub = relay
      .req({ kinds: [30818], "#d": dTags, search: "include:spam", limit: 10 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          if (!best || msg.event.content.length > best.content.length) best = msg.event;
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(best);
    }
  });
}

/**
 * Sibling listings that share category t-tags — the "Similar apps" row.
 * Deduped by address (listings are replaceable), self excluded, ordered by
 * how many of the given tags each one shares.
 */
export function fetchSimilarApps(tags: string[], selfAddress: string, timeoutMs = 5000): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay || tags.length === 0) return resolve([]);
    const byAddress = new Map<string, NostrEvent>();
    const sub = relay
      .req({ kinds: [32267], "#t": tags, search: "include:spam", limit: 24 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const addr = appAddress(msg.event);
          if (addr === selfAddress) return;
          const known = byAddress.get(addr);
          if (!known || msg.event.created_at > known.created_at) byAddress.set(addr, msg.event);
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      const overlap = (e: NostrEvent) => e.tags.filter((t) => t[0] === "t" && tags.includes(t[1])).length;
      resolve([...byAddress.values()].sort((a, b) => overlap(b) - overlap(a)).slice(0, 6));
    }
  });
}

/**
 * Other sellers' listings in the same categories — the "Similar" row under a
 * listing. The seller's own items are left out (the page has a row for
 * those); edits of one listing collapse to the newest; best category overlap
 * first, then newest. Case-insensitive on the tags, since marketplaces write
 * "Health & Beauty" and "health & beauty" for the same shelf.
 */
export function fetchSimilarListings(
  categories: string[],
  selfAddress: string,
  opts: { excludePubkey?: string; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay || categories.length === 0) return resolve([]);
    const wanted = new Set(categories.map((c) => c.toLowerCase()));
    const byAddress = new Map<string, NostrEvent>();
    const sub = relay
      // Deep on purpose: the seller's own listings are dropped below, and one
      // prolific seller can own the first forty in a category (Staci's 67 in
      // "Health & Beauty", 2026-09-24, left nothing similar at 40; 200 found 53).
      .req({ kinds: [30402], "#t": categories, search: "include:spam", limit: 200 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const ev = msg.event;
          if (opts.excludePubkey && ev.pubkey === opts.excludePubkey) return;
          const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
          const addr = `${ev.kind}:${ev.pubkey}:${d}`;
          if (addr === selfAddress) return;
          const known = byAddress.get(addr);
          if (!known || ev.created_at > known.created_at) byAddress.set(addr, ev);
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      const overlap = (e: NostrEvent) =>
        new Set(
          e.tags.filter((t) => t[0] === "t" && t[1] && wanted.has(t[1].toLowerCase())).map((t) => t[1].toLowerCase()),
        ).size;
      resolve(
        [...byAddress.values()].sort((a, b) => overlap(b) - overlap(a) || b.created_at - a.created_at).slice(0, 12),
      );
    }
  });
}

/**
 * Comments on an event, from the relay that indexes them. NIP-22 comments
 * name their root by coordinate (#A / #a, for addressable things like
 * listings) or by id (#E / #e); a NIP-10 reply uses #e. Marketplace apps
 * publish to their own relays, so the profile relays often hold none of it —
 * the search relay does, but refuses any filter without a lens, hence
 * include:spam on every request. Never rejects; whatever arrived by the
 * deadline is the answer.
 */
export function fetchCommentsByAddress(
  address: string | null,
  eventId: string,
  timeoutMs = 6000,
): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const filters: Record<string, unknown>[] = [
      ...(address
        ? [
            { kinds: [1111], "#A": [address] },
            { kinds: [1111], "#a": [address] },
          ]
        : []),
      { kinds: [1111], "#E": [eventId] },
      { kinds: [1, 1111], "#e": [eventId] },
    ];
    const byId = new Map<string, NostrEvent>();
    let open = filters.length;
    let done = false;
    const subs = filters.map((f) =>
      relay.req({ ...f, search: "include:spam", limit: 150 }).subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) byId.set(msg.event.id, msg.event);
        else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          if (--open <= 0) finish();
        }
      }),
    );
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve([...byId.values()]);
    }
  });
}

/**
 * What became of a page of issues and patches: one request for all of them.
 * NIP-34 status events (1630–1633) name their item by a root e-tag; the
 * newest per item wins. Under include:spam like every relay request here.
 */
export function fetchGitStatuses(ids: string[], timeoutMs = 5000): Promise<Map<string, { kind: number; at: number }>> {
  return new Promise((resolve) => {
    const out = new Map<string, { kind: number; at: number }>();
    const relay = searchRelay();
    if (!relay || ids.length === 0) return resolve(out);
    const wanted = new Set(ids);
    const sub = relay
      .req({ kinds: [1630, 1631, 1632, 1633], "#e": ids, search: "include:spam", limit: Math.max(200, ids.length * 4) })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const ev = msg.event;
          for (const t of ev.tags) {
            if (t[0] !== "e" || !wanted.has(t[1])) continue;
            const known = out.get(t[1]);
            if (!known || ev.created_at > known.at) out.set(t[1], { kind: ev.kind, at: ev.created_at });
          }
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(out);
    }
  });
}

/**
 * How much conversation a page of issues has: NIP-22 comments name their
 * root in an uppercase E tag, so one request tallies them per issue. A
 * comment seen twice counts once.
 */
export function fetchGitCommentCounts(ids: string[], timeoutMs = 5000): Promise<Map<string, number>> {
  return new Promise((resolve) => {
    const out = new Map<string, number>();
    const relay = searchRelay();
    if (!relay || ids.length === 0) return resolve(out);
    const wanted = new Set(ids);
    const seen = new Set<string>();
    const sub = relay
      .req({ kinds: [1111], "#E": ids, search: "include:spam", limit: Math.max(500, ids.length * 10) })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const ev = msg.event;
          if (seen.has(ev.id)) return;
          seen.add(ev.id);
          const root = ev.tags.find((t) => t[0] === "E" && wanted.has(t[1]))?.[1];
          if (root) out.set(root, (out.get(root) ?? 0) + 1);
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(out);
    }
  });
}

/**
 * The other announcements of one codebase: NIP-34 marks a repo by its
 * earliest unique commit, and the relay answers a #r filter on it. The repo
 * itself is left out; one announcement per maintainer, the newest.
 */
export function fetchRepoForks(euc: string, selfAddress: string, timeoutMs = 5000): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay || !euc) return resolve([]);
    const byMaintainer = new Map<string, NostrEvent>();
    const sub = relay
      .req({ kinds: [30617], "#r": [euc], search: "include:spam", limit: 50 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const ev = msg.event;
          const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
          if (`${ev.kind}:${ev.pubkey}:${d}` === selfAddress) return;
          const known = byMaintainer.get(ev.pubkey);
          if (!known || ev.created_at > known.created_at) byMaintainer.set(ev.pubkey, ev);
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve([...byMaintainer.values()]);
    }
  });
}

/**
 * The repo behind a NIP-34 coordinate ("30617:<pubkey>:<d>") — its newest
 * announcement, so an issue can link to its repo's page. Null when the
 * coordinate is malformed or nothing answers.
 */
export function fetchRepoByAddress(address: string, timeoutMs = 5000): Promise<NostrEvent | null> {
  return new Promise((resolve) => {
    const [kind, pubkey, ...rest] = address.split(":");
    const d = rest.join(":");
    const relay = searchRelay();
    if (!relay || kind !== "30617" || !/^[0-9a-f]{64}$/i.test(pubkey ?? "")) return resolve(null);
    let best: NostrEvent | null = null;
    const sub = relay
      .req({ kinds: [30617], authors: [pubkey], "#d": [d], search: "include:spam", limit: 3 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          if (!best || msg.event.created_at > best.created_at) best = msg.event;
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(best);
    }
  });
}

export interface EventRsvps {
  /** People whose latest answer is "accepted". */
  going: number;
  /** Their pubkeys, newest answer first — the faces on the card. */
  faces: string[];
}

/**
 * Who is going, for a page of calendar events: NIP-52 RSVPs (kind 31925)
 * name their event by coordinate and carry a status. One request per page;
 * a person's newest answer is the one that counts.
 */
export function fetchEventRsvps(addresses: string[], timeoutMs = 5000): Promise<Map<string, EventRsvps>> {
  return new Promise((resolve) => {
    const out = new Map<string, EventRsvps>();
    const relay = searchRelay();
    if (!relay || addresses.length === 0) return resolve(out);
    const wanted = new Set(addresses);
    const latest = new Map<string, Map<string, { status: string; at: number }>>();
    const sub = relay
      .req({ kinds: [31925], "#a": addresses, search: "include:spam", limit: Math.max(500, addresses.length * 20) })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const ev = msg.event;
          const addr = ev.tags.find((t) => t[0] === "a" && wanted.has(t[1]))?.[1];
          if (!addr) return;
          const status = (ev.tags.find((t) => t[0] === "status")?.[1] ?? "").toLowerCase();
          const people = latest.get(addr) ?? new Map();
          const known = people.get(ev.pubkey);
          if (!known || ev.created_at > known.at) people.set(ev.pubkey, { status, at: ev.created_at });
          latest.set(addr, people);
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      for (const [addr, people] of latest) {
        const going = [...people.entries()]
          .filter(([, v]) => v.status === "accepted")
          .sort((a, b) => b[1].at - a[1].at);
        if (going.length) out.set(addr, { going: going.length, faces: going.slice(0, 6).map(([pk]) => pk) });
      }
      resolve(out);
    }
  });
}

/** What a NIP-75 zap goal has raised so far, and from whom. */
export interface GoalProgress {
  sats: number;
  /** Zappers, most recent first, once each. */
  zappers: string[];
}

/**
 * Progress for NIP-75 zap goals: the zap receipts (9735) that `e`-tag each
 * goal, one REQ on the search relay for a page of goals. A receipt counts
 * its invoice's amount (parseZapReceipt), never the amount its zap request
 * merely asked for; receipt signers are not checked against the goal
 * owner's LNURL server, so this is what the network reports, not an audit.
 * A goal's `closed_at` (in `closesAt`, by id) ends it: receipts after it
 * don't count (NIP-75).
 *
 * `complete` says whether the answer is the whole answer: the relay reached
 * EOSE before the deadline without filling the page. Only then does a goal
 * with no receipt mean "raised nothing"; otherwise its progress is unknown.
 * Never rejects.
 */
export function fetchGoalProgress(
  goalIds: string[],
  timeoutMs = 5000,
  closesAt?: ReadonlyMap<string, number>,
): Promise<{ byGoal: Map<string, GoalProgress>; complete: boolean }> {
  return new Promise((resolve) => {
    const byGoal = new Map<string, GoalProgress>();
    const relay = searchRelay();
    if (!relay || goalIds.length === 0) return resolve({ byGoal, complete: false });
    const wanted = new Set(goalIds);
    const seen = new Set<string>();
    const limit = Math.min(2000, goalIds.length * 200);
    let complete = false;
    const tally = new Map<string, { msats: number; zappers: { pk: string; at: number }[] }>();
    const sub = relay
      .req({ kinds: [9735], "#e": goalIds, search: "include:spam", limit })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          if (seen.has(e.id)) return;
          seen.add(e.id);
          const goal = e.tags.find((t) => t[0] === "e" && wanted.has(t[1]))?.[1];
          if (!goal) return;
          const closes = closesAt?.get(goal);
          if (closes !== undefined && e.created_at > closes) return;
          const receipt = parseZapReceipt(e);
          const row = tally.get(goal) ?? { msats: 0, zappers: [] };
          if (receipt.msats) row.msats += receipt.msats;
          if (receipt.pubkey) row.zappers.push({ pk: receipt.pubkey, at: e.created_at });
          tally.set(goal, row);
        } else if (msg.type === "EOSE") {
          complete = seen.size < limit;
          finish();
        } else if (msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.unsubscribe();
      for (const [goal, row] of tally) {
        const zappers = [...new Set(row.zappers.sort((a, b) => b.at - a.at).map((z) => z.pk))];
        byGoal.set(goal, { sats: Math.floor(row.msats / 1000), zappers });
      }
      resolve({ byGoal, complete });
    }
  });
}

/**
 * The events an event page shows under a thing (a community's posts, a
 * calendar's events, a badge's awards…): the given filters in one socket,
 * under include:spam like every relay request here — the page is about one
 * thing its reader chose, and the author's own trust is on the page. De-duped,
 * newest first. EOSE on every filter or timeout resolves; never rejects.
 */
export function fetchFromSearch(
  filters: Record<string, unknown>[],
  { limit = 60, timeoutMs = 6000 }: { limit?: number; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay || filters.length === 0) return resolve([]);
    const byId = new Map<string, NostrEvent>();
    const subs: { unsubscribe(): void }[] = [];
    let open = filters.length;
    let done = false;
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve([...byId.values()].sort((a, b) => b.created_at - a.created_at));
    }
    for (const f of filters) {
      // A filter is settled by its EOSE, a CLOSED, or its stream failing — once.
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (--open <= 0) finish();
      };
      const sub = relay.req({ limit, ...f, search: "include:spam" }).subscribe({
        next: (msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) byId.set(msg.event.id, msg.event);
          else if (msg.type === "EOSE" || msg.type === "CLOSED") settle();
        },
        error: settle,
      });
      if (done) sub.unsubscribe();
      else subs.push(sub);
    }
  });
}

/**
 * Addressable events by coordinate (`kind:pubkey:d`) from the search relay —
 * a calendar's events, a playlist's tracks, a rating's subject. The filter is
 * a cross-product of the kinds, authors and d-tags asked, so it can match
 * coordinates nobody asked for; only the asked ones come back, newest version
 * of each, keyed by coordinate.
 */
export async function fetchByAddress(coords: string[], timeoutMs = 6000): Promise<Map<string, NostrEvent>> {
  const parsed = [...new Set(coords)]
    .map((c) => c.split(":"))
    .filter((p) => p.length >= 3 && /^\d+$/.test(p[0]) && /^[0-9a-f]{64}$/i.test(p[1]))
    .map((p) => ({ kind: Number(p[0]), pubkey: p[1].toLowerCase(), d: p.slice(2).join(":") }));
  const out = new Map<string, NostrEvent>();
  if (parsed.length === 0) return out;
  const wanted = new Set(parsed.map((p) => `${p.kind}:${p.pubkey}:${p.d}`));
  const events = await fetchFromSearch(
    [
      {
        kinds: [...new Set(parsed.map((p) => p.kind))],
        authors: [...new Set(parsed.map((p) => p.pubkey))],
        "#d": [...new Set(parsed.map((p) => p.d))],
      },
    ],
    { limit: Math.min(500, parsed.length * 3), timeoutMs },
  );
  for (const e of events) {
    const key = `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
    if (!wanted.has(key)) continue;
    const held = out.get(key);
    if (!held || e.created_at > held.created_at) out.set(key, e);
  }
  return out;
}

/**
 * Cheap kind-0 typeahead: resolves at EOSE or the deadline with whatever
 * arrived — never rejects (a silent suggest beats a broken one).
 */
export function suggestProfiles(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey">,
  opts?: { limit?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<SearchResult[]> {
  return suggestProfileHits(query, params, opts).then((hits) =>
    hits.map((hit) => hit.author).filter((author): author is SearchResult => !!author),
  );
}

/**
 * The same suggestions, as the hits they arrived as.
 *
 * The typeahead shows people; the People section then shows the same people,
 * asked the same way. Keeping the events means a submit can seed that section
 * with what is already on screen instead of asking for it again.
 */
export function suggestProfileHits(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey">,
  opts?: { limit?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<SearchHit[]> {
  return collectHits(query, { ...params, tab: "people" }, opts, (hit) => (hit.author ? hit.event.pubkey : null));
}

/**
 * Product titles in the typeahead — "Satoshi Smiley T-shirt", straight to
 * the listing. Only listings for sale now, only titles that hold every
 * typed word, one row per product (a seller's same-title copies count
 * once). A query with no plain words asks nothing.
 */
export function suggestListings(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey">,
  opts?: { limit?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<SearchHit[]> {
  const words = (typeaheadWords(query) ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return Promise.resolve([]);
  return collectHits(query, { ...params, tab: "shop" }, { limit: 3, ...opts }, (hit) => {
    const l = parseListing(hit.event);
    if (!l || !isSellable(l)) return null;
    const title = l.title.toLowerCase();
    if (!words.every((w) => title.includes(w))) return null;
    return `${hit.event.pubkey}|${title.replace(/\s+/g, " ").trim()}`;
  });
}

/**
 * A stream turned into one answer: the first hit per key, in arrival order,
 * resolved at EOSE or the deadline with whatever arrived — never rejects (a
 * silent suggest beats a broken one). `keyOf` says which hits count and
 * which are the same one.
 */
function collectHits(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey" | "tab">,
  opts: { limit?: number; timeoutMs?: number; signal?: AbortSignal } | undefined,
  keyOf: (hit: SearchHit) => string | null,
): Promise<SearchHit[]> {
  const limit = opts?.limit ?? 10;
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const signal = opts?.signal;
  if (signal?.aborted) return Promise.resolve([]);
  return new Promise((resolve) => {
    const seen = new Map<string, SearchHit>();
    // Declared before the stream opens. A stream that answers synchronously — an unconfigured
    // relay emits its error on the spot — calls `finish` while these are still being
    // assigned, and a `const` would be in its dead zone (a ReferenceError, not a result).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: SearchHandle | undefined;
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      cancel?.();
      resolve([...seen.values()].slice(0, limit));
    }
    cancel = searchStream(
      query,
      { tab: params.tab, pov: params.pov, userPubkey: params.userPubkey, limit },
      (snapshot) => {
        for (const hit of snapshot.hits) {
          const key = keyOf(hit);
          if (key !== null && !seen.has(key)) seen.set(key, hit);
        }
        if (snapshot.eose || snapshot.error) finish();
      },
    );
    if (done) {
      cancel();
      return;
    }
    timer = setTimeout(finish, timeoutMs);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
