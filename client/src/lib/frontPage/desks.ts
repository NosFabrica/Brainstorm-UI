/**
 * What a front page is made of: the desks and the filters that read them. Where an
 * event's link points is the app's (./links `PaperLinkSet`), the same for every desk.
 *
 * Ported from NosFabrica/the-nostr-observer @ 0901b92 (MIT, see ./LICENSE.observer):
 * `.claude/skills/nostr-observer/scripts/corpus.mjs` (DESKS, filterFor, belongs) and
 * `chain.mjs` (rankedProbe), matched to Amethyst's `commons/.../frontpage/Desks.kt`. The
 * NIP-19 encoding is nostr-tools' instead of the hand-rolled bech32 there.
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
  /** Tag filters the desk's REQ adds (`t` for `#t`). */
  tags?: Record<string, string[]>;
  /** How far back the desk reads, in seconds. Every desk reads the fixed 24 hours but the Kitchen. */
  lookbackSeconds?: number;
  keeps?: (event: NostrEvent) => boolean;
}

export function tagValue(event: Pick<NostrEvent, "tags"> | null | undefined, name: string): string | null {
  return event?.tags?.find((t) => t[0] === name)?.[1] ?? null;
}

export function tagsNamed(event: Pick<NostrEvent, "tags"> | null | undefined, name: string): string[][] {
  return (event?.tags ?? []).filter((t) => t[0] === name);
}

/** Whether `event` carries a `t` tag in `values`, ignoring case. */
export function hasHashtag(event: Pick<NostrEvent, "tags">, values: ReadonlySet<string>): boolean {
  return event.tags.some((t) => t.length > 1 && t[0] === "t" && values.has(String(t[1]).trim().toLowerCase()));
}

/** The hashtags zap.cooking files a recipe under: `zapcooking` now, `nostrcooking` on older ones. */
export const RECIPE_TAGS: ReadonlySet<string> = new Set(["zapcooking", "nostrcooking"]);

/** Republished copyrighted recipes (an NYT Cooking mirror): never in the Kitchen. */
export const RECIPE_MIRROR_TAGS: ReadonlySet<string> = new Set(["newsarchive", "nytcooking"]);

/**
 * The Kitchen reads 30 days back, not 24 hours: the one desk that bends the fixed window.
 * Community recipes are too sparse for a day (about two dozen a month, measured
 * 2026-11-13), so the desk offers the best-ranked recipe of the month that hasn't run
 * lately (`pickRecipe`).
 */
export const KITCHEN_LOOKBACK_SECONDS = 30 * 24 * 60 * 60;

/** The window a desk reads back from the edition's close. */
export const lookbackOf = (desk: Desk) => desk.lookbackSeconds ?? WINDOW_SECONDS;

/** A recipe's address, `30023:<pubkey>:<d>`: what the paper remembers it ran, so an edit doesn't run again. */
export function recipeAddress(event: Pick<NostrEvent, "kind" | "pubkey" | "tags">): string {
  return `${event.kind}:${event.pubkey}:${tagValue(event, "d") ?? ""}`;
}

/**
 * The Kitchen's one recipe: the best-ranked of `ranked` (in the relay's rank order) whose
 * address isn't among `recent`, the recipes run in recent editions. Null when every one has run.
 */
export function pickRecipe<T extends Pick<NostrEvent, "kind" | "pubkey" | "tags">>(
  ranked: readonly T[],
  recent: ReadonlySet<string>,
): T | null {
  return ranked.find((e) => !recent.has(recipeAddress(e))) ?? null;
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
  // Recipes are long-form too: they run in the Kitchen, never in both.
  { key: "articles", kinds: [30023], label: "Long-form", limit: 100, keeps: (e) => !hasHashtag(e, RECIPE_TAGS) },
  { key: "classifieds", kinds: [30402], label: "Classifieds", limit: 30 },
  { key: "wiki", kinds: [30818], label: "Wiki entries", limit: 30 },
  // 31922 is the all-day half of NIP-52 and 31923 the timed half. Reading only one
  // of them drops whole-day events silently.
  { key: "calendar", kinds: [31922, 31923], label: "Calendar events", limit: 100 },
  { key: "apps", kinds: [32267], label: "App releases", limit: 30 },
  { key: "git", kinds: [30617], label: "Code repositories", limit: 30 },
  // zap.cooking's recipes, ranked like every desk, over 30 days (KITCHEN_LOOKBACK_SECONDS),
  // without the NYT Cooking mirror. The print keeps one (`pickRecipe`).
  {
    key: "kitchen",
    kinds: [30023],
    label: "Kitchen",
    limit: 30,
    tags: { t: [...RECIPE_TAGS] },
    lookbackSeconds: KITCHEN_LOOKBACK_SECONDS,
    keeps: (e) => hasHashtag(e, RECIPE_TAGS) && !hasHashtag(e, RECIPE_MIRROR_TAGS),
  },
];

export interface DeskFilter {
  kinds: number[];
  since: number;
  until: number;
  limit: number;
  search: string;
  /** A desk's tag filters, as `#t`. */
  [tag: `#${string}`]: string[];
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
  tags?: Record<string, string[]>,
): DeskFilter {
  const tagFilters = Object.fromEntries(Object.entries(tags ?? {}).map(([name, values]) => [`#${name}`, values]));
  return {
    ...tagFilters,
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

/** A lowercase 64-hex id or key. */
export const isEventIdHex = (value: string) => HEX64.test(value);

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

/** `npub1…` to pubkey hex, or null if it does not decode to an npub. */
export function fromNpub(value: string): string | null {
  try {
    const decoded = nip19.decode(value.trim());
    return decoded.type === "npub" ? decoded.data.toLowerCase() : null;
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

/**
 * An naddr for [event], or null. NIP-19 stores each TLV value's length in one byte, so a
 * `d` tag over 255 bytes cannot be encoded (nostr-tools would write a corrupt naddr below
 * the bech32 limit and throw above it). Corpus content decides this, so it never throws.
 */
export function naddrFor(event: NostrEvent): string | null {
  const d = tagValue(event, "d");
  if (d === null || new TextEncoder().encode(d).length > 255) return null;
  try {
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  } catch {
    return null;
  }
}
