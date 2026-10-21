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
} from "@/lib/placeReviews";
import { readListEvents } from "@/services/listReads";
import { fetchEventsByFilter } from "@/services/nostr";
import { resolveTrustSource } from "@/services/trustSource";
import { publishToOutbox } from "@/services/tags";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
const TIMEOUT_MS = 6000;
/** Where Regulars publishes reviews beside the index (its src/config.ts). */
const REGULARS_RELAYS = ["wss://nos.lol", "wss://relay.primal.net"];
const readRelays = () => [...new Set([...dictionaryRelays(), ...REGULARS_RELAYS])];
const nowS = () => Math.floor(Date.now() / 1000);

export async function fetchPlaceReviews(item: Item): Promise<PlaceReview[]> {
  const address = coordinateOf(item);
  if (!address) return [];
  const records = await readListEvents(
    [
      { kinds: [PLACE_REVIEW_KIND], "#a": [address], limit: 500 },
      { kinds: [PLACE_REVIEW_KIND], "#d": [address, `place:${address}`], limit: 500 },
    ],
    TIMEOUT_MS,
    readRelays(),
  );
  if (records.length === 0) return [];
  const ids = [...new Set(records.map((e) => e.id))];
  const addresses = [
    ...new Set(records.map((e) => `${PLACE_REVIEW_KIND}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`)),
  ];
  const removals = await readListEvents(
    [
      { kinds: [5], "#e": ids },
      { kinds: [5], "#a": addresses },
    ],
    TIMEOUT_MS,
    readRelays(),
  );
  return standingReviews([...records, ...removals], address, nowS());
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
  const batches: string[][] = [];
  for (let i = 0; i < pubkeys.length; i += RANK_BATCH) batches.push(pubkeys.slice(i, i + RANK_BATCH));
  const events = await Promise.all(
    batches.map(
      (d) =>
        fetchEventsByFilter({ kinds: [30382], authors: [source.taPubkey], "#d": d }, [source.relay]) as Promise<
          Parameters<typeof ranksFrom>[0]
        >,
    ),
  );
  return ranksFrom(events.flat(), source.taPubkey);
}

/**
 * The reviews that stand for each of many places — a search's places — in
 * one batch: their records by `a` and by `d`, then the removals of those.
 */
export async function fetchReviewsForPlaces(addresses: string[]): Promise<Map<string, PlaceReview[]>> {
  if (addresses.length === 0) return new Map();
  const records = await readListEvents(
    [
      { kinds: [PLACE_REVIEW_KIND], "#a": addresses, limit: 2000 },
      { kinds: [PLACE_REVIEW_KIND], "#d": [...addresses, ...addresses.map((a) => `place:${a}`)], limit: 2000 },
    ],
    TIMEOUT_MS,
    readRelays(),
  );
  if (records.length === 0) return reviewsByPlace([], addresses, nowS());
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
    readRelays(),
  );
  return reviewsByPlace([...records, ...removals], addresses, nowS());
}
