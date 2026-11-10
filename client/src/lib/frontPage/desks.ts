/**
 * What a front page is made of: the desks, the filters that read them, and the
 * three desks whose events get a real destination.
 *
 * Ported from NosFabrica/the-nostr-observer @ 0901b92 (MIT, see ./LICENSE.observer):
 * `.claude/skills/nostr-observer/scripts/corpus.mjs` (DESKS, filterFor, belongs),
 * `chain.mjs` (rankedProbe) and `nostr.mjs` (DESK_LINKS). The NIP-19 encoding is
 * nostr-tools' instead of the hand-rolled bech32 there.
 */
import { nip19, type NostrEvent } from "nostr-tools";

export const WINDOW_SECONDS = 24 * 60 * 60;

/**
 * The token that opens the search relay to an UNRANKED query.
 *
 * The relay CLOSES every REQ whose `search` carries neither an `observer:<hex>`
 * token nor `include:spam` ("auth-required: this relay answers through a web of
 * trust…"), so a plain lookup — a kind 0 — must say `include:spam` to be answered
 * at all. The ranked desks name their observer and need nothing.
 */
export const INCLUDE_SPAM = "include:spam";

/**
 * The trust floor, and it is NOT redundant with `limit`.
 *
 * Counts over one 24-hour window for the prototype observer: no floor 35,084 ·
 * gte:5 22,899 · gte:10 16,265 · gte:20 11,838 · gte:50 6,834. At limit=400,
 * adding gte:20 replaced 49 of the 400 — so the top-N is not a strict top-N by
 * the same score the floor uses.
 *
 * It is NEVER applied to the control run. That query is the anonymous read, and
 * filtering it would destroy the only comparison this page makes.
 */
export const DEFAULT_TRUST_FLOOR = 20;

export interface Desk {
  key: string;
  kinds: number[];
  label: string;
  limit: number;
  keeps?: (event: NostrEvent) => boolean;
}

export function tagValue(event: Pick<NostrEvent, "tags"> | null | undefined, name: string): string | null {
  return event?.tags?.find((t) => t[0] === name)?.[1] ?? null;
}

export function tagsNamed(event: Pick<NostrEvent, "tags"> | null | undefined, name: string): string[][] {
  return (event?.tags ?? []).filter((t) => t[0] === name);
}

/**
 * The desks a front page is made of, and why each earns a column.
 *
 * Not "every kind the relay holds" — the kinds that turned out to carry a story.
 * A desk is one REQ, so a desk that returns nothing costs one subscription and
 * answers "was there any today" honestly.
 *
 * ONE REQ PER DESK, never one REQ carrying all the filters. The control run is
 * kind 1 exactly like the notes desk; merged into one subscription its anonymous
 * results land in the ranked notes and the overlap figure goes to ~100%.
 */
export const DESKS: Desk[] = [
  { key: "notes", kinds: [1], label: "Notes", limit: 400 },
  { key: "pictures", kinds: [20], label: "Picture posts", limit: 60 },
  // A kind 30311 is replaceable and carries a `status`, so the record of a finished
  // stream sits in the window looking exactly like a running one. Measured: of 18 in
  // a 24-hour window, 11 were live and 7 had ended.
  {
    key: "live",
    kinds: [30311],
    label: "Live now",
    limit: 30,
    keeps: (e) => (tagValue(e, "status") ?? "").toLowerCase() === "live",
  },
  { key: "polls", kinds: [1068], label: "Polls", limit: 20 },
  // NIP-71 moved video to kinds 21 and 22, replacing 34235 and 34236. Measured on one
  // window at floor 20: kind 21 -> 0, kind 34235 -> 6; kind 22 -> 0, kind 34236 -> 37.
  // Asking only for the current kinds would print no video at all.
  { key: "videos", kinds: [21, 34235], label: "Videos", limit: 40 },
  { key: "shorts", kinds: [22, 34236], label: "Short videos", limit: 40 },
  { key: "files", kinds: [1063], label: "File metadata", limit: 50 },
  { key: "highlights", kinds: [9802], label: "Highlights", limit: 50 },
  { key: "articles", kinds: [30023], label: "Long-form", limit: 100 },
  { key: "classifieds", kinds: [30402], label: "Classifieds", limit: 30 },
  { key: "wiki", kinds: [30818], label: "Wiki entries", limit: 30 },
  // 31922 is the all-day half of NIP-52 and 31923 the timed half. Reading only one
  // of them drops whole-day events silently.
  { key: "calendar", kinds: [31922, 31923], label: "Calendar events", limit: 100 },
  { key: "apps", kinds: [32267], label: "App releases", limit: 30 },
  { key: "git", kinds: [30617], label: "Code repositories", limit: 30 },
];

export interface DeskFilter {
  kinds: number[];
  since: number;
  until: number;
  limit: number;
  search: string;
}

/**
 * A bare `observer:<pk> sort:rank` with no search term is a valid NIP-50 query and
 * returns a ranked recency feed. That is the whole product, and it looks like a
 * mistake: every other client sends a term.
 *
 * A null observer is the control run. `sort:rank` WITHOUT a resolvable observer does
 * not fail — it silently becomes the anonymous ranking, which on a measured window
 * was 209 of 400 posts from one spam account. Nothing may get here without a lens
 * the readiness gate has already confirmed.
 *
 * The control says `include:spam` because the relay's auth gate CLOSES a bare
 * `sort:rank`. It is still the anonymous ranking, not a recency cut — measured
 * 2026-08-30, `include:spam sort:rank` and plain `include:spam` at the same limit
 * share 0 events — so the Instrument's comparison is unchanged.
 */
export function filterFor(
  kinds: number[],
  since: number,
  until: number,
  limit: number,
  observerHex: string | null,
  floor: number,
): DeskFilter {
  return {
    kinds,
    since,
    // BOTH ends. `until` was once carried all the way through and never put into a
    // filter, so the window had a start and no finish.
    until,
    limit,
    search: observerHex ? `observer:${observerHex} sort:rank filter:rank:gte:${floor}` : `${INCLUDE_SPAM} sort:rank`,
  };
}

/**
 * Two rules a filter cannot express.
 *
 * `keeps` drops a live stream that has already ended. And the reader's own posts are
 * not the news: a paper is what OTHER people did today. They rank highly through
 * your own web of trust almost by construction, so without this they crowd the front
 * page. They stay in the CONTROL run, which measures the network rather than a page.
 */
export function belongs(desk: Desk, observerHex: string, events: NostrEvent[]): NostrEvent[] {
  return events.filter((e) => (desk.keeps ? desk.keeps(e) : true) && e.pubkey !== observerHex);
}

/**
 * The same question asked twice, once through the reader's ranking and once without.
 *
 * `since` IS REQUIRED: measured against the relay, this search returns immediately
 * with a 24-hour `since` and times out with none. Both sides then come back zero,
 * which reads as a quiet window rather than a broken ranking.
 *
 * NO TRUST FLOOR, deliberately: the probe must be able to SEE the silent degradation
 * to anonymous ranking, and a floor would hide it by returning nothing either way.
 */
export function rankedProbe(observerHex: string | null, since: number) {
  return {
    kinds: [1],
    since,
    search: observerHex ? `observer:${observerHex} sort:rank` : `${INCLUDE_SPAM} sort:rank`,
    limit: 12,
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Event id hex to `nevent1…`, id only: a permalink that names only the event cannot smuggle a relay. */
export function toNevent(hex: string): string {
  const id = String(hex ?? "").toLowerCase();
  if (!HEX64.test(id)) throw new Error("Not an event id");
  return nip19.neventEncode({ id });
}

/** `nevent1…` to lowercase event-id hex, or null if it is not an nevent naming an id. */
export function fromNevent(value: string): string | null {
  try {
    const decoded = nip19.decode(value.trim());
    if (decoded.type !== "nevent") return null;
    const id = decoded.data.id.toLowerCase();
    return HEX64.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** `naddr1…` to its address, or null. */
export function fromNaddr(value: string): { kind: number; pubkey: string; identifier: string } | null {
  try {
    const decoded = nip19.decode(value.trim());
    if (decoded.type !== "naddr") return null;
    return { kind: decoded.data.kind, pubkey: decoded.data.pubkey.toLowerCase(), identifier: decoded.data.identifier };
  } catch {
    return null;
  }
}

export function toNpub(hex: string): string {
  return nip19.npubEncode(hex);
}

/** What a person is called when they have published no name. Never hex. */
export function shortNpub(hex: string): string {
  const npub = toNpub(hex);
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

export interface DeskLink {
  kinds: Set<number>;
  /** The digest's line name (`watch:`), and resolve's name for an encoded link. */
  line: string;
  change: string;
  what: string;
  writer: RegExp;
  naddr: RegExp;
  /** Writer form: event id hex on the host. resolve encodes the naddr afterwards. */
  writerUrl(eventId: string): string;
  /** The host's canonical page for an event, addressed by naddr. */
  canonicalUrl(event: NostrEvent): string;
}

function deskLink(spec: {
  kinds: number[];
  host: string;
  writerPath: string;
  naddrPath: string;
  line: string;
  change: string;
  what: string;
}): DeskLink {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const writerPrefix = `https://${spec.host}${spec.writerPath}`;
  const naddrPrefix = `https://${spec.host}${spec.naddrPath}`;
  const kinds = new Set(spec.kinds);
  return {
    kinds,
    line: spec.line,
    change: spec.change,
    what: spec.what,
    writer: new RegExp(`^${escape(writerPrefix)}([0-9a-f]{64})(?:[/?#].*)?$`, "i"),
    naddr: new RegExp(`^${escape(naddrPrefix)}(naddr1[0-9a-z]+)(?:[/?#].*)?$`, "i"),
    writerUrl(eventId: string) {
      const id = String(eventId ?? "").toLowerCase();
      if (!HEX64.test(id)) throw new Error("Not an event id");
      return writerPrefix + id;
    },
    canonicalUrl(event: NostrEvent) {
      const d = tagValue(event, "d");
      if (!d || !kinds.has(event.kind)) throw new Error(`Not an address on ${spec.host}`);
      return naddrPrefix + nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
    },
  };
}

/**
 * The three desks whose events get a real destination: Live now to zap.stream,
 * Classifieds to Shopstr, Calendar to njump. The digest hands the writer
 * `writerUrl(id)` — the event id in hex on the host — and resolve re-encodes it to
 * the host's naddr page. Only events carrying a `d` tag qualify. Calendar goes to
 * njump because jumble.social has no calendar view, and because an nevent would
 * freeze one revision of a replaceable event.
 */
export const DESK_LINKS: Record<"live" | "classifieds" | "calendar", DeskLink> = {
  live: deskLink({
    kinds: [30311],
    host: "zap.stream",
    writerPath: "/stream/",
    naddrPath: "/",
    line: "watch",
    change: "stream",
    what: "stream watch links",
  }),
  classifieds: deskLink({
    kinds: [30402],
    host: "shopstr.store",
    writerPath: "/listing/",
    naddrPath: "/listing/",
    line: "listing",
    change: "listing",
    what: "classified listing links",
  }),
  calendar: deskLink({
    kinds: [31922, 31923],
    host: "njump.me",
    writerPath: "/",
    naddrPath: "/",
    line: "calendar",
    change: "calendar",
    what: "calendar links",
  }),
};

export type DeskLinkKey = keyof typeof DESK_LINKS;
export const DESK_LINK_KEYS = Object.keys(DESK_LINKS) as DeskLinkKey[];
