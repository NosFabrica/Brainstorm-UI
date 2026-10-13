/**
 * Reviews of a place, read, written and removed (lib/placeReviews has the
 * rules; docs/dictionary/food-and-drink-places-actions.md the contract).
 *
 * Read where list events are read — our index under its `include:spam` lens
 * and the hub, at once (services/listReads) — by the place's address either
 * way a record names it, then the removals of what came back. Published,
 * and removed, as every user event is (publishTagEvent: the reviewer's
 * write relays and the hub) and to the index as well, where Regulars reads.
 */
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { coordinateOf } from "@/lib/dlistFields";
import { SEARCH_RELAY } from "@/lib/relays";
import {
  PLACE_REVIEW_KIND,
  placeReviewTemplate,
  removalTemplate,
  standingReviews,
  type PlaceReview,
  type ReviewDraft,
} from "@/lib/placeReviews";
import { readListEvents } from "@/services/listReads";
import { publishTagEvent } from "@/services/tags";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
const TIMEOUT_MS = 6000;
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
  { name, previous }: { name: string; previous?: { tags: string[][] } },
): Promise<PlaceReview> {
  const address = coordinateOf(item) ?? "";
  const signed = await signAs(requireActiveAccount(), placeReviewTemplate({ address, name }, draft, previous));
  await publishTagEvent(signed as never, [SEARCH_RELAY]);
  const [mine] = standingReviews([signed], address, nowS());
  return mine;
}

/** Sign and publish the removal of the reader's review, wherever reviews are sent. */
export async function removePlaceReview(review: Pick<PlaceReview, "id" | "pubkey" | "tags">): Promise<void> {
  const signed = await signAs(requireActiveAccount(), removalTemplate(review));
  await publishTagEvent(signed as never, [SEARCH_RELAY]);
}
