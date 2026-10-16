/**
 * A review of a book: a NIP-22 comment (kind 1111) on the book item, signed
 * by the reviewer, with one to five stars as `["rating", "1".."5"]` and the
 * words. (A place's review is its own record, kind 34259: lib/placeReviews.)
 * The rules only: reading a review from an event, the template a reader
 * signs, and the average. Fetching and publishing are services/bookReviews.
 */
import { extractImageUrls } from "@/lib/noteContent";
import { PAID_LABELS, type Paid, type PlaceReview, type ReviewDraft } from "@/lib/placeReviews";

const PAID = new Set<string>(Object.keys(PAID_LABELS));

type EventLike = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };

const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name)?.[1];

/** The review an event is, on this place, or null. */
export function commentReviewOf(event: EventLike, address: string): PlaceReview | null {
  if (event.kind !== 1111) return null;
  const root = tagOf(event.tags, "A") ?? tagOf(event.tags, "a");
  if (root !== address) return null;
  const photos = extractImageUrls(event.content, event.tags, { allImeta: true });
  let text = event.content;
  for (const url of photos) text = text.split(url).join("");
  text = text.replace(/[ \t]+\n/g, "\n").trim();
  if (!text && photos.length === 0) return null;
  const price = Number(tagOf(event.tags, "price"));
  const paid = tagOf(event.tags, "paid");
  const rating = Number(tagOf(event.tags, "rating"));
  return {
    id: event.id,
    pubkey: event.pubkey,
    at: event.created_at,
    text,
    photos,
    price: Number.isInteger(price) && price >= 1 && price <= 4 ? price : null,
    paid: paid && PAID.has(paid) ? (paid as Paid) : null,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
  };
}

/** The comment a reader signs to review the place: a NIP-22 root comment, the hub as the hint. */
export function commentReviewTemplate(
  item: { id: string; kind: number; pubkey: string; tags: string[][] },
  draft: ReviewDraft,
  relayHint: string,
): { kind: 1111; content: string; tags: string[][] } {
  const d = tagOf(item.tags, "d") ?? "";
  const address = `${item.kind}:${item.pubkey}:${d}`;
  const tags: string[][] = [
    ["A", address, relayHint],
    ["K", String(item.kind)],
    ["P", item.pubkey],
    ["a", address, relayHint],
    ["k", String(item.kind)],
    ["p", item.pubkey],
  ];
  if (draft.price != null) tags.push(["price", String(draft.price)]);
  if (draft.paid) tags.push(["paid", draft.paid]);
  if (draft.rating != null) tags.push(["rating", String(draft.rating)]);
  for (const url of draft.photos) tags.push(["imeta", `url ${url}`]);
  const content = [draft.text.trim(), ...draft.photos].filter(Boolean).join("\n");
  return { kind: 1111, content, tags };
}

/** The stars given, averaged to one decimal, with how many gave them — null when nobody did. */
export function ratingSummary(reviews: { rating: number | null }[]): { average: number; count: number } | null {
  const given = reviews.map((r) => r.rating).filter((n): n is number => n != null);
  if (given.length === 0) return null;
  const average = Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10;
  return { average, count: given.length };
}
