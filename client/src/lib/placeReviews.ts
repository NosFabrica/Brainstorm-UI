/**
 * A review of a place: a NIP-22 comment (kind 1111) on the place item,
 * signed by the reviewer — the words, any photos, and two things the list
 * lacks: a price from $ to $$$$ (`["price", "1".."4"]`) and how the reviewer
 * paid (`["paid", "lightning" | "onchain" | "card" | "cash"]`). Photos ride
 * as NIP-92 `imeta` tags and in the words, so every client shows them.
 * A thing reviewed with stars — a book — carries one to five as
 * `["rating", "1".."5"]`; the same comment, the same readers.
 *
 * The rules only: reading a review from an event, the template a reader
 * signs, and the page's sums. Fetching and publishing are
 * services/placeReviews.
 */
import { extractImageUrls } from "@/lib/noteContent";

export type Paid = "lightning" | "onchain" | "card" | "cash";
export const PAID_LABELS: Record<Paid, string> = {
  lightning: "Lightning",
  onchain: "On-chain Bitcoin",
  card: "Card",
  cash: "Cash",
};
const PAID = new Set<string>(Object.keys(PAID_LABELS));

export interface PlaceReview {
  id: string;
  pubkey: string;
  at: number;
  text: string;
  photos: string[];
  /** 1 ($) to 4 ($$$$), or null. */
  price: number | null;
  paid: Paid | null;
  /** One to five stars, or null. */
  rating: number | null;
}

export interface ReviewDraft {
  text: string;
  price: number | null;
  paid: Paid | null;
  photos: string[];
  rating?: number | null;
}

type EventLike = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };

const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name)?.[1];

/** The review an event is, on this place, or null. */
export function reviewOf(event: EventLike, address: string): PlaceReview | null {
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
export function reviewTemplate(
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

/** The price most reviewers gave, as dollar signs, and how many gave one. */
export function priceSummary(reviews: { price: number | null }[]): { dollars: string; count: number } | null {
  const counts = new Map<number, number>();
  for (const r of reviews) if (r.price != null) counts.set(r.price, (counts.get(r.price) ?? 0) + 1);
  if (counts.size === 0) return null;
  const [price] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return { dollars: "$".repeat(price), count: [...counts.values()].reduce((a, b) => a + b, 0) };
}

/** How reviewers paid, the commonest first. */
export function paymentSummary(reviews: { paid: Paid | null }[]): { paid: Paid; label: string; count: number }[] {
  const counts = new Map<Paid, number>();
  for (const r of reviews) if (r.paid) counts.set(r.paid, (counts.get(r.paid) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([paid, count]) => ({ paid, label: PAID_LABELS[paid], count }));
}

/** The stars given, averaged to one decimal, with how many gave them — null when nobody did. */
export function ratingSummary(reviews: { rating: number | null }[]): { average: number; count: number } | null {
  const given = reviews.map((r) => r.rating).filter((n): n is number => n != null);
  if (given.length === 0) return null;
  const average = Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10;
  return { average, count: given.length };
}
