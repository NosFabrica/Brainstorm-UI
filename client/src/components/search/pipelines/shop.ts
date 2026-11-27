/** The Shop tab: one card per product, its categories and price bands, and the page's own price sort. */
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { isListed, parseListing } from "@/lib/listing";
import { describeThing } from "@/lib/thing";
import { collapseDuplicateListings } from "@/lib/listingDuplicates";
import { foldProductHits, type VariantGroup } from "@/lib/listingVariants";
import { readFilters } from "@/lib/searchSyntax";
import { priceInCurrency, toSats, type BtcRates, type Fiat, type PriceBand } from "@/lib/exchangeRate";
import { SHOP_PLACE_KINDS } from "@/components/search/tabKinds";
import { countFacets, type Facet } from "./types";

export type ShopFold = { hits: SearchHit[]; groups: Map<string, VariantGroup> };

/** The Shop's price sort, when the query asks one (FiltersPanel's PRICE_SORTS): the page orders the cards itself. */
export const priceSortOf = (query: string): "asc" | "desc" | null => {
  const sort = readFilters(query).sort;
  return sort === "price" ? "asc" : sort === "price:desc" ? "desc" : null;
};

/**
 * The Shop as products: one card per product, its sizes and colours folded
 * into it by the family its seller declared (lib/listingVariants, #158).
 * Same-title copies from two apps fold first, into the one with a page —
 * among copies for sale only: a sold copy with a page must not replace the
 * copy on sale and then be dropped, taking the product with it.
 */
export function foldShop(hits: SearchHit[]): ShopFold {
  return foldProductHits(
    collapseDuplicateListings(
      hits.filter((h) => {
        if (SHOP_PLACE_KINDS.has(h.event.kind)) return describeThing(h.event) !== null;
        const l = parseListing(h.event);
        return !!l && isListed(l);
      }),
    ),
  );
}

/** Each seller's events on the page, built once per snapshot. */
export function eventsBySeller(hits: readonly SearchHit[]): Map<string, NostrEvent[]> {
  const out = new Map<string, NostrEvent[]>();
  for (const h of hits) {
    const list = out.get(h.event.pubkey);
    if (list) list.push(h.event);
    else out.set(h.event.pubkey, [h.event]);
  }
  return out;
}

/** The listings' own categories, counted — the Shop's facets. */
export function shopFacets(hits: readonly SearchHit[]): Facet[] {
  return countFacets(hits, (h) => parseListing(h.event)?.categories ?? []).slice(0, 8);
}

export interface ShopState {
  category: string | null;
  price: PriceBand["key"] | null;
  rates: BtcRates | null;
  bands: readonly PriceBand[];
  viewerFiat: Fiat;
  priceSort: "asc" | "desc" | null;
  fold: ShopFold | null;
}

/** The Shop's rows: narrowed by category and price band, ordered by price when asked. */
export function shopRows(shown: SearchHit[], s: ShopState): SearchHit[] {
  if (s.category) {
    const category = s.category;
    shown = shown.filter((h) => (parseListing(h.event)?.categories ?? []).includes(category));
  }
  // The price a Shop card shows, so the band and the sort agree with it: a
  // product's lowest option ("From $50"), else the listing's own price.
  const shownPrice = (h: SearchHit) => {
    const from = s.fold?.groups.get(h.event.id)?.priceFrom;
    if (from && from.varies && !from.mixed) return from.price;
    return parseListing(h.event)?.price ?? null;
  };
  const rates = s.rates;
  if (s.price && rates) {
    const band = s.bands.find((b) => b.key === s.price);
    shown = shown.filter((h) => {
      const price = shownPrice(h);
      const amount = price ? priceInCurrency(price, rates, s.viewerFiat) : null;
      return amount !== null && !!band?.holds(amount);
    });
  }
  if (s.priceSort) {
    // Cheapest (or dearest) first; a price we cannot convert goes last either way.
    // Keyed once, not in the comparator: a sort calls it n·log n times.
    const keys = new Map<string, number | null>();
    for (const h of shown) {
      const price = shownPrice(h);
      keys.set(h.event.id, price ? toSats(price, rates) : null);
    }
    const dir = s.priceSort === "asc" ? 1 : -1;
    shown = [...shown].sort((a, b) => {
      const x = keys.get(a.event.id) ?? null;
      const y = keys.get(b.event.id) ?? null;
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * dir;
    });
  }
  return shown;
}
