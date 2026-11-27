/** What a search hands back and what it is asked with. */
import type { NostrEvent } from "nostr-tools";
import type { SearchResult } from "@/lib/profileSearch";
import type { FirstPage } from "@/lib/headStart";
import type { SearchTab } from "./tabs";

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
export const HOUSE_POV: SearchPov = "nosfabrica";

/**
 * A page whose sections share one REQ. Not a tab — the Top page is both
 * a tab and a group. Members are routed to by kind, so a group's sections must
 * ask for disjoint kinds; a section that names no kinds never joins.
 */
export type SearchGroup = "search-top" | "home-feed-personal" | "home-feed-house";

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
   * Top page's eight sections were eight turns in it (probed
   * 2026-09-16: 5,145ms vs 2,514ms for the same 75 events). Only the first
   * page joins; a "more" page opens its own REQ as before.
   */
  group?: SearchGroup;
  /**
   * Exactly these kinds, in place of the tab's — Top's section for a
   * typed kind that none of its sections carry. Not intersected with the
   * query's own `kind:` tokens; it IS them.
   */
  kinds?: number[];
  /**
   * A preview band rather than the tab itself: asks the tab's band kinds
   * (bandKindsForTab), still narrowed by a typed `kind:`.
   */
  band?: boolean;
  /**
   * Tag filters every filter carries — a Dictionary list's items by the headers they are filed
   * under (`#z`): one of All's categories (hooks/useAllCategories).
   */
  tags?: Record<`#${string}`, string[]>;
  /**
   * Only these: the people, events and addressable events a tag is on (services/tagLists), so a
   * pressed tag on All asks the relay for the words among everything carrying it rather than
   * thinning the rows loaded so far.
   */
  members?: Members;
  /**
   * The first page's answer already on its way — All's head start (lib/headStart),
   * asked while the bundle loaded. Followed in place of asking; should it fail,
   * the relay is asked after all. Further pages ask as usual.
   */
  firstPage?: FirstPage;
}

/** What a search can be narrowed to: people by pubkey, events by id, addressable events by coordinate. */
export interface Members {
  pubkeys: string[];
  ids: string[];
  /** `<kind>:<pubkey>:<d>`. */
  addresses: string[];
}
