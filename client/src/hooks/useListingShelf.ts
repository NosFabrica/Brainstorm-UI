import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchListingFamily } from "@/services/nostr";
import { LISTING_KIND, parseListing } from "@/lib/listing";
import { familyOf, productsFromEvents, type ProductCard } from "@/lib/listingVariants";
import { useRecentByKinds } from "@/hooks/useRecentByKinds";
import { useStoreEvents } from "@/hooks/useStoreEvents";

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

/**
 * What the options row is called. On an option's own page one is already
 * chosen, so the row names what it is ("Size"); on the product's page none
 * is, so it asks ("Choose a size").
 */
function headingFor(optionName: string | null, chosen: boolean): string {
  if (chosen) return optionName ?? "Options";
  if (!optionName) return "Choose an option";
  const word = optionName.toLowerCase();
  return `Choose ${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
}

/**
 * What a listing's page needs to know about its seller's shelf: the options
 * of the product it belongs to, and the seller's other products. The options
 * sit by the buy button and the other products below the description, so two
 * parts of the page ask; the store gives them one answer.
 */
export function useListingShelf(event: ListingLike): ListingShelf {
  const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  const address = `${event.kind}:${event.pubkey}:${d}`;
  // As deep as the profile's shelf asks: a seller's newest listings can be a
  // run of hidden copies (Staci's shop, 2026-09-24), and thirty of those left
  // the row empty while her profile showed 36 products.
  const recent = useRecentByKinds(event.pubkey, [LISTING_KIND], 100).events;
  // A declared product is also asked for by name — its parent and whatever
  // points at it — so a big shop's product page never shows half its sizes
  // (lib/listingVariants, #158).
  const family = useMemo(() => {
    const self = parseListing({ ...event, content: "" });
    return self ? familyOf(self) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on event identity
  }, [event.id]);
  const familyFilters = useMemo(
    () =>
      family
        ? [
            { kinds: [LISTING_KIND], authors: [event.pubkey], "#d": [family.split(":").slice(2).join(":")] },
            { kinds: [LISTING_KIND], authors: [event.pubkey], "#a": [family] },
          ]
        : null,
    [family, event.pubkey],
  );
  const familyEvents = useStoreEvents(
    family ? `listing-family:${family}` : null,
    familyFilters,
    () => fetchListingFamily(event.pubkey, family as string),
    { minMs: 5 * 60_000, stream: false },
  ).events;

  return useMemo(() => {
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
        chips.length > 0
          ? {
              heading: declared
                ? headingFor(
                    own!.group.optionName,
                    chips.some((c) => c.current),
                  )
                : "Other options",
              chips,
            }
          : null,
      others: products.filter((p) => p !== own),
    };
  }, [recent, familyEvents, event.id, address]);
}
