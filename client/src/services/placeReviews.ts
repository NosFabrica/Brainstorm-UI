/**
 * Reviews of a place, read, written and removed (lib/placeReviews has the
 * rules; docs/dictionary/food-and-drink-places-actions.md the contract).
 *
 * Read where list events are read — our index under its `include:spam` lens
 * and the hub, at once (services/listReads) — by the place's address either
 * way a record names it, then the removals of what came back — and from
 * the relays Regulars publishes reviews to as well, since the index can lag
 * (the contract's section 5). Published, and removed, to the reviewer's own
 * write relays and the index, where Regulars reads (services/tags
 * publishToOutbox) — never the hub, which keeps list events and refuses
 * reviews (the contract's section 9).
 *
 * A lens's ranks for the star value (the contract's section 8): the scorer
 * an observer names in their kind 10040 (services/trustSource), and its
 * kind 30382 ranks of the reviewers, from its own relay.
 */
import type { NostrEvent } from "nostr-tools";
import type { Filter } from "applesauce-core/helpers/filter";
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { dictionaryRelays } from "@/config/dictionary";
import { coordinateOf } from "@/lib/dlistFields";
import { SEARCH_RELAY } from "@/lib/relays";
import {
  PLACE_REVIEW_KIND,
  placeReviewTemplate,
  ranksFrom,
  removalTemplate,
  reviewsByPlace,
  standingReviews,
  type PlaceReview,
  type ReviewDraft,
  type ReviewMark,
} from "@/lib/placeReviews";
import { readListEvents } from "@/services/listReads";
import { fetchEventsByFilter } from "@/services/nostr";
import { resolveTrustSource, type TrustSourceRef } from "@/services/trustSource";
import { publishToOutbox } from "@/services/tags";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
const TIMEOUT_MS = 6000;
/** Where Regulars publishes reviews beside the index (its src/config.ts). */
const REGULARS_RELAYS = ["wss://nos.lol", "wss://relay.primal.net"];
const readRelays = () => [...new Set([...dictionaryRelays(), ...REGULARS_RELAYS])];
const nowS = () => Math.floor(Date.now() / 1000);

/**
 * Where a review of these things is asked for, by either way a record names
 * one (the contract's section 4): its `a`, or its `d` — the address, or the
 * mark and the address. `limit` caps each filter on the wire; the store reads
 * them without one.
 */
export function reviewRecordFilters(addresses: string[], mark: ReviewMark = "place", limit?: number): Filter[] {
  const cap = limit === undefined ? {} : { limit };
  return [
    { kinds: [PLACE_REVIEW_KIND], "#a": addresses, ...cap },
    { kinds: [PLACE_REVIEW_KIND], "#d": [...addresses, ...addresses.map((a) => `${mark}:${a}`)], ...cap },
  ];
}

/**
 * The records of reviews of these things, then the removals (kind 5) of what
 * came back, as the relays answered: what lib/placeReviews `standingReviews`
 * decides from. Every one passes through the EventStore on the way.
 */
export async function readReviewEvents(
  addresses: string[],
  { mark = "place", limit, relays }: { mark?: ReviewMark; limit: number; relays: string[] },
): Promise<NostrEvent[]> {
  if (addresses.length === 0) return [];
  const records = await readListEvents(reviewRecordFilters(addresses, mark, limit), TIMEOUT_MS, relays);
  if (records.length === 0) return [];
  const ids = [...new Set(records.map((e) => e.id))];
  const coords = [
    ...new Set(records.map((e) => `${PLACE_REVIEW_KIND}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`)),
  ];
  const removals = await readListEvents(
    [
      { kinds: [5], "#e": ids },
      { kinds: [5], "#a": coords },
    ],
    TIMEOUT_MS,
    relays,
  );
  return [...records, ...removals];
}

/** The records and removals of a place's reviews (readReviewEvents), from wherever reviews are read. */
export function readPlaceReviewEvents(addresses: string[], limit = 500): Promise<NostrEvent[]> {
  return readReviewEvents(addresses, { limit, relays: readRelays() });
}

export async function fetchPlaceReviews(item: Item): Promise<PlaceReview[]> {
  const address = coordinateOf(item);
  if (!address) return [];
  return standingReviews(await readPlaceReviewEvents([address]), address, nowS());
}

/**
 * Sign and publish the reader's review of a place, or a change to the one
 * they have (`previous`, the record as signed). Hands back the review as
 * the page shows it.
 */
export async function publishPlaceReview(
  item: Item,
  draft: ReviewDraft,
  { name, previous }: { name: string; previous?: { tags: string[][]; created_at?: number } },
): Promise<PlaceReview> {
  const address = coordinateOf(item) ?? "";
  const signed = await signAs(requireActiveAccount(), placeReviewTemplate({ address, name }, draft, previous));
  await publishToOutbox(signed as never, [SEARCH_RELAY]);
  const [mine] = standingReviews([signed], address, nowS());
  return mine;
}

/** Sign and publish the removal of the reader's review, wherever reviews are sent. */
export async function removePlaceReview(review: Pick<PlaceReview, "id" | "pubkey" | "tags">): Promise<void> {
  const signed = await signAs(requireActiveAccount(), removalTemplate(review));
  await publishToOutbox(signed as never, [SEARCH_RELAY]);
}

/** The most people one request for ranks names, as Regulars asks. */
const RANK_BATCH = 500;

/**
 * Each reviewer's rank in `observer`'s lens: by the scorer their kind 10040
 * names, read from that scorer's relay. Null when the observer names no
 * scorer — there is no lens, and nobody counts through it.
 */
export async function fetchLensRanks(observer: string, pubkeys: string[]): Promise<Map<string, number> | null> {
  if (pubkeys.length === 0) return new Map();
  const source = await resolveTrustSource(observer);
  if (!source) return null;
  return ranksFrom(await readLensRanks(source, pubkeys), source.taPubkey);
}

/** The scorer's kind 30382s about these people, from its own relay, RANK_BATCH at a time. */
export async function readLensRanks(source: TrustSourceRef, pubkeys: string[]): Promise<NostrEvent[]> {
  const batches: string[][] = [];
  for (let i = 0; i < pubkeys.length; i += RANK_BATCH) batches.push(pubkeys.slice(i, i + RANK_BATCH));
  const events = await Promise.all(
    batches.map((d) => fetchEventsByFilter({ kinds: [30382], authors: [source.taPubkey], "#d": d }, [source.relay])),
  );
  return events.flat();
}

/**
 * The reviews that stand for each of many places — a search's places — in
 * one batch: their records by `a` and by `d`, then the removals of those.
 */
export async function fetchReviewsForPlaces(addresses: string[]): Promise<Map<string, PlaceReview[]>> {
  if (addresses.length === 0) return new Map();
  return reviewsByPlace(await readPlaceReviewEvents(addresses, 2000), addresses, nowS());
}
