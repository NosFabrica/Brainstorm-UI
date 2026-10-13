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

export type Paid = "lightning" | "onchain" | "card" | "cash";
export const PAID_LABELS: Record<Paid, string> = {
  lightning: "Lightning",
  onchain: "On-chain Bitcoin",
  card: "Card",
  cash: "Cash",
};

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
