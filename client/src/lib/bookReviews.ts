/**
 * A review of a book: one record, kind 34259 marked `book`, one per person
 * per book — the record Unbnd writes too, so a review written in either app
 * is read, shown, changed and removed by the other. The contract is
 * docs/dictionary/books-actions.md (PR #253); its section 11 checks are this
 * module's tests. The rules are the places' (lib/placeReviews), by mark: a
 * book's `d` is `book:` and its address, its `a` names the hub as the hint,
 * and the composer gives stars and words only — a price, a payment or photos
 * another app set are carried over, never written here.
 *
 * A comment (kind 1111) is not a review, rating tag or not.
 */
import { reviewTemplate, standingReviews, type PlaceReview } from "@/lib/placeReviews";

/** Where a book's own list lives: the hint a review's `a` gives for the book. */
const BOOK_HUB = "wss://dcosl.brainstorm.world";

export type BookReview = PlaceReview;

/** The reviews of a book that stand (the contract's section 4): one per person, the newest, less removals. */
export function standingBookReviews(
  events: Parameters<typeof standingReviews>[0],
  address: string,
  now: number,
): BookReview[] {
  return standingReviews(events, address, now, "book");
}

/**
 * The record a reader signs to review a book, or to change the review they
 * have (`previous`): stars and words; every tag it doesn't set is carried
 * over but `client` and `nonce`.
 */
export function bookReviewTemplate(
  book: { address: string; title: string },
  draft: { text: string; rating: number | null },
  previous?: { tags: string[][]; created_at?: number },
  now = Math.floor(Date.now() / 1000),
) {
  return reviewTemplate(
    "book",
    { address: book.address, name: book.title },
    { text: draft.text, rating: draft.rating, price: null, paid: null, photos: [] },
    previous,
    now,
    BOOK_HUB,
  );
}
