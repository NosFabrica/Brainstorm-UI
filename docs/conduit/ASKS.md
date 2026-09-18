# Buying on Conduit from Brainstorm — what ships, and what would make it seamless

**For:** the Conduit team (Conduit-BTC/conduit-mono)
**From:** Brainstorm UI, branch `feat/conduit-checkout`, 2026-09-18

## What ships in Brainstorm

A kind-30402 listing's page leads with **Buy on Conduit**. It opens the listing on
`https://shop.conduit.market/products/<naddr>` in a new tab. The `naddr` carries the relay
we found the listing on, plus `wss://relay.conduit.market`.

- **When we link.** We only link when Conduit would sell the listing by its own rules
  (`listing-safety.ts`): for sale, addressable, at least one http(s) image, and type
  `simple`/`variable` or none. Anything else keeps "Message seller" as the main action.
- **Seller trust.** Next to the button, Brainstorm shows who the seller is: Brainstorm's
  trust rating for them, and how far they are from the buyer in their web of trust.
- **Sign-in note.** The small print tells buyers what checkout will ask of them, based on
  how they sign in to Brainstorm:
  - **extension:** "your extension signs you in there"
  - **remote signer:** "connect the same signer app there"
  - **anyone else:** "check out as a guest"

Nothing about the buyer travels in the link. Browsers keep each site's sign-in apart, and
Conduit has no handoff today.

## Asks, in the order they'd help most

1. **A sign-in hint.** For example `?signin=nip07` or `?signin=nip46`. Arriving from
   Brainstorm would then open the matching connect prompt straight away, instead of the
   buyer hunting for it. For NIP-07 users that's one click from wherever they landed.
2. **Buy now / add to cart from the link.** For example
   `/products/<naddr>?add=1&qty=1`, so the buyer lands with the item already in their cart.
   Today the cart only lives in local storage, and "Add to cart" is a second step.
3. **A return URL.** For example `?return=<url>`, so a finished order can offer "Back to
   Brainstorm", returning the buyer to the listing they came from.
4. **Optional: an availability check.** A way to learn whether a listing is sellable on
   Conduit before we link to it. For now we mirror your `listing-safety` rules, and they
   can drift.
