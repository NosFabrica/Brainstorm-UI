import { LISTING_KIND, isSellable, parseListing, type Listing, type ListingPrice } from "./listing";

/**
 * One product, several listings. A reader wants one card that says "10
 * options", not ten cards.
 *
 * ## Two ways of knowing
 *
 * **The seller said so.** The Open Markets specification gives a product a
 * `type`: a `variable` parent, and `variation`s that each point at it with an
 * `a` tag and name their option in `spec` tags (`Size`, `6XL`). Where a
 * listing carries a type, that is the whole truth: variations of one parent
 * are one product whatever their titles, prices or photos, and two parents
 * are two products however alike they look. The parent stands for the
 * product; it is never one of its own options. Only the parent's own seller
 * can add a variation to it.
 *
 * **A guess, for listings that say nothing.** Most marketplaces have no notion
 * of options, so a seller publishes "T-SHIRT — XL", "T-SHIRT — L" as separate
 * listings. Those fold when they share a seller, a price, a first photo, and a
 * title equal up to the first " — ", " – ", " - " or " / " (a hyphen inside a
 * word is not a separator). Conservative on purpose, and never applied to a
 * listing that carries a type: a name with a dash in it ("Hoodie – Rules
 * Without Rulers") is exactly what the guess gets wrong.
 *
 * Input order is kept (callers pass newest first): a product sits where its
 * first listing sat.
 */
const SEPARATOR = /\s+(?:—|–|-|\/)\s+/;

export interface VariantGroup {
  /** The lead listing's id — stable for keys. */
  id: string;
  /** The product's name: the parent's title, or the shared part of its options' titles. */
  title: string;
  /** The listing a tap opens: the parent when we hold it, else the first option. */
  primary: Listing;
  /**
   * The options, each a listing of its own with its own page and buy link. A
   * declared family's parent is not among them. A lone listing is its own
   * single member.
   */
  members: Listing[];
  /** What to call each member, in member order. Empty for a lone listing. */
  options: string[];
  /** The declared parent, when the seller published one and we hold it. */
  parent: Listing | null;
  /**
   * False when the options belong to a declared parent we do not hold — a
   * search that matched some sizes and not the product. The list may be
   * partial, so nothing should count it.
   */
  complete: boolean;
  /** What every option is an option of ("Size"), when they all name the same one thing. */
  optionName: string | null;
  /** The lowest price among the options (or the product's own), and whether they differ. */
  priceFrom: { price: ListingPrice; varies: boolean } | null;
}

export function splitVariantTitle(title: string): { prefix: string; option: string | null } {
  const m = SEPARATOR.exec(title);
  if (!m || m.index === 0) return { prefix: title.trim(), option: null };
  const prefix = title.slice(0, m.index).trim();
  const option = title.slice(m.index + m[0].length).trim();
  if (!prefix || !option) return { prefix: title.trim(), option: null };
  return { prefix, option };
}

export const listingAddress = (l: { pubkey: string; d: string }) => `${LISTING_KIND}:${l.pubkey}:${l.d}`;

/**
 * The declared family a listing belongs to, as its parent's address: a
 * variable is its own; a variation is its parent's, provided the parent is the
 * same seller's. Null for everything else.
 */
export function familyOf(l: Listing): string | null {
  if (l.productType === "variable") return listingAddress(l);
  if (l.productType === "variation" && l.parent?.split(":")[1] === l.pubkey) return l.parent;
  return null;
}

/** What a variation is called among its siblings: its spec values, else what its title adds. */
function optionLabel(l: Listing, familyTitle: string | null): string {
  if (l.specs.length) return l.specs.map((s) => s.value).join(" / ");
  if (familyTitle && l.title.toLowerCase().startsWith(familyTitle.toLowerCase())) {
    const rest = l.title
      .slice(familyTitle.length)
      .replace(/^\s*(?:—|–|-|\/|:|,)?\s*/, "")
      .trim();
    if (rest) return rest;
  }
  return splitVariantTitle(l.title).option ?? l.title;
}

/** A clothing size's place on the usual scale, or null when the label is not one. */
function sizeRank(label: string): number | null {
  const s = label.trim().toLowerCase().replace(/\s+/g, "");
  const fixed: Record<string, number> = { xxxs: -2, xxs: -1, xs: 0, s: 1, m: 2, l: 3, xl: 4, xxl: 5, xxxl: 6 };
  if (s in fixed) return fixed[s];
  const m = /^(\d+)xl$/.exec(s);
  if (m) return 3 + Number(m[1]);
  const small = /^(\d+)xs$/.exec(s);
  if (small) return 1 - Number(small[1]);
  return null;
}

/** Sizes read small to large; anything else stays as published. */
function inOptionOrder(members: Listing[], labels: string[]): { members: Listing[]; labels: string[] } {
  const ranks = labels.map(sizeRank);
  if (ranks.some((r) => r === null)) return { members, labels };
  const order = members.map((_, i) => i).sort((a, b) => (ranks[a] as number) - (ranks[b] as number));
  return { members: order.map((i) => members[i]), labels: order.map((i) => labels[i]) };
}

function lowestPrice(listings: Listing[]): VariantGroup["priceFrom"] {
  const priced = listings.map((l) => l.price).filter((p): p is ListingPrice => !!p);
  if (priced.length === 0) return null;
  const lowest = priced.reduce((a, b) => (b.amount < a.amount ? b : a));
  const varies = priced.some(
    (p) => p.amount !== lowest.amount || p.currency !== lowest.currency || p.frequency !== lowest.frequency,
  );
  return { price: lowest, varies };
}

const lone = (l: Listing): VariantGroup => ({
  id: l.id,
  title: l.title,
  primary: l,
  members: [l],
  options: [],
  parent: null,
  complete: true,
  optionName: null,
  priceFrom: lowestPrice([l]),
});

/** The product a declared family is, from its parent (if held) and the variations in hand. */
function declaredGroup(parent: Listing | null, variations: Listing[]): VariantGroup {
  if (variations.length === 0) return lone(parent as Listing);
  // Without the parent, the name is the newest option's title less its own option.
  const newest = variations[0];
  const ownOption = newest.specs.map((s) => s.value).join(" / ");
  const stripped =
    ownOption && newest.title.toLowerCase().endsWith(ownOption.toLowerCase())
      ? newest.title
          .slice(0, newest.title.length - ownOption.length)
          .replace(/\s*(?:—|–|-|\/|:|,)?\s*$/, "")
          .trim()
      : "";
  const title = parent?.title ?? (stripped || splitVariantTitle(newest.title).prefix);
  const ordered = inOptionOrder(
    variations,
    variations.map((v) => optionLabel(v, parent?.title ?? title)),
  );
  const keys = new Set(variations.map((v) => v.specs.map((s) => s.key).join("\u0000")));
  const onlyKey = keys.size === 1 && variations[0].specs.length === 1 ? variations[0].specs[0].key : null;
  const primary = parent ?? newest;
  return {
    id: primary.id,
    title,
    primary,
    members: ordered.members,
    options: ordered.labels,
    parent,
    complete: parent !== null,
    optionName: onlyKey,
    priceFrom: lowestPrice(variations),
  };
}

export function collapseVariants(listings: Listing[]): VariantGroup[] {
  // Declared families first: what each one holds, wherever its listings sit.
  const families = new Map<string, { parent: Listing | null; variations: Listing[] }>();
  for (const l of listings) {
    const family = familyOf(l);
    if (!family) continue;
    const held = families.get(family) ?? { parent: null, variations: [] };
    if (l.productType === "variable") held.parent ??= l;
    else held.variations.push(l);
    families.set(family, held);
  }

  const groups: VariantGroup[] = [];
  const placed = new Set<string>();
  const guessed = new Map<string, VariantGroup>();
  for (const l of listings) {
    const family = familyOf(l);
    if (family) {
      // The product takes the place of whichever of its listings came first.
      if (placed.has(family)) continue;
      placed.add(family);
      const held = families.get(family)!;
      groups.push(declaredGroup(held.parent, held.variations));
      continue;
    }
    // A listing that says what it is (simple, or a variation with no usable
    // parent) is never guessed at.
    const { prefix, option } = l.productType === null ? splitVariantTitle(l.title) : { prefix: l.title, option: null };
    const photo = l.images[0];
    const key =
      option && photo && l.price
        ? `${l.pubkey}|${prefix.toLowerCase()}|${l.price.amount}|${l.price.currency}|${l.price.frequency ?? ""}|${photo}`
        : null;
    const existing = key ? guessed.get(key) : undefined;
    if (existing) {
      existing.members.push(l);
      existing.options.push(option as string);
      continue;
    }
    const group = lone(l);
    if (option) {
      group.title = prefix;
      group.options = [option];
    }
    groups.push(group);
    if (key) guessed.set(key, group);
  }
  // A lone listing with a separator is just a listing — keep its full title.
  for (const g of groups) {
    if (!g.parent && g.complete && g.members.length === 1) {
      g.title = g.primary.title;
      g.options = [];
    }
  }
  return groups;
}

/**
 * What is for sale among `listings`: nothing sold, hidden or priceless, and
 * nothing of a product whose parent the seller hid — hiding the product hides
 * its options.
 */
export function sellableListings(listings: Listing[]): Listing[] {
  const hiddenProducts = new Set(
    listings.filter((l) => l.productType === "variable" && l.hidden).map((l) => listingAddress(l)),
  );
  return listings.filter((l) => isSellable(l) && !(l.parent && hiddenProducts.has(l.parent)));
}

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content?: string };

export interface ProductCard<E extends EventLike> {
  /** The event the card renders and a tap opens: the product's parent, else its newest option. */
  event: E;
  group: VariantGroup;
}

/**
 * Raw events → sellable products, newest first, each product's options
 * folded into it. The shape every "things for sale" surface renders from.
 */
export function productsFromEvents<E extends EventLike>(events: E[]): ProductCard<E>[] {
  const byId = new Map<string, E>();
  const parsed: Listing[] = [];
  for (const ev of [...events].sort((a, b) => b.created_at - a.created_at)) {
    const l = parseListing({ ...ev, content: ev.content ?? "" });
    if (!l) continue;
    byId.set(ev.id, ev);
    parsed.push(l);
  }
  return collapseVariants(sellableListings(parsed)).map((group) => ({
    event: byId.get(group.primary.id) as E,
    group,
  }));
}
