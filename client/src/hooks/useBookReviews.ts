import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { signingProblem } from "@/accounts/signing";
import { fetchBookReviews, publishBookReview } from "@/services/bookReviews";
import type { PlaceReview, ReviewDraft } from "@/lib/placeReviews";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };

/** The reviews of a book, for its page: a relay read, cached for the visit. */
export function useBookReviews(item: Item) {
  // The id names the item; the rest of the event is what the id is of.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = useQuery<PlaceReview[]>({
    queryKey: ["book-reviews", item.id],
    queryFn: () => fetchBookReviews(item),
    staleTime: 60_000,
  });
  return { reviews: query.data ?? [], pending: query.isPending };
}

/**
 * Posting a review: one signed comment (services/placeReviews). On success
 * it joins the reviews on screen at once, without waiting for a relay to
 * echo it; a signing problem is told in a toast, a cancelled signature
 * silently.
 */
export function usePostBookReview(item: Item) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (draft: ReviewDraft) => publishBookReview(item, draft),
    onSuccess: (mine) => {
      qc.setQueryData<PlaceReview[]>(["book-reviews", item.id], (prev) => [
        mine,
        ...(prev ?? []).filter((r) => r.id !== mine.id),
      ]);
    },
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't post the review", description, variant: "destructive" });
    },
  });
}
