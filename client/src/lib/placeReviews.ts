/**
 * A review of a place: one record, kind 34259 marked `place`, one per person
 * per place — the record Regulars writes too, so a review written in either
 * app is read, shown, changed and removed by the other. The contract is
 * docs/dictionary/food-and-drink-places-actions.md; its section 11 checks
 * are this module's tests.
 *
 * The record carries the stars (`s` 1–5, and `rating` as the fraction of
 * five), the words, and what the list lacks: a price from $ to $$$$
 * (`price` 1–4), how the reviewer paid (`paid`), and photos (NIP-92 `imeta`,
 * their addresses in the words too). A comment (kind 1111) is not a review.
 *
 * The rules only: which reviews stand, the record and the removal a reader
 * signs, and the page's sums. Fetching and publishing are
 * services/placeReviews.
 */
import { starsOf } from "@/lib/thing";

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
  /** The record's tags as signed — what an edit carries over, and the `d` a removal names. */
  tags?: string[][];
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

type EventLike = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };

export const PLACE_REVIEW_KIND = 34259;

const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name)?.[1];

const PAID = new Set<string>(Object.keys(PAID_LABELS));

/** Each photo's address: the `url` of an `imeta` tag (NIP-92). */
function photosOf(tags: string[][]): string[] {
  const urls = tags
    .filter((t) => t[0] === "imeta")
    .map((t) =>
      t
        .slice(1)
        .find((part) => part.startsWith("url "))
        ?.slice(4)
        .trim(),
    )
    .filter((url): url is string => !!url);
  return [...new Set(urls)];
}

/** What a record says: the stars, the words without the photos' addresses, the price, how they paid. */
function readReview(event: EventLike): PlaceReview {
  const photos = photosOf(event.tags);
  let text = event.content;
  for (const url of photos) text = text.split(url).join("");
  text = text.replace(/[ \t]+\n/g, "\n").trim();
  const price = Number(tagOf(event.tags, "price"));
  const paid = tagOf(event.tags, "paid");
  return {
    id: event.id,
    pubkey: event.pubkey,
    at: event.created_at,
    text,
    photos,
    price: Number.isInteger(price) && price >= 1 && price <= 4 ? price : null,
    paid: paid && PAID.has(paid) ? (paid as Paid) : null,
    // A place is given 1 to 5 stars: a 0 is no stars, and must not pull a rating down.
    rating: starsOf(event) || null,
    tags: event.tags,
  };
}

/** Whether a record names this place: by its `a`, or by its `d` (the address, or `place:` and the address). */
function namesPlace(event: EventLike, address: string): boolean {
  const d = tagOf(event.tags, "d");
  return tagOf(event.tags, "a") === address || d === address || d === `place:${address}`;
}

/** NIP-01's order for one address: the later wins; on a tie, the lower id. */
/** How far ahead of the reader's clock a record may be dated: a day. */
const MAX_AHEAD_S = 86_400;

const isNewer = (a: EventLike, b: EventLike) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);

/**
 * The reviews of a place that stand, from what the relays gave: records of
 * this place, dated no more than a day ahead of `now` (unix seconds), and of
 * each person only their newest — one person, one voice, whichever `d` they
 * wrote it under — less any whose removal is among them.
 */
export function standingReviews(events: EventLike[], address: string, now: number): PlaceReview[] {
  const newest = new Map<string, EventLike>();
  for (const e of events) {
    if (e.kind !== PLACE_REVIEW_KIND || !namesPlace(e, address)) continue;
    // One from the future is ignored altogether: it must not replace the real review it would be newer than.
    if (e.created_at > now + MAX_AHEAD_S) continue;
    const held = newest.get(e.pubkey);
    if (!held || isNewer(e, held)) newest.set(e.pubkey, e);
  }
  const removals = events.filter((e) => e.kind === 5);
  return [...newest.values()]
    .filter((e) => !removals.some((r) => removes(r, e)))
    .map(readReview)
    .sort((a, b) => b.at - a.at);
}

/**
 * Whether a removal (NIP-09, kind 5) takes a review down: signed by the
 * reviewer, naming it by id, or by its address when it was written no later
 * than the removal.
 */
function removes(removal: EventLike, review: EventLike): boolean {
  if (removal.pubkey !== review.pubkey) return false;
  const at = `${PLACE_REVIEW_KIND}:${review.pubkey}:${tagOf(review.tags, "d") ?? ""}`;
  return removal.tags.some(
    (t) =>
      (t[0] === "e" && t[1] === review.id) || (t[0] === "a" && t[1] === at && review.created_at <= removal.created_at),
  );
}

/** The tags this page sets on a review; every other tag on a review it edits is carried over. */
const OWN_TAGS = new Set(["d", "a", "m", "rating", "s", "alt", "price", "paid", "imeta"]);

/** A review as the composer holds it, to be changed: whole stars, as the composer offers them. */
export function draftOf(review: PlaceReview): Required<ReviewDraft> {
  return {
    text: review.text,
    rating: review.rating == null ? null : Math.round(review.rating),
    price: review.price,
    paid: review.paid,
    photos: review.photos,
  };
}

/**
 * The record a reader signs to review a place (the contract's section 3),
 * or to change the review they have: `previous` is that record, whose `d`
 * the change is written at, whose `imeta` for a photo still shown is kept
 * as it was, and whose tags this page doesn't set are carried over,
 * unchanged and in their order — so neither app strips the other's fields.
 * A change is dated `now` (unix seconds), or a second after `previous` when
 * that one's clock ran ahead: it must be the newer to replace it.
 */
export function placeReviewTemplate(
  place: { address: string; name: string },
  draft: ReviewDraft,
  previous?: { tags: string[][]; created_at?: number },
  now = Math.floor(Date.now() / 1000),
): { kind: typeof PLACE_REVIEW_KIND; content: string; tags: string[][]; created_at?: number } {
  const d = (previous && tagOf(previous.tags, "d")) || `place:${place.address}`;
  const stars = draft.rating ?? null;
  const name = place.name.trim() || "a place";
  const tags: string[][] = [
    ["d", d],
    ["a", place.address],
    ["m", "place"],
  ];
  if (stars != null) tags.push(["rating", (stars / 5).toFixed(3)], ["s", String(stars)]);
  tags.push(["alt", stars != null ? `Review of ${name}: ${stars} of 5 stars` : `Review of ${name}`]);
  if (draft.price != null) tags.push(["price", String(draft.price)]);
  if (draft.paid) tags.push(["paid", draft.paid]);
  const imetaOf = (url: string) =>
    previous?.tags.find((t) => t[0] === "imeta" && t.slice(1).some((part) => part === `url ${url}`));
  for (const url of draft.photos) tags.push(imetaOf(url) ?? ["imeta", `url ${url}`]);
  for (const t of previous?.tags ?? []) if (!OWN_TAGS.has(t[0])) tags.push(t);
  const content = [draft.text.trim(), ...draft.photos].filter(Boolean).join("\n");
  if (!previous) return { kind: PLACE_REVIEW_KIND, content, tags };
  return { kind: PLACE_REVIEW_KIND, content, tags, created_at: Math.max(now, (previous.created_at ?? 0) + 1) };
}

/** The removal (NIP-09) a reviewer signs for their review: by id and by address, with the kind. */
export function removalTemplate(review: Pick<PlaceReview, "id" | "pubkey" | "tags">): {
  kind: 5;
  content: string;
  tags: string[][];
} {
  const d = tagOf(review.tags ?? [], "d") ?? "";
  return {
    kind: 5,
    content: "",
    tags: [
      ["e", review.id],
      ["a", `${PLACE_REVIEW_KIND}:${review.pubkey}:${d}`],
      ["k", String(PLACE_REVIEW_KIND)],
    ],
  };
}

/** Below this rank (0 to 100) a reviewer is outside the lens: shown, never counted. */
const MIN_RANK = 5;

/**
 * The star value of a place through one lens (the contract's section 8):
 * each reviewer's stars weighted by their rank ÷ 100 in that lens, over the
 * reviews that stand and give stars; to one decimal. Null when nobody
 * counted. Never a plain average: two apps showing the same person the same
 * place through the same lens show the same value.
 */
export function weightedStars(
  reviews: { pubkey: string; rating: number | null }[],
  rankOf: (pubkey: string) => number | null,
): { value: number; counted: number } | null {
  let sum = 0;
  let weights = 0;
  let counted = 0;
  for (const r of reviews) {
    const rank = rankOf(r.pubkey);
    if (r.rating == null || rank == null || rank < MIN_RANK || rank > 100) continue;
    sum += (rank / 100) * r.rating;
    weights += rank / 100;
    counted++;
  }
  if (counted === 0) return null;
  return { value: Math.round((sum / weights) * 10) / 10, counted };
}

/** A rank as a scorer writes it: a plain decimal number, such as "6" or "12.5". */
const DECIMAL = /^\d+(?:\.\d+)?$/;

/**
 * Each person's rank in one lens: from `scorer`'s newest kind 30382 about
 * them (`d` is their public key), when it holds a `rank` from 0 to 100. A
 * newest event without one leaves the person out — an older, good rank does
 * not stand in for it. As Regulars reads it (src/trust/houseWeights.ts).
 */
export function ranksFrom(events: EventLike[], scorer: string): Map<string, number> {
  const newest = new Map<string, EventLike>();
  for (const e of events) {
    if (e.kind !== 30382 || e.pubkey !== scorer) continue;
    const subject = tagOf(e.tags, "d");
    if (!subject) continue;
    const held = newest.get(subject);
    if (!held || isNewer(e, held)) newest.set(subject, e);
  }
  const ranks = new Map<string, number>();
  for (const [subject, e] of newest) {
    const text = tagOf(e.tags, "rank");
    if (text && DECIMAL.test(text) && Number(text) <= 100) ranks.set(subject, Number(text));
  }
  return ranks;
}

/** Whose lens a star value is through: the reader's own, or the list curator's. */
export type Lens = "you" | "curator";

/**
 * The star value a place's page shows, and whose lens it is: the reader's
 * own when someone they trust gave stars, else the curator's — the lens a
 * visitor sees, Regulars' "House picks". Null when neither counts anyone.
 */
export function placeRating(
  reviews: { pubkey: string; rating: number | null }[],
  lenses: { you?: Map<string, number> | null; curator: Map<string, number> | null },
): { value: number; counted: number; lens: Lens } | null {
  for (const lens of ["you", "curator"] as const) {
    const ranks = lenses[lens];
    if (!ranks) continue;
    const found = weightedStars(reviews, (pk) => ranks.get(pk) ?? null);
    if (found) return { ...found, lens };
  }
  return null;
}
