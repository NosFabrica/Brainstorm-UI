import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { signingProblem } from "@/accounts/signing";
import { publishBookReview, readBookReviewEvents, removeBookReview } from "@/services/bookReviews";
import type { BookReview } from "@/lib/bookReviews";
import { usePlaceRating, useStandingReviews } from "@/hooks/usePlaceReviews";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };

/**
 * The reviews of a book that stand, for its page: the places' read
 * (usePlaceReviews `useStandingReviews`) marked `book`, from the store while
 * the relays Unbnd reads are asked. Kept by the book's address, as a place's
 * are: an item's id changes when it's signed again.
 */
export function useBookReviews(item: Item) {
  return useStandingReviews(item, "book", readBookReviewEvents);
}

/**
 * Posting a review of a book, or changing the one the reader has
 * (`previous`): one signed record (services/bookReviews). On success it takes
 * the reader's place on screen at once — one person, one review — without
 * waiting for a relay to echo it; a signing problem is told in a toast, a
 * cancelled signature silently.
 */
export function usePostBookReview(item: Item, title: string) {
  const { toast } = useToast();
  return useMutation({
    // The signed record lands in the store once a relay takes it, and takes the reader's place there.
    mutationFn: ({ draft, previous }: { draft: { text: string; rating: number | null }; previous?: BookReview }) =>
      publishBookReview(item, draft, {
        title,
        previous: previous?.tags ? { tags: previous.tags, created_at: previous.at } : undefined,
      }),
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't post the review", description, variant: "destructive" });
    },
  });
}

/** Removing the reader's review of a book: a signed removal, and the review gone from screen at once. */
export function useRemoveBookReview(_item: Item) {
  const { toast } = useToast();
  return useMutation({
    // The signed removal lands in the store (services/tags publishToOutbox), which drops the record.
    mutationFn: (review: BookReview) => removeBookReview(review),
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't remove the review", description, variant: "destructive" });
    },
  });
}

/**
 * The star value of a book, and whose lens it is (the books contract's section 8): the reader's own
 * when someone they trust gave stars, else the curator's — whoever signed the book, Unbnd's
 * librarian. The places' rule as it is (usePlaceRating): one rule for every mark. Null when nobody
 * counts, and until the curator names a scorer (kind 10040) its lens counts nobody.
 */
export function useBookRating(item: Item, reviews: BookReview[]) {
  return usePlaceRating(item, reviews);
}
