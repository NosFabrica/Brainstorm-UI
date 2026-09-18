import { nip19 } from "nostr-tools";
import { isSellable, LISTING_KIND, type Listing } from "./listing";

/**
 * Conduit Market (conduit-mono, apps/market): where a Brainstorm buyer checks
 * out. Its product page takes the listing's Nostr address and fetches that
 * exact listing — even one outside its browse grid — so any kind-30402 from
 * any marketplace app has a page there. Checkout is Lightning; a buyer can
 * sign in with their own signer or check out as a guest. Nothing about the
 * buyer travels in the link: Conduit has no sign-in handoff (docs/conduit/ASKS.md).
 */
export const CONDUIT_SHOP = "https://shop.conduit.market";
export const CONDUIT_RELAY = "wss://relay.conduit.market";

/** Conduit reads up to four relay hints from the address. */
const MAX_RELAY_HINTS = 4;

/**
 * The listing's page on Conduit, by `naddr`: where we saw it first, then
 * Conduit's own relay, so the page finds it without searching.
 */
export function conduitProductUrl(listing: Pick<Listing, "pubkey" | "d">, relays: string[] = []): string {
  const hints = [...new Set([...relays.filter((r) => /^wss?:\/\//i.test(r)).slice(0, MAX_RELAY_HINTS - 1), CONDUIT_RELAY])];
  const naddr = nip19.naddrEncode({ kind: LISTING_KIND, pubkey: listing.pubkey, identifier: listing.d, relays: hints });
  return `${CONDUIT_SHOP}/products/${naddr}`;
}

/** A lone variation belongs to its variable parent; Conduit won't sell it by itself. */
const SELLABLE_TYPES = new Set(["simple", "variable"]);

/**
 * Whether Conduit will actually sell this listing — its own rules
 * (listing-safety.ts): for sale, addressable, with at least one photo, and a
 * type it sells on its own. Anything else would land the buyer on
 * "unavailable", so the listing keeps its other ways to act instead.
 */
export function conduitCanSell(listing: Listing): boolean {
  return (
    isSellable(listing) &&
    !!listing.d &&
    listing.images.length > 0 &&
    (!listing.type || SELLABLE_TYPES.has(listing.type))
  );
}
