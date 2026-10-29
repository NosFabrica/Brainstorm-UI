/**
 * A NIP-99 classified listing (kind 30402), read for a buyer.
 *
 * Probed 2026-09-04 across Shopstr, Barattolo, bitpopart and Conduit: nearly
 * every fresh listing carries a title, a price in one of eight currencies and
 * a photo; a third names a location; 40% carry no `status` tag at all, so an
 * absent status has to mean active or that stock disappears. Prices are shown
 * exactly as priced — there is no exchange rate here worth standing behind.
 */

export interface ListingPrice {
  amount: number;
  /** Upper-cased as published: SATS, SAT, BTC, USD, EUR, CHF, USDC, BRL… */
  currency: string;
  /** NIP-99's optional recurrence: "month", "year"… */
  frequency?: string;
}

export type ProductType = "simple" | "variable" | "variation";
const PRODUCT_TYPES = new Set<string>(["simple", "variable", "variation"]);

/** Open Markets' second `type` element: what is delivered — a file or a parcel. */
export type ProductFormat = "digital" | "physical";

/** A shipping cost the listing states itself (Shopstr, Barattolo, NIP-15 zones): a name and a price. */
export interface InlineShipping {
  name: string;
  amount: number;
  /** Upper-cased; empty when the seller priced it in no money of its own (the listing's applies). */
  currency: string;
}

/**
 * An Open Markets `shipping_option`: not a price but a pointer — at a kind-30406
 * shipping option, or at a kind-30405 collection whose options the product
 * takes on. `extra` is what this product adds on top of the option's own price,
 * in the product's currency; null when it adds nothing.
 */
export interface ShippingRef {
  /** `30406:<pubkey>:<d>` or `30405:<pubkey>:<d>`. */
  address: string;
  kind: 30405 | 30406;
  pubkey: string;
  d: string;
  extra: number | null;
}

export interface Listing {
  id: string;
  pubkey: string;
  d: string;
  title: string;
  summary: string | null;
  /** The event's content: the description as the seller wrote it. */
  description: string;
  /** Null when the seller published no usable price — still a listing, not for sale here. */
  price: ListingPrice | null;
  images: string[];
  location: string | null;
  /** "active" when the seller said so or said nothing; "sold" and others verbatim. */
  status: string;
  hidden: boolean;
  /** Open Markets' `visibility: pre-order`: for sale now, delivered later. */
  preOrder: boolean;
  /** How many the seller has, when they said (Open Markets `stock`). */
  stock: number | null;
  /** Digital or physical, when the seller's `type` tag said (Open Markets). */
  format: ProductFormat | null;
  /**
   * The Open Markets product type: a plain product, a parent that comes in
   * options, or one of a parent's options. Null when the seller's app said
   * nothing — most listings — which is not the same as saying "simple".
   */
  productType: ProductType | null;
  /** A variation's parent, as its address (`30402:<pubkey>:<d>`). Null otherwise. */
  parent: string | null;
  /** What the seller specified, in order: on a variation, which option it is ("Size", "6XL"). */
  specs: { key: string; value: string }[];
  categories: string[];
  /** The seller's own page for this listing, when the app published one. */
  shopUrl: string | null;
  /** Shipping the listing prices itself. */
  shipping: InlineShipping[];
  /** Shipping the listing points at (Open Markets): resolved from the store where it is shown. */
  shippingRefs: ShippingRef[];
  createdAt: number;
}

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content: string };

export const LISTING_KIND = 30402;

/** Marketplace apps tag every listing with their own name; that is provenance, not a category. */
export const APP_TAGS = new Set([
  "shopstr",
  "bitpopart",
  "barattolo",
  "conduit",
  "plebeian",
  "plebeian market",
  "nostrmarket",
  "nostr market",
  "2140",
]);

const isHttp = (s: string | undefined): s is string => !!s && /^https?:\/\//i.test(s);

const categoriesOf = (ev: EventLike): string[] =>
  [...new Set(ev.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1].trim().toLowerCase()))].filter(
    (c) => c && !APP_TAGS.has(c),
  );

/**
 * A price's billing period as a reader says it. NIP-99 writes the word
 * ("month"), Open Markets an ISO 8601 unit letter ("M"). Anything else in that
 * slot — "sats", "fixed", "request", seen on live listings — is not a period,
 * and printing it ("2000 BTC / sats") misprices the listing.
 */
const PERIODS: Record<string, string> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
  h: "hour",
  d: "day",
  w: "week",
  m: "month",
  y: "year",
};
function frequencyOf(v: string | undefined): string | undefined {
  const key = (v ?? "").trim().toLowerCase();
  return PERIODS[key] ?? PERIODS[key.replace(/s$/, "")];
}

/** A decimal as people write money and counts: "12", "-3", "0.75", "1e3". Never hex, octal or binary. */
const DECIMAL = /^\s*-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

/**
 * A number the seller actually wrote — a JSON number or a decimal string.
 * `Number(null)` and `Number("")` are 0, which would make a product with no
 * price a free one and a product with no stock count sold out; `Number("0x10")`
 * is 16, a price no seller typed. Quartz's `toDoubleOrNull` refuses both.
 */
export function numberOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && DECIMAL.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** An amount of money a seller wrote: a decimal, never negative. */
export function amountOf(v: unknown): number | null {
  const n = numberOf(v);
  return n !== null && n >= 0 ? n : null;
}

/**
 * Anything shaped like an address is a reference, never a zone name — the
 * `[\s\S]` because a `d` may hold a line break. Only 30405 and 30406 name
 * shipping; another kind there is a broken reference, not a price.
 */
const ADDRESS_SHAPE = /^(\d+):([0-9a-f]{64}):([\s\S]*)$/i;

/** Shopstr's shipping *types*, written where a zone name would be: "N/A" says there is no shipping to price. */
const NO_SHIPPING = new Set(["n/a", "na", "none"]);

/**
 * A listing's shipping tags, in the two shapes that share the tag names:
 *
 * - Open Markets: `["shipping_option", "30406:<pubkey>:<d>", "<extra-cost>"]`
 *   (or `30405:` for a collection's options) — a reference, and the third
 *   element is an EXTRA cost added on top of the referenced option's price,
 *   never the price itself. It is optional.
 * - Shopstr, Barattolo and other NIP-99 apps: `["shipping" | "shipping_option",
 *   "<name>", "<cost>", "<currency>"]` — the price itself.
 *
 * The first element tells them apart: an address is a reference.
 */
export function shippingOf(tags: string[][]): { inline: InlineShipping[]; refs: ShippingRef[] } {
  const inline: InlineShipping[] = [];
  const refs: ShippingRef[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (t[0] !== "shipping_option" && t[0] !== "shipping") continue;
    const raw = t[1] ?? "";
    const first = raw.trim();
    // The address as written: a `d` keeps its spaces, or the option it names is not found.
    const ref = ADDRESS_SHAPE.exec(raw) ?? ADDRESS_SHAPE.exec(first);
    if (ref) {
      if (ref[1] !== "30405" && ref[1] !== "30406") continue;
      const address = `${ref[1]}:${ref[2].toLowerCase()}:${ref[3]}`;
      if (seen.has(address)) continue;
      seen.add(address);
      const extra = numberOf(t[2]);
      refs.push({
        address,
        kind: Number(ref[1]) as 30405 | 30406,
        pubkey: ref[2].toLowerCase(),
        d: ref[3],
        extra: extra !== null && extra > 0 ? extra : null,
      });
      continue;
    }
    const amount = amountOf(t[2]);
    if (!first || NO_SHIPPING.has(first.toLowerCase()) || amount === null) continue;
    inline.push({ name: first, amount, currency: (t[3] ?? "").trim().toUpperCase() });
  }
  return { inline, refs };
}

/** NIP-15's product (JSON in content) and auction (tags) — sold in the Shop beside NIP-99 listings. */
export const PRODUCT_KIND = 30018;
export const AUCTION_KIND = 30020;

export function parseListing(ev: EventLike): Listing | null {
  if (ev.kind === PRODUCT_KIND) return parseProduct(ev);
  if (ev.kind === AUCTION_KIND) return parseAuction(ev);
  if (ev.kind !== LISTING_KIND) return null;
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const title = tag("title");
  const priceTag = ev.tags.find((t) => t[0] === "price");
  const amount = amountOf(priceTag?.[1]);
  const currency = priceTag?.[2]?.trim().toUpperCase();
  const frequency = frequencyOf(priceTag?.[3]);
  if (!title) return null;
  const price: ListingPrice | null =
    amount !== null && currency ? { amount, currency, ...(frequency ? { frequency } : {}) } : null;
  const images = ev.tags.filter((t) => t[0] === "image" && isHttp(t[1])).map((t) => t[1]);
  const shopUrl = ev.tags.find((t) => (t[0] === "r" || t[0] === "web") && isHttp(t[1]))?.[1] ?? null;
  const typeTag = ev.tags.find((t) => t[0] === "type");
  const typed = (typeTag?.[1] ?? "").trim().toLowerCase();
  const productType = PRODUCT_TYPES.has(typed) ? (typed as ProductType) : null;
  const formatted = (typeTag?.[2] ?? "").trim().toLowerCase();
  const visibility = (tag("visibility") || "").toLowerCase();
  const stock = numberOf(tag("stock"));
  const shipping = shippingOf(ev.tags);
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    // As written: the address other events name it by keeps any spaces.
    d: ev.tags.find((t) => t[0] === "d")?.[1] ?? "",
    title,
    summary: tag("summary") ?? null,
    description: (ev.content || "").trim(),
    price,
    images,
    location: tag("location") ?? null,
    status: (tag("status") || "active").toLowerCase(),
    hidden: visibility === "hidden",
    preOrder: visibility === "pre-order",
    stock: stock !== null && Number.isInteger(stock) && stock >= 0 ? stock : null,
    format: formatted === "digital" || formatted === "physical" ? formatted : null,
    productType,
    // Only a variation has a parent: any product may reference others, and a
    // collection reference (30405) is not a product at all.
    parent:
      productType === "variation"
        ? (ev.tags.find((t) => t[0] === "a" && t[1]?.startsWith(`${LISTING_KIND}:`))?.[1] ?? null)
        : null,
    specs: ev.tags
      .filter((t) => t[0] === "spec" && t[1]?.trim() && t[2]?.trim())
      .map((t) => ({ key: t[1].trim(), value: t[2].trim() })),
    categories: categoriesOf(ev),
    shopUrl,
    shipping: shipping.inline,
    shippingRefs: shipping.refs,
    createdAt: ev.created_at,
  };
}

/**
 * A NIP-15 product: everything a buyer reads is JSON in content — name,
 * description, images, price and currency, stock, shipping costs by zone.
 * Stock of zero is sold out. The stall's own shipping zones are not fetched,
 * so a product's `shipping` costs are shown as the extra they are.
 */
function parseProduct(ev: EventLike): Listing | null {
  let json: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(ev.content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    json = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const title = text(json.name);
  if (!title) return null;
  const amount = numberOf(json.price);
  const currency = text(json.currency)?.toUpperCase();
  const quantity = numberOf(json.quantity);
  const images = Array.isArray(json.images)
    ? json.images.filter((u): u is string => typeof u === "string" && isHttp(u))
    : [];
  const shipping = Array.isArray(json.shipping)
    ? json.shipping.flatMap((z) => {
        const zone = z as Record<string, unknown>;
        const cost = amountOf(zone?.cost);
        const name = text(zone?.name) ?? text(zone?.id) ?? "";
        return name && cost !== null ? [{ name, amount: cost, currency: currency ?? "" }] : [];
      })
    : [];
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    d: ev.tags.find((t) => t[0] === "d")?.[1] ?? "",
    title,
    summary: null,
    description: text(json.description) ?? "",
    price: amount !== null && amount >= 0 && currency ? { amount, currency } : null,
    images,
    location: null,
    status: quantity !== null && quantity <= 0 ? "sold" : "active",
    hidden: false,
    preOrder: false,
    stock: quantity !== null && Number.isInteger(quantity) && quantity >= 0 ? quantity : null,
    format: null,
    productType: null,
    parent: null,
    specs: [],
    categories: categoriesOf(ev),
    shopUrl: null,
    shipping,
    shippingRefs: [],
    createdAt: ev.created_at,
  };
}

/**
 * A NIP-15 auction, in the tag form bitpopart and hash21 publish: title,
 * summary, image, a starting price, and an end time. The price shown is the
 * opening bid; once the end time passes it is no longer for sale.
 */
function parseAuction(ev: EventLike): Listing | null {
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const title = tag("title") ?? tag("name");
  if (!title) return null;
  const amount = amountOf(tag("start_price") ?? tag("starting_bid"));
  const currency = tag("currency")?.toUpperCase();
  const endsAt = Number(numberOf(tag("end_time")));
  const ended = Number.isFinite(endsAt) && endsAt > 0 && endsAt * 1000 < Date.now();
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    d: tag("d") ?? "",
    title,
    summary: tag("summary") ?? null,
    description: (ev.content || "").trim(),
    price: amount !== null && currency ? { amount, currency } : null,
    images: ev.tags.filter((t) => t[0] === "image" && isHttp(t[1])).map((t) => t[1]),
    location: tag("location") ?? null,
    status: ended ? "ended" : "active",
    hidden: false,
    preOrder: false,
    stock: null,
    format: null,
    productType: null,
    parent: null,
    specs: [],
    categories: categoriesOf(ev),
    shopUrl: null,
    shipping: [],
    shippingRefs: [],
    createdAt: ev.created_at,
  };
}

/**
 * A listing's categories as a reader wants them: each once (a seller tags
 * "hoodie", "hoodies" and "Hoodie" to be found, not to be read three times)
 * and never the seller's own name, which the page already says. The first
 * spelling of each is kept, in the seller's order.
 */
export function categoriesToShow(categories: readonly string[], sellerName?: string | null): string[] {
  const keyOf = (c: string) => c.trim().toLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
  const seller = sellerName ? keyOf(sellerName) : null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of categories) {
    const key = keyOf(c);
    if (!key || key === seller || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** The statuses that stop a sale; any other a seller writes ("available", "pending") still sells. */
const GONE_STATUSES = new Set(["sold", "deleted", "inactive", "ended"]);

/** None left: a stock of zero, except on a parent, whose options carry their own. */
const soldOut = (l: Listing) => l.stock === 0 && l.productType !== "variable";

/**
 * For sale: priced, not sold out, and any status the seller left open.
 * `hidden` does not decide it: Open Markets' `visibility: hidden` takes a
 * product out of the catalog, not off sale — Conduit sells its event-only
 * products through the event's collection, every one of them hidden.
 */
export function isSellable(l: Listing): boolean {
  return !!l.price && !GONE_STATUSES.has(l.status) && !soldOut(l);
}

/**
 * For sale AND listed: what a catalog shows — the Shop, search, a seller's
 * shelf, related listings. A hidden product is reached by its own link or a
 * collection that names it, never by browsing.
 */
export function isListed(l: Listing): boolean {
  return isSellable(l) && !l.hidden;
}

/**
 * The word a listing's status chip says, or null when there is nothing to
 * say — a listed product on sale. `gone` is a listing no longer for sale
 * (sold, sold out, ended, inactive); "Unlisted" and "Pre-order" are still for
 * sale. A status that does not stop a sale is not news, and a priceless
 * listing is "Price on request" elsewhere, not a status.
 */
export function listingStatus(l: Listing): { label: string; gone: boolean } | null {
  if (GONE_STATUSES.has(l.status)) return { label: l.status.charAt(0).toUpperCase() + l.status.slice(1), gone: true };
  if (soldOut(l)) return { label: "Sold out", gone: true };
  if (l.hidden) return { label: "Unlisted", gone: false };
  if (l.preOrder) return { label: "Pre-order", gone: false };
  return null;
}

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", BRL: "R$", CHF: "CHF " };

// Built once: a formatter costs ~20 µs to construct, and every card, buy bar
// and shipping row formats a price on each render.
const COUNT = new Intl.NumberFormat("en-US");
const BITCOIN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DECIMALS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
// Below one unit, two decimals round a real price to "0": 0.002 ETH stays 0.002.
const SMALL = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 });

/** "23,550 sats", "$12", "€15", "CHF 14.50", "0.0021 BTC", "8 USDC" — as priced. */
export function formatListingPrice(p: ListingPrice): string {
  // Zero is not a price to print — "$0" reads as a mistake — it is a gift.
  if (p.amount === 0) return "Free";
  const c = p.currency.toUpperCase();
  let text: string;
  if (c === "SAT" || c === "SATS") text = `${COUNT.format(p.amount)} ${p.amount === 1 ? "sat" : "sats"}`;
  else if (c === "BTC") text = `${BITCOIN.format(p.amount)} BTC`;
  else if (SYMBOL[c]) text = `${SYMBOL[c]}${(Number.isInteger(p.amount) ? COUNT : CENTS).format(p.amount)}`;
  else text = `${(Math.abs(p.amount) < 1 ? SMALL : DECIMALS).format(p.amount)} ${c}`;
  return (p.frequency ? `${text} / ${p.frequency}` : text).trim();
}

/**
 * The one quiet line under a card's title: where it is, what shipping
 * costs — "Gubbio (PG) · 500 sats shipping", "United States · Free
 * shipping", "Shipping from 500 sats". Shipping priced in no money of its
 * own borrows the listing's. Neither known: the seller's summary, or nothing.
 *
 * Only shipping the listing prices itself counts: an Open Markets reference
 * (`shippingRefs`) costs what the option it names costs, which a card does not
 * look up — its extra cost alone is not the shipping price.
 */
export function listingCardLine(l: Listing): string | null {
  const money = (amount: number, currency: string) =>
    formatListingPrice({ amount, currency: currency || l.price?.currency || "" });
  let shipping: string | null = null;
  if (l.shipping.some((s) => s.amount === 0)) shipping = "Free shipping";
  else if (l.shipping.length === 1) shipping = `${money(l.shipping[0].amount, l.shipping[0].currency)} shipping`;
  else if (l.shipping.length > 1) {
    // "From" only compares like with like: 20 USD is not cheaper than 1,000 sats.
    const currencies = new Set(l.shipping.map((s) => s.currency || l.price?.currency || ""));
    if (currencies.size === 1) {
      const cheapest = l.shipping.reduce((a, b) => (b.amount < a.amount ? b : a));
      shipping = `Shipping from ${money(cheapest.amount, cheapest.currency)}`;
    } else shipping = `${l.shipping.length} shipping options`;
  }
  const parts = [l.location, shipping].filter((p): p is string => !!p);
  if (parts.length) return parts.join(" · ");
  return l.summary;
}
