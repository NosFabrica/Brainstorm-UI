import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import type { Filter } from "applesauce-core/helpers/filter";
import { useMutation } from "@tanstack/react-query";
import { useSearchPriority } from "@/hooks/useSearchPriority";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useLensRanks, useTrustSource } from "@/hooks/useLensRanks";
import { useToast } from "@/hooks/use-toast";
import { signingProblem } from "@/accounts/signing";
import { coordinateOf } from "@/lib/dlistFields";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import {
  publishPlaceReview,
  readPlaceReviewEvents,
  removePlaceReview,
  reviewRecordFilters,
} from "@/services/placeReviews";
import {
  orderingScore,
  placeRating,
  reviewsByPlace,
  standingReviews,
  weightedStars,
  type PlaceReview,
  type ReviewDraft,
  type ReviewMark,
} from "@/lib/placeReviews";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };

const nowS = () => Math.floor(Date.now() / 1000);

/**
 * The removals a review read answers with. The store acts on a kind 5 (it
 * drops what it deletes) but keeps none, so these reach a page only as the
 * ask's own answer — which useStoreEvents holds once a filter names them.
 * `standingReviews` reads them again by the contract's rules: a removal by
 * `e` alone, which the store's NIP-09 check of an addressable record doesn't
 * consult, still takes the review down if a relay hands the record back.
 */
const REMOVALS: Filter = { kinds: [5] };

/** Asked again at most every minute, the stale time the reviews had as a query. */
const REVIEWS_WINDOW = { minMs: 60_000, stream: false };

/**
 * The reviews of one thing that stand (lib/placeReviews `standingReviews`),
 * from the EventStore while the relays are asked (docs/adr/0005): the
 * records, and the removals that came back with them. Kept by the thing's
 * address: the curator signs every place again at each import, so ids change.
 *
 * The reader's own review lands in the store once a relay takes it, and takes
 * their place at once — one person, one review; their removal makes the store
 * drop the record, so it leaves the page as soon as it is published.
 *
 * Shown as the store held it until the first ask settles (`stream: false`):
 * a review must not show and then vanish when its removal lands a moment
 * after it. Where the store's deletion runs ahead of the contract's order —
 * a removed newest record is gone from the store, so a person's older record
 * under their other `d` stands in for it, where section 4 would show none — it
 * is the store's NIP-09 reading that holds.
 */
export function useStandingReviews(
  item: Item,
  mark: ReviewMark,
  read: (address: string) => Promise<NostrEvent[]>,
): { reviews: PlaceReview[]; pending: boolean } {
  const address = coordinateOf(item);
  const filters = useMemo(
    () => (address ? [...reviewRecordFilters([address], mark), REMOVALS] : null),
    [address, mark],
  );
  const events = useStoreEvents(
    address ? `${mark}-reviews:${address}` : null,
    filters,
    () => read(address!),
    REVIEWS_WINDOW,
  );
  const reviews = useMemo(
    () => (address ? standingReviews(events.events, address, nowS(), mark) : []),
    [events.events, address, mark],
  );
  return { reviews, pending: events.loading };
}

/** The reviews of a place that stand, for its page (useStandingReviews). */
export function usePlaceReviews(item: Item) {
  return useStandingReviews(item, "place", (address) => readPlaceReviewEvents([address]));
}

/**
 * Posting a review, or changing the one the reader has (`previous`): one
 * signed record (services/placeReviews). On success it takes the reader's
 * place on screen at once — one person, one review — without waiting for a
 * relay to echo it; a signing problem is told in a toast, a cancelled
 * signature silently.
 */
export function usePostPlaceReview(item: Item, name: string) {
  const { toast } = useToast();
  return useMutation({
    // The signed record lands in the store once a relay takes it, and takes the reader's place there.
    mutationFn: ({ draft, previous }: { draft: ReviewDraft; previous?: PlaceReview }) =>
      publishPlaceReview(item, draft, {
        name,
        previous: previous?.tags ? { tags: previous.tags, created_at: previous.at } : undefined,
      }),
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't post the review", description, variant: "destructive" });
    },
  });
}

/** Removing the reader's review: a signed removal, and the review gone from screen at once. */
export function useRemovePlaceReview(_item: Item) {
  const { toast } = useToast();
  return useMutation({
    // The signed removal lands in the store (services/tags publishToOutbox), which drops the record.
    mutationFn: (review: PlaceReview) => removePlaceReview(review),
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't remove the review", description, variant: "destructive" });
    },
  });
}

/**
 * The star value of a place, and whose lens it is (lib/placeRating): the
 * reader's own when they are signed in and someone they trust gave stars,
 * else the curator's — whoever signed the place. Nothing until the reader's
 * own lens is read, so the value never flips from one lens to the other.
 * Each lens is its owner's 10040, then its scorer's ranks of the reviewers,
 * both from the store (hooks/useLensRanks).
 */
export function usePlaceRating(item: Item, reviews: PlaceReview[]) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const people = [...new Set(reviews.filter((r) => r.rating != null).map((r) => r.pubkey))].sort();
  const any = people.length > 0;
  const you = useLensRanks(useTrustSource(me && any ? me : null), people);
  const curator = useLensRanks(useTrustSource(any ? item.pubkey : null), people);
  if (!any || (me && you === undefined)) return null;
  return placeRating(reviews, { you: me ? (you ?? null) : undefined, curator: curator ?? null });
}

const NO_REVIEWS = new Map<string, PlaceReview[]>();

/**
 * The ratings of many places at once — a search's places: their reviews in
 * one batch, weighed through one lens for all of them, the reader's own when
 * signed in, else the curator's (the contract's section 8). For each place:
 * the star value to show (null when nobody counted gave stars), how many
 * reviewed it, and the number places are ordered by (orderingScore). Records,
 * removals and ranks all from the store, as for one place.
 */
export function usePlacesRatings(addresses: readonly string[], curator: string | null) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  // On the Top page, after the search's own results: the stars only order rows (hooks/useSearchPriority).
  const ready = useSearchPriority();
  const addressesKey = addresses.join(",");
  const asking = ready && addresses.length > 0;
  const filters = useMemo(
    () => (asking ? [...reviewRecordFilters([...addresses]), REMOVALS] : null),
    // `addressesKey` is `addresses`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asking, addressesKey],
  );
  const read = useStoreEvents(
    asking ? `places-reviews:${addressesKey}` : null,
    filters,
    () => readPlaceReviewEvents([...addresses], 2000),
    REVIEWS_WINDOW,
  );
  const byPlace = useMemo(
    () => (asking ? reviewsByPlace(read.events, addresses, nowS()) : NO_REVIEWS),
    // `addressesKey` is `addresses`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asking, read.events, addressesKey],
  );
  const people = [
    ...new Set(
      [...byPlace.values()]
        .flat()
        .filter((r) => r.rating != null)
        .map((r) => r.pubkey),
    ),
  ].sort();
  const lensOwner = me ?? curator;
  const lens = useLensRanks(useTrustSource(lensOwner && people.length > 0 ? lensOwner : null), people);
  const rankOf = (pk: string) => lens?.get(pk) ?? null;
  return (address: string) => {
    const list = byPlace.get(address) ?? [];
    return {
      value: weightedStars(list, rankOf)?.value ?? null,
      count: list.length,
      score: orderingScore(list, rankOf),
    };
  };
}
