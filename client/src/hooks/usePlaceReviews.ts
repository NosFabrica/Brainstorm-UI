import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { signingProblem } from "@/accounts/signing";
import { coordinateOf } from "@/lib/dlistFields";
import { fetchPlaceReviews, publishPlaceReview, removePlaceReview } from "@/services/placeReviews";
import type { PlaceReview, ReviewDraft } from "@/lib/placeReviews";

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
      publishPlaceReview(item, draft, { name, previous: previous?.tags ? { tags: previous.tags } : undefined }),
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
