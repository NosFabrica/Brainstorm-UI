import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchPriority } from "@/hooks/useSearchPriority";
import { useToast } from "@/hooks/use-toast";
import { signingProblem } from "@/accounts/signing";
import { coordinateOf } from "@/lib/dlistFields";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import {
  fetchLensRanks,
  fetchPlaceReviews,
  fetchReviewsForPlaces,
  publishPlaceReview,
  removePlaceReview,
} from "@/services/placeReviews";
import { orderingScore, placeRating, weightedStars, type PlaceReview, type ReviewDraft } from "@/lib/placeReviews";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };

/** Reviews are kept by the place's address: the curator signs every place again at each import, so ids change. */
const keyOf = (item: Item) => ["place-reviews", coordinateOf(item) ?? item.id];

/** The reviews of a place that stand, for its page: a relay read, cached for the visit. */
export function usePlaceReviews(item: Item) {
  const query = useQuery<PlaceReview[]>({
    queryKey: keyOf(item),
    queryFn: () => fetchPlaceReviews(item),
    staleTime: 60_000,
  });
  return { reviews: query.data ?? [], pending: query.isPending };
}

/**
 * Posting a review, or changing the one the reader has (`previous`): one
 * signed record (services/placeReviews). On success it takes the reader's
 * place on screen at once — one person, one review — without waiting for a
 * relay to echo it; a signing problem is told in a toast, a cancelled
 * signature silently.
 */
export function usePostPlaceReview(item: Item, name: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ draft, previous }: { draft: ReviewDraft; previous?: PlaceReview }) =>
      publishPlaceReview(item, draft, {
        name,
        previous: previous?.tags ? { tags: previous.tags, created_at: previous.at } : undefined,
      }),
    onSuccess: (mine) => {
      if (!mine) return;
      qc.setQueryData<PlaceReview[]>(keyOf(item), (prev) => [
        mine,
        ...(prev ?? []).filter((r) => r.pubkey !== mine.pubkey),
      ]);
    },
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't post the review", description, variant: "destructive" });
    },
  });
}

/** Removing the reader's review: a signed removal, and the review gone from screen at once. */
export function useRemovePlaceReview(item: Item) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (review: PlaceReview) => removePlaceReview(review),
    onSuccess: (_, review) => {
      qc.setQueryData<PlaceReview[]>(keyOf(item), (prev) => (prev ?? []).filter((r) => r.id !== review.id));
    },
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't remove the review", description, variant: "destructive" });
    },
  });
}

const RANKS_STALE_MS = 5 * 60_000;

/**
 * The star value of a place, and whose lens it is (lib/placeRating): the
 * reader's own when they are signed in and someone they trust gave stars,
 * else the curator's — whoever signed the place. Nothing until the reader's
 * own lens is read, so the value never flips from one lens to the other.
 */
export function usePlaceRating(item: Item, reviews: PlaceReview[]) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const people = [...new Set(reviews.filter((r) => r.rating != null).map((r) => r.pubkey))].sort();
  const you = useQuery({
    queryKey: ["lens-ranks", me, people],
    queryFn: () => fetchLensRanks(me!, people),
    enabled: !!me && people.length > 0,
    staleTime: RANKS_STALE_MS,
  });
  const curator = useQuery({
    queryKey: ["lens-ranks", item.pubkey, people],
    queryFn: () => fetchLensRanks(item.pubkey, people),
    enabled: people.length > 0,
    staleTime: RANKS_STALE_MS,
  });
  if (people.length === 0 || (me && you.isPending)) return null;
  return placeRating(reviews, { you: me ? (you.data ?? null) : undefined, curator: curator.data ?? null });
}

const NO_REVIEWS = new Map<string, PlaceReview[]>();

/**
 * The ratings of many places at once — a search's places: their reviews in
 * one batch, weighed through one lens for all of them, the reader's own when
 * signed in, else the curator's (the contract's section 8). For each place:
 * the star value to show (null when nobody counted gave stars), how many
 * reviewed it, and the number places are ordered by (orderingScore).
 */
export function usePlacesRatings(addresses: readonly string[], curator: string | null) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  // On the Top page, after the search's own results: the stars only order rows (hooks/useSearchPriority).
  const ready = useSearchPriority();
  const reviews = useQuery({
    queryKey: ["places-reviews", ...addresses],
    queryFn: () => fetchReviewsForPlaces([...addresses]),
    enabled: ready && addresses.length > 0,
    staleTime: 60_000,
  });
  const byPlace = reviews.data ?? NO_REVIEWS;
  const people = [
    ...new Set(
      [...byPlace.values()]
        .flat()
        .filter((r) => r.rating != null)
        .map((r) => r.pubkey),
    ),
  ].sort();
  const lensOwner = me ?? curator;
  const lens = useQuery({
    queryKey: ["lens-ranks", lensOwner, people],
    queryFn: () => fetchLensRanks(lensOwner!, people),
    enabled: !!lensOwner && people.length > 0,
    staleTime: RANKS_STALE_MS,
  });
  const rankOf = (pk: string) => lens.data?.get(pk) ?? null;
  return (address: string) => {
    const list = byPlace.get(address) ?? [];
    return {
      value: weightedStars(list, rankOf)?.value ?? null,
      count: list.length,
      score: orderingScore(list, rankOf),
    };
  };
}
