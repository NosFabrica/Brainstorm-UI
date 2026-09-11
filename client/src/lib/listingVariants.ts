import { isSellable, parseListing, type Listing } from "./listing";

/**
 * One product, several listings. Marketplaces have no notion of options, so a
 * seller publishes "T-SHIRT — XL", "T-SHIRT — L", "T-SHIRT — M" as three
 * listings; a reader wants one card that says "3 options".
 *
 * The rule is conservative on purpose, because it is a guess about titles:
 * same seller, same price, same first photo, and a title equal up to the
 * first " — ", " – ", " - " or " / ". A hyphen inside a word ("Tee-shirt")
 * is not a separator. Listings without a separator, or without a photo,
 * never merge. Input order is kept (callers pass newest first), so the
 * newest member leads each group and options read in that order.
 */
const SEPARATOR = /\s+(?:—|–|-|\/)\s+/;

export interface VariantGroup {
  /** The lead member's id — stable for keys. */
  id: string;
  /** The shared title — the part before the separator, or the whole title. */
  title: string;
  /** The listing a tap opens: the newest member. */
  primary: Listing;
  /** Every listing in the group, the primary first. */
  members: Listing[];
  /** The part after the separator for each member, in member order. Empty for a lone listing. */
  options: string[];
}

export function splitVariantTitle(title: string): { prefix: string; option: string | null } {
  const m = SEPARATOR.exec(title);
  if (!m || m.index === 0) return { prefix: title.trim(), option: null };
  const prefix = title.slice(0, m.index).trim();
  const option = title.slice(m.index + m[0].length).trim();
  if (!prefix || !option) return { prefix: title.trim(), option: null };
  return { prefix, option };
}

export function collapseVariants(listings: Listing[]): VariantGroup[] {
  const groups: VariantGroup[] = [];
  const byKey = new Map<string, VariantGroup>();
  for (const l of listings) {
    const { prefix, option } = splitVariantTitle(l.title);
    const photo = l.images[0];
    const key =
      option && photo && l.price
        ? `${l.pubkey}|${prefix.toLowerCase()}|${l.price.amount}|${l.price.currency}|${l.price.frequency ?? ""}|${photo}`
        : null;
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.members.push(l);
      existing.options.push(option as string);
      continue;
    }
    const group: VariantGroup = { id: l.id, title: option ? prefix : l.title, primary: l, members: [l], options: option ? [option] : [] };
    groups.push(group);
    if (key) byKey.set(key, group);
  }
  // A lone listing with a separator is just a listing — keep its full title.
  for (const g of groups) {
    if (g.members.length === 1) {
      g.title = g.primary.title;
      g.options = [];
    }
  }
  return groups;
}

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content?: string };

export interface ProductCard<E extends EventLike> {
  /** The event the card renders and a tap opens — the newest variant. */
  event: E;
  group: VariantGroup;
}

/**
 * Raw events → sellable products, newest first, size and colour variants
 * folded. The shape every "things for sale" surface renders from.
 */
export function productsFromEvents<E extends EventLike>(events: E[]): ProductCard<E>[] {
  const byId = new Map<string, E>();
  const listings: Listing[] = [];
  for (const ev of [...events].sort((a, b) => b.created_at - a.created_at)) {
    const l = parseListing({ ...ev, content: ev.content ?? "" });
    if (!l || !isSellable(l)) continue;
    byId.set(ev.id, ev);
    listings.push(l);
  }
  return collapseVariants(listings).map((group) => ({ event: byId.get(group.primary.id) as E, group }));
}
