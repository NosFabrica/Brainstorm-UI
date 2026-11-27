/**
 * Reviews of a book, read, written and removed (lib/bookReviews has the rules;
 * docs/dictionary/books-actions.md, #253, the contract): the shared record,
 * kind 34259 marked `book` — the one Unbnd writes too.
 *
 * Read from our index under its `include:spam` lens and the relays Unbnd
 * publishes to as well (services/listReads), never the hub, which refuses
 * reviews: by the book's address either way a record names it, then the
 * removals of what came back. Published, and removed, to the reviewer's own
 * write relays and the index, where Unbnd reads (services/tags
 * publishToOutbox) — never the hub.
 *
 * A lens's ranks for the star value are the places' (services/placeReviews
 * readLensRanks, through hooks/useLensRanks): the same rule for every mark.
 */
import type { NostrEvent } from "nostr-tools";
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { coordinateOf } from "@/lib/dlistFields";
import { SEARCH_RELAY } from "@/lib/relays";
import { bookReviewTemplate, standingBookReviews, type BookReview } from "@/lib/bookReviews";
import { removalTemplate } from "@/lib/placeReviews";
import { readReviewEvents } from "@/services/placeReviews";
import { publishToOutbox } from "@/services/tags";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
/** Where Unbnd publishes reviews beside the index (the books contract's relays). */
const UNBND_RELAYS = ["wss://nos.lol", "wss://relay.primal.net"];
const nowS = () => Math.floor(Date.now() / 1000);

/** The records and removals of a book's reviews (services/placeReviews readReviewEvents), from Unbnd's relays. */
export function readBookReviewEvents(address: string): Promise<NostrEvent[]> {
  return readReviewEvents([address], { mark: "book", limit: 500, relays: UNBND_RELAYS });
}

/**
 * Sign and publish the reader's review of a book, or a change to the one they
 * have (`previous`, the record as signed). Hands back the review as the page
 * shows it.
 */
export async function publishBookReview(
  item: Item,
  draft: { text: string; rating: number | null },
  { title, previous }: { title: string; previous?: { tags: string[][]; created_at?: number } },
): Promise<BookReview> {
  const address = coordinateOf(item) ?? "";
  const signed = await signAs(requireActiveAccount(), bookReviewTemplate({ address, title }, draft, previous));
  await publishToOutbox(signed as never, [SEARCH_RELAY]);
  const [mine] = standingBookReviews([signed], address, nowS());
  return mine;
}

/** Sign and publish the removal of the reader's review, wherever reviews are sent. */
export async function removeBookReview(review: Pick<BookReview, "id" | "pubkey" | "tags">): Promise<void> {
  const signed = await signAs(requireActiveAccount(), removalTemplate(review));
  await publishToOutbox(signed as never, [SEARCH_RELAY]);
}
