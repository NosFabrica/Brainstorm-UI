import { useEffect, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchListingFamily, fetchRecentByKinds } from "@/services/nostr";
import { LISTING_KIND, parseListing } from "@/lib/listing";
import { familyOf, productsFromEvents, type ProductCard } from "@/lib/listingVariants";

type ListingLike = Pick<NostrEvent, "id" | "pubkey" | "kind" | "created_at" | "tags">;

export interface ListingOptionChip {
  id: string;
  pubkey: string;
  label: string;
  /** The option being read. */
  current: boolean;
}

export interface ListingShelf {
  /**
   * This product's options: every one of them when the seller declared the
   * product (this listing's own marked), the others when it is a title guess.
   * Null when the listing is not one of several.
   */
  options: { heading: string; chips: ListingOptionChip[] } | null;
  /** The seller's other products — never this one, in any of its options. */
  others: ProductCard<NostrEvent>[];
}

const EMPTY: ListingShelf = { options: null, others: [] };

/** One ask in flight per listing, however many parts of its page want the answer. */
const asked = new Map<string, Promise<ListingShelf>>();

function load(event: ListingLike): Promise<ListingShelf> {
  const address = `${event.kind}:${event.pubkey}:${event.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
  // As deep as the profile's shelf asks: a seller's newest listings can be a
  // run of hidden copies (Staci's shop, 2026-09-24). A declared product is
  // also asked for by name, so a big shop's product page never shows half
  // its sizes (lib/listingVariants, #158).
  const self = parseListing({ ...event, content: "" });
  const family = self ? familyOf(self) : null;
  return Promise.all([
    fetchRecentByKinds(event.pubkey, [LISTING_KIND], 100),
    family ? fetchListingFamily(event.pubkey, family).catch(() => []) : Promise.resolve([]),
  ]).then(([recent, familyEvents]) => {
    const seen = new Set<string>();
    const evs = [...recent, ...familyEvents].filter((ev) => !seen.has(ev.id) && seen.add(ev.id));
    // The seller's things as products. The product this listing belongs to
    // gives its options; the rest are "more for sale".
    const products = productsFromEvents(evs);
    const isThis = (m: { id: string; pubkey: string; d: string }) =>
      m.id === event.id || `${LISTING_KIND}:${m.pubkey}:${m.d}` === address;
    const own = products.find((p) => isThis(p.group.primary) || p.group.members.some(isThis));
    // Declared by the seller: the parent is the product, never an option.
    const declared = !!own && (own.group.parent !== null || !own.group.complete);
    const chips = (own?.group.options.length ? own.group.members : [])
      .map((m, i) => ({ id: m.id, pubkey: m.pubkey, label: own!.group.options[i], current: isThis(m) }))
      .filter((c) => declared || !c.current);
    return {
      options:
        chips.length > 0 ? { heading: declared ? (own!.group.optionName ?? "Options") : "Other options", chips } : null,
      others: products.filter((p) => p !== own),
    };
  });
}

/**
 * What a listing's page needs to know about its seller's shelf: the options
 * of the product it belongs to, and the seller's other products. The options
 * sit by the buy button and the other products below the description, so two
 * parts of the page ask; they share one answer.
 */
export function useListingShelf(event: ListingLike): ListingShelf {
  const [shelf, setShelf] = useState<ListingShelf>(EMPTY);
  useEffect(() => {
    let alive = true;
    setShelf(EMPTY);
    let pending = asked.get(event.id);
    if (!pending) {
      pending = load(event).catch(() => EMPTY);
      asked.set(event.id, pending);
      // Shared only while it is in flight — the page's parts mount together —
      // so a later visit asks afresh.
      void pending.finally(() => asked.delete(event.id));
    }
    void pending.then((answer) => {
      if (alive) setShelf(answer);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on event identity
  }, [event.id]);
  return shelf;
}
