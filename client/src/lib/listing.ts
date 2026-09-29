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
  categories: string[];
  /** The seller's own page for this listing, when the app published one. */
  shopUrl: string | null;
  shipping: { name: string; amount: number; currency: string }[];
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
  const amount = Number(priceTag?.[1]);
  const currency = priceTag?.[2]?.trim().toUpperCase();
  if (!title) return null;
  const price: ListingPrice | null =
    priceTag && Number.isFinite(amount) && amount >= 0 && currency
      ? { amount, currency, ...(priceTag[3] ? { frequency: priceTag[3] } : {}) }
      : null;
  const images = ev.tags.filter((t) => t[0] === "image" && isHttp(t[1])).map((t) => t[1]);
  const shopUrl = ev.tags.find((t) => (t[0] === "r" || t[0] === "web") && isHttp(t[1]))?.[1] ?? null;
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    d: tag("d") ?? "",
    title,
    summary: tag("summary") ?? null,
    description: (ev.content || "").trim(),
    price,
    images,
    location: tag("location") ?? null,
    status: (tag("status") || "active").toLowerCase(),
    hidden: (tag("visibility") || "").toLowerCase() === "hidden",
    categories: categoriesOf(ev),
    shopUrl,
    shipping: ev.tags
      .filter((t) => t[0] === "shipping_option" || t[0] === "shipping")
      .map((t) => ({ name: t[1] ?? "", amount: Number(t[2]), currency: (t[3] ?? "").toUpperCase() }))
      .filter((s) => s.name && Number.isFinite(s.amount)),
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
  const amount = Number(json.price);
  const currency = text(json.currency)?.toUpperCase();
  const quantity = json.quantity === null || json.quantity === undefined ? null : Number(json.quantity);
  const images = Array.isArray(json.images)
    ? json.images.filter((u): u is string => typeof u === "string" && isHttp(u))
    : [];
  const shipping = Array.isArray(json.shipping)
    ? json.shipping.flatMap((z) => {
        const zone = z as Record<string, unknown>;
        const cost = Number(zone?.cost);
        const name = text(zone?.name) ?? text(zone?.id) ?? "";
        return name && Number.isFinite(cost) ? [{ name, amount: cost, currency: currency ?? "" }] : [];
      })
    : [];
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    d: ev.tags.find((t) => t[0] === "d")?.[1] ?? "",
    title,
    summary: null,
    description: text(json.description) ?? "",
    price: Number.isFinite(amount) && amount >= 0 && currency ? { amount, currency } : null,
    images,
    location: null,
    status: quantity !== null && Number.isFinite(quantity) && quantity <= 0 ? "sold" : "active",
    hidden: false,
    categories: categoriesOf(ev),
    shopUrl: null,
    shipping,
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
  const amount = Number(tag("start_price") ?? tag("starting_bid"));
  const currency = tag("currency")?.toUpperCase();
  const endsAt = Number(tag("end_time"));
  const ended = Number.isFinite(endsAt) && endsAt > 0 && endsAt * 1000 < Date.now();
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    d: tag("d") ?? "",
    title,
    summary: tag("summary") ?? null,
    description: (ev.content || "").trim(),
    price: Number.isFinite(amount) && amount >= 0 && currency ? { amount, currency } : null,
    images: ev.tags.filter((t) => t[0] === "image" && isHttp(t[1])).map((t) => t[1]),
    location: tag("location") ?? null,
    status: ended ? "ended" : "active",
    hidden: false,
    categories: categoriesOf(ev),
    shopUrl: null,
    shipping: [],
    createdAt: ev.created_at,
  };
}

/** For sale now: not sold, not hidden, and any status the seller left open. */
export function isSellable(l: Listing): boolean {
  return (
    !!l.price &&
    !l.hidden &&
    l.status !== "sold" &&
    l.status !== "deleted" &&
    l.status !== "inactive" &&
    l.status !== "ended"
  );
}

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", BRL: "R$", CHF: "CHF " };

/** "23,550 sats", "$12", "€15", "CHF 14.50", "0.0021 BTC", "8 USDC" — as priced. */
export function formatListingPrice(p: ListingPrice): string {
  // Zero is not a price to print — "$0" reads as a mistake — it is a gift.
  if (p.amount === 0) return "Free";
  const c = p.currency.toUpperCase();
  let text: string;
  if (c === "SAT" || c === "SATS")
    text = `${new Intl.NumberFormat("en-US").format(p.amount)} ${p.amount === 1 ? "sat" : "sats"}`;
  else if (c === "BTC") text = `${p.amount} BTC`;
  else if (SYMBOL[c]) {
    const whole = Number.isInteger(p.amount);
    text = `${SYMBOL[c]}${new Intl.NumberFormat("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(p.amount)}`;
  } else text = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(p.amount)} ${c}`;
  return (p.frequency ? `${text} / ${p.frequency}` : text).trim();
}

/**
 * The one quiet line under a card's title: where it is, what shipping
 * costs — "Gubbio (PG) · 500 sats shipping", "United States · Free
 * shipping", "Shipping from 500 sats". Shipping priced in no money of its
 * own borrows the listing's. Neither known: the seller's summary, or nothing.
 */
export function listingCardLine(l: Listing): string | null {
  const money = (amount: number, currency: string) =>
    formatListingPrice({ amount, currency: currency || l.price?.currency || "" });
  let shipping: string | null = null;
  if (l.shipping.some((s) => s.amount === 0)) shipping = "Free shipping";
  else if (l.shipping.length === 1) shipping = `${money(l.shipping[0].amount, l.shipping[0].currency)} shipping`;
  else if (l.shipping.length > 1) {
    const cheapest = l.shipping.reduce((a, b) => (b.amount < a.amount ? b : a));
    shipping = `Shipping from ${money(cheapest.amount, cheapest.currency)}`;
  }
  const parts = [l.location, shipping].filter((p): p is string => !!p);
  if (parts.length) return parts.join(" · ");
  return l.summary;
}
