/**
 * Reviews of a place, read and written (lib/placeReviews has the rules).
 * Read from wherever list events live — the hub and our index, both at
 * once (services/listReads) — since a reviewer's comment goes where the
 * item is. Published as every user event is: signed as the active account,
 * to the author's write relays and the hub (publishTagEvent).
 */
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { dictionaryRelays } from "@/config/dictionary";
import { coordinateOf } from "@/lib/dlistFields";
import { readListEvents } from "@/services/listReads";
import { publishTagEvent } from "@/services/tags";
import { reviewOf, reviewTemplate, type PlaceReview, type ReviewDraft } from "@/lib/placeReviews";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };
const TIMEOUT_MS = 6000;

export async function fetchPlaceReviews(item: Item): Promise<PlaceReview[]> {
  const address = coordinateOf(item);
  if (!address) return [];
  const events = await readListEvents(
    [
      { kinds: [1111], "#A": [address], limit: 200 },
      { kinds: [1111], "#a": [address], limit: 200 },
    ],
    TIMEOUT_MS,
  );
  const seen = new Set<string>();
  const out: PlaceReview[] = [];
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    const r = reviewOf(ev, address);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.at - a.at);
}

export async function publishPlaceReview(item: Item, draft: ReviewDraft): Promise<PlaceReview> {
  const hint = dictionaryRelays()[0] ?? "";
  const signed = await signAs(requireActiveAccount(), reviewTemplate(item, draft, hint));
  await publishTagEvent(signed as never);
  const address = coordinateOf(item) ?? "";
  return (
    reviewOf(signed, address) ?? {
      id: signed.id,
      pubkey: signed.pubkey,
      at: signed.created_at,
      text: draft.text.trim(),
      photos: draft.photos,
      price: draft.price,
      paid: draft.paid,
      rating: draft.rating ?? null,
    }
  );
}
