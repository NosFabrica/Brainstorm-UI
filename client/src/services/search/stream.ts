/**
 * The streaming search: what a tab asks the relay (askForTab), and the stream of its pages
 * (searchStream), whose first page may share one REQ with its page's other sections (joinGroupReq).
 */
import type { NostrEvent } from "nostr-tools";
import { RelayClosedError } from "applesauce-relay";
import type { Relay, RelayReqMessage } from "applesauce-relay";
import { reportSearchFailure } from "@/lib/serverStatus";
import { searchRelay } from "@/lib/searchRelay";
import { EVENT_LISTS } from "@/config/events";
import { EVENT_ITEM_KIND } from "@/lib/calendarEvent";
import { eventStore } from "@/lib/eventStore";
import { liftQuery, searchFilters, withObserver } from "@/lib/searchSyntax";
import { CLASSIC_VINE_KIND, VINE_ARCHIVE_LABEL, mediaFacetOf, withoutVineArchiveTag } from "@/lib/mediaFacet";
import { wantProfile } from "@/services/authorProfileQueue";
import type { SearchResult } from "@/lib/profileSearch";
import { isBlankEvent } from "@/lib/blankEvent";
import { isExpired } from "@/lib/nip40";
import { readProfileRows } from "@/lib/eventCache";
import { addressOf, beats } from "@/lib/newestPerAddress";
import { askMintReviewsOnly, bandKindsForTab, kindsForTab, tagsForTab } from "./tabs";
import type { SearchGroup, SearchHandle, SearchHit, SearchParams, SearchSnapshot } from "./types";
import {
  isMember,
  kind0ToSearchResult,
  lacksPerspective,
  NO_PERSPECTIVE,
  narrowToMembers,
  resolveObserver,
} from "./query";

/** A page's size — index.html's head start for All asks the same (headStart.test holds it). */
export const DEFAULT_LIMIT = 100;
/** How long a page's unknown authors wait to be asked together, at most (EOSE asks at once): a streaming list's… */
const AUTHOR_BATCH_MS = 1000;
/** …and a best-match page's, which ends (EOSE) soon after its first hits anyway. */
const AUTHOR_BATCH_MAX_MS = 4000;
/** The device's own copies are read for whoever arrived within this long of each other. */
const DEVICE_PEEK_MS = 150;
/** A coalesced snapshot's latest, when no frame comes (a hidden tab): about three frames. */
export const FRAME_FALLBACK_MS = 50;
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

/**
 * A relay's copy, through the store: what it keeps is what we show. The store verifies
 * (null for a forged or expired event) and answers a replaceable or addressable with the
 * newest version it holds, so a lagging relay cannot revert one (ADR 0005).
 */
function keepInStore(event: NostrEvent): NostrEvent | null {
  try {
    return eventStore.add(event) ?? null;
  } catch {
    return null; // a copy the verifier chokes on is no copy
  }
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
 * What a tab asks the relay for these words, through this lens: the filters of one REQ — or of
 * a COUNT of the same question (countTabs). No filters means the tab has nothing to ask: a typed kind none of its kinds fit, or a scope it holds nothing for.
 */
export interface TabAsk {
  filters: ReturnType<typeof searchFilters>;
  /** What the page keeps of what comes back: on the Live tab with a person scope, the streams they host. */
  keeps: (event: NostrEvent) => boolean;
}

export function askForTab(query: string, params: SearchParams, observer: string | null): TabAsk {
  // from:/to:/#tag/since:/until:/group:/label:/kind:/the NIP-73 scopes become NIP-01
  // filter FIELDS (the relay never sees those prefixes — verified by probing); the relay's
  // own extensions (sort:/include:spam/filter:rank:/observer:) stay in `search`. A #tag, a
  // group:, a label: or a scope asks several questions at once, so what comes back is a
  // UNION of filters ORed in one REQ.
  const lifted = liftQuery(query);
  // A typed kind: (or spec:) narrows whatever tab it is on. Top is
  // one request with a filter per section, each routed by kind, so the typed
  // kind narrows each section rather than replacing its kinds — otherwise
  // Latest, Happening and Media would all ask for specs and fill with them.
  // Agents filter by kind this way; no chip needed.
  // On the NIPs tab a kind is what a spec COVERS (its `k` tags), not what
  // it is — `kind:5905` is the specs that define kind 5905. The relay
  // narrows by `#k` (probed 2026-09-23).
  // On the Media tab itself `#vine-archive` is the Classic Vines chip (lib/mediaFacet): the
  // Vines Divine restored, which carry that word as a NIP-32 label and never as a `t` (probed
  // 2026-10-12). Asked as a hashtag it is a `#t` filter that finds none of them and an `#l`
  // filter at a quarter of the page, over every media kind; asked as the chip it is their
  // one kind with the label on every filter, a whole page. A preview band is not the tab.
  // (The Videos chip needs nothing here: it is `kind:video`, a typed kind, narrowed just below.)
  const vines = params.tab === "media" && !params.band && !params.kinds && mediaFacetOf(query) === "vines";
  const tabKinds =
    params.kinds ?? (vines ? [CLASSIC_VINE_KIND] : params.band ? bandKindsForTab(params.tab) : kindsForTab(params.tab));
  const coveredKinds = params.tab === "nips" ? lifted.kinds : undefined;
  const kinds =
    lifted.kinds && !coveredKinds && !params.kinds
      ? tabKinds
        ? tabKinds.filter((k) => lifted.kinds!.includes(k))
        : lifted.kinds
      : tabKinds;
  // A section the typed kind doesn't fit asks nothing.
  if (kinds && kinds.length === 0) return { filters: [], keeps: () => true };
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
  // The Classic Vines hashtag leaves the grammar's hands too: it is the label on the base.
  const asVines = vines ? withoutVineArchiveTag(query) : query;
  const askedBy = byHost ? asVines.replace(/(^|\s)from:\S+/gi, " ") : asVines;
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
      ...(vines ? { "#l": [VINE_ARCHIVE_LABEL] } : {}),
      ...params.tags,
    },
    since: params.since,
  });
  // The Events tab asks Event Index's list items beside NIP-52 (config/events): public events
  // from Luma, Meetup and other feeds reach Brainstorm only as those items. Not under a typed
  // `kind:`, which names what it wants, and not for a band (Top's Happening section).
  const listed =
    params.tab === "events" && !params.band && !params.kinds && !lifted.kinds
      ? searchFilters(askedBy, {
          kinds: [EVENT_ITEM_KIND],
          limit,
          searchString: (terms) => withObserver(terms, observer),
          base: { "#z": [...EVENT_LISTS] },
          since: params.since,
        })
      : [];
  const filters =
    params.tab === "reviews"
      ? askMintReviewsOnly(built)
      : vines
        ? // Another hashtag beside the chip asks its own `#l` in a side filter, which would
          // take the archive's label off that filter and let in what is not a Vine. A
          // `label:` beside it does the same with kind 1985 label events: its filter goes
          // too, and with nothing else to ask the page is empty.
          built.filter((f) => f["#l"]?.includes(VINE_ARCHIVE_LABEL))
        : [...built, ...listed];
  // A scope asked of a tab that holds no comments has nothing to ask: `filters` is empty.
  const { members } = params;
  if (!members) return { filters, keeps: hostedByThem };
  return {
    filters: narrowToMembers(filters, members),
    keeps: (event) => hostedByThem(event) && isMember(event, members),
  };
}

/**
 * Streaming full search. Each callback delivers the WHOLE current list —
 * one setState per emit, and a cancelled handle never calls back again,
 * which is the entire stale-results story.
 *
 * Arrivals are coalesced to one snapshot per frame: every relay frame is its own
 * task, so React cannot batch them, and a 300-hit page used to re-render the
 * results 300 times (plus once per author profile). What a reader waits on —
 * the first hit, the page's end, an error, a page turning — still goes out at once.
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
  // Keyed by address (lib/newestPerAddress): a regular event's is its id, a replaceable's or
  // an addressable's is its kind:pubkey:d, so two versions of one are one row.
  const seen = new Set<string>();
  const pageLimit = params.limit ?? DEFAULT_LIMIT;
  let oldest = Infinity;
  let pagesTurned = 0;
  const seed = params.seed ?? [];
  /** Seeded ids, and the ones the relay's own page confirmed. */
  const seeded = new Set(seed.map((h) => h.event.id));
  const confirmed = new Set<string>();
  for (const h of seed) {
    if (seen.has(addressOf(h.event))) continue;
    seen.add(addressOf(h.event));
    hits.push(h);
    oldest = Math.min(oldest, h.event.created_at);
  }
  // A seed of three pages means the next best-match ask is the fourth.
  if (seed.length) pagesTurned = Math.max(0, Math.ceil(seed.length / pageLimit) - 1);
  const startedAt = Date.now();
  // A snapshot scheduled for the next frame. The timeout is the hidden tab's
  // fallback: rAF does not fire there, and a result still has to land.
  let frame: number | undefined;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  /** A snapshot with hits in it has gone out: arrivals after it may wait a frame. */
  let shownHits = false;
  /** The stream's error stands until the relay answers again (an EVENT or EOSE after it). */
  let error: string | null = null;
  const unschedule = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    clearTimeout(fallback);
    frame = fallback = undefined;
  };
  // At once: it carries everything that has arrived, so a snapshot that was waiting
  // for a frame is superseded by it.
  const emit = (partial: Partial<SearchSnapshot>) => {
    unschedule();
    if (cancelled) return;
    if (hits.length) shownHits = true;
    if (partial.error !== undefined) error = partial.error;
    onSnapshot({ hits: [...hits], eose, timeMs: null, loadingMore, exhausted, ...partial, error });
  };
  // A hit or an author arrived: on the next frame, with whatever else arrives before it.
  const emitSoon = () => {
    if (cancelled) return;
    if (!shownHits) return emit({});
    if (fallback !== undefined) return;
    const flush = () => emit({});
    if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(flush);
    fallback = setTimeout(flush, FRAME_FALLBACK_MS);
  };

  void (async () => {
    const relay = searchRelay();
    if (!relay) {
      emit({ error: "Search is not configured" });
      return;
    }
    const observer = await resolveObserver(params);
    if (cancelled) return;
    if (lacksPerspective(query, observer)) {
      emit({ error: NO_PERSPECTIVE });
      return;
    }

    const { filters, keeps: hostedByThem } = askForTab(query, params, observer);
    // A section the typed kind doesn't fit, or a scope asked of a tab that holds no comments,
    // has nothing to ask and is simply done.
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
      emitSoon();
    };

    // A recent-sorted page streams; a best-match one arrives over seconds and ends.
    const recent = /(^|\s)sort:recent(\s|$)/.test(filter.search ?? "");

    // Authors the store does not hold are asked of the relay together: a best-match
    // page's at its end (capped), a streaming list's every second. Asked per arrival,
    // a page that trickled in sent a REQ of one or two authors each time (probed
    // 2026-10-07: five kind-0 REQs of 4, 2, 1, 1, 1 for one All search). The device's
    // own copies don't wait for that: they are read as the authors arrive.
    const authorWait = recent ? AUTHOR_BATCH_MS : AUTHOR_BATCH_MAX_MS;
    const pendingAuthors = new Set<string>();
    let authorTimer: ReturnType<typeof setTimeout> | undefined;
    const peeked = new Set<string>();
    let peekTimer: ReturnType<typeof setTimeout> | undefined;
    const peekDevice = () => {
      peekTimer = undefined;
      const batch = [...pendingAuthors].filter((pk) => !peeked.has(pk));
      batch.forEach((pk) => peeked.add(pk));
      if (!batch.length) return;
      // What this device already holds names the row now; the queue still asks the relay
      // for what it lacks (and refreshes an old copy) when the page's authors go.
      void readProfileRows(batch)
        .then((rows) => {
          if (cancelled) return;
          for (const row of rows.values()) {
            try {
              if (!eventStore.add(row.event)) continue;
            } catch {
              continue; // the store verifies, and a bad copy is no name
            }
            applyProfile(row.event);
          }
        })
        .catch(() => undefined);
    };
    const askAuthors = () => {
      clearTimeout(authorTimer);
      authorTimer = undefined;
      if (cancelled) return;
      for (const pubkey of pendingAuthors)
        if (!wantedAuthors.has(pubkey)) wantedAuthors.set(pubkey, wantProfile(pubkey, applyProfile));
      pendingAuthors.clear();
    };
    const noteAuthor = (event: NostrEvent): SearchResult | null => {
      if (event.kind === 0) return kind0ToSearchResult(event);
      const known = eventStore.getReplaceable(0, event.pubkey);
      if (known) return kind0ToSearchResult(known);
      if (!wantedAuthors.has(event.pubkey) && !pendingAuthors.has(event.pubkey)) {
        pendingAuthors.add(event.pubkey);
        authorTimer ??= setTimeout(askAuthors, authorWait);
        peekTimer ??= setTimeout(peekDevice, DEVICE_PEEK_MS);
      }
      return null;
    };

    // A seed from the head start (lib/headStart) carries events, not authors:
    // page one repeats those events and is deduped away, so nothing else would
    // ever fill their names in.
    if (seed.length) {
      for (const hit of hits) if (!hit.author) hit.author = noteAuthor(hit.event);
      askAuthors();
      emit({});
    }

    // --- Pages. The first REQ stays open so the relay can keep streaming
    // what arrives; every further page closes at its EOSE (the relay caps
    // concurrent subscriptions). Hits are deduped by id across pages: a
    // recent-sorted page is asked `until` the oldest second seen, which
    // returns that second again, and a best-match page is a bigger ask that
    // repeats the whole ranking so far (probed 2026-09-09: the top of the
    // ranking is stable as the limit grows).
    let headStart = params.firstPage;
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
      // (a kind-less ask names none — it would be handed every other section's hits)
      // and the group's members must not ask for the same kind twice.
      //
      // A union cannot join one at all: its filters ask different tag questions of the SAME
      // kinds, so a kind no longer says which filter — or which section — an event came back
      // for. It gets a REQ of its own.
      const canGroup = single && !!params.group && !closeAtEose && !!page[0].kinds?.length;
      const open = (o: {
        error: (err: unknown) => void;
        next: (msg: { type: string; event?: NostrEvent; reason?: string }) => void;
      }) => {
        const ask = () => (canGroup ? joinGroupReq(relay, params.group!, page[0], o) : relay.req(page).subscribe(o));
        // The first page only, once: a head start already asked it.
        const follow = headStart;
        headStart = undefined;
        if (!follow) return ask();
        let asked: { unsubscribe: () => void } | null = null;
        const followed = follow({
          next: (msg) => o.next(msg),
          // It ended without an answer: ask the relay after all.
          error: () => {
            asked ??= cancelled ? null : ask();
          },
        });
        return {
          unsubscribe: () => {
            followed.unsubscribe();
            asked?.unsubscribe();
          },
        };
      };
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
          // The relay is answering: a warning that it wasn't no longer stands.
          if (msg.type === "EVENT" || msg.type === "EOSE") error = null;
          if (msg.type === "EVENT" && msg.event) {
            const relayCopy = msg.event;
            received++;
            const owner = walksBack ? ownerOf(relayCopy) : -1;
            if (owner >= 0) receivedBy.set(owner, (receivedBy.get(owner) ?? 0) + 1);
            if (!hostedByThem(relayCopy)) return;
            // A husk deleted by overwriting is not a result (lib/blankEvent).
            // Nor is one past its NIP-40 expiration: "clients SHOULD ignore events that have expired".
            const unshown = (e: NostrEvent) => isBlankEvent(e) || isExpired(e, Math.floor(Date.now() / 1000));
            if (unshown(relayCopy)) return;
            confirmed.add(relayCopy.id);
            // Into the store the moment it arrives: the search relay's corpus is
            // wider than the content relays', so a clicked result must render
            // from what we already hold, not from relays that may lack it. The
            // store verifies (a refused event is no result) and answers a
            // replaceable with the newest version it holds: a lagging relay's
            // older copy shows as that winner (ADR 0005).
            const event = keepInStore(relayCopy);
            if (!event || (event !== relayCopy && unshown(event))) return;
            confirmed.add(event.id);
            if (owner >= 0) filterOldest[owner] = Math.min(filterOldest[owner], relayCopy.created_at);
            oldest = Math.min(oldest, relayCopy.created_at);
            const address = addressOf(event);
            if (seen.has(address)) {
              // A newer version of an address already on screen takes its row.
              const at = hits.findIndex((h) => addressOf(h.event) === address);
              if (at >= 0 && event.id !== hits[at].event.id && beats(event, hits[at].event)) {
                hits[at] = { ...hits[at], event, author: noteAuthor(event) };
                emitSoon();
              }
              return;
            }
            seen.add(address);
            fresh++;
            const hit = { event, author: noteAuthor(event), rank: null };
            // The first page stays open on a recent-sorted stream: what it streams after its
            // EOSE is newer than the list, which reads newest first, so it goes in by time.
            const live = recent && !closeAtEose && eose;
            if (!closeAtEose && seed.length && !live) hits.splice(insertAt++, 0, hit);
            else if (byTime || live) {
              const at = hits.findIndex((h) => h.event.created_at < event.created_at);
              hits.splice(at < 0 ? hits.length : at, 0, hit);
            } else hits.push(hit);
            emitSoon();
          } else if (msg.type === "EOSE") {
            eose = true;
            loadingMore = false;
            askAuthors();
            // A guess the search did not stand behind does not stay on screen.
            if (params.provisionalSeed && !closeAtEose && seeded.size > 0) {
              for (let i = hits.length - 1; i >= 0; i--) {
                const id = hits[i].event.id;
                if (seeded.has(id) && !confirmed.has(id)) {
                  seen.delete(addressOf(hits[i].event));
                  hits.splice(i, 1);
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
      clearTimeout(authorTimer);
      clearTimeout(peekTimer);
      pendingAuthors.clear();
      wantedAuthors.forEach((withdraw) => withdraw());
      wantedAuthors.clear();
    };
    if (cancelled) unsubscribe();
  })();

  const handle = (() => {
    cancelled = true;
    unschedule();
    unsubscribe?.();
  }) as SearchHandle;
  handle.more = () => turnPage?.();
  // A seeded search has something to show before the relay answers.
  if (seed.length) emit({});
  return handle;
}
