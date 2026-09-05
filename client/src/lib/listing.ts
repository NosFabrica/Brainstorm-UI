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
export const APP_TAGS = new Set(["shopstr", "bitpopart", "barattolo", "conduit", "plebeian", "plebeian market", "nostrmarket", "nostr market", "2140"]);

const isHttp = (s: string | undefined): s is string => !!s && /^https?:\/\//i.test(s);

export function parseListing(ev: EventLike): Listing | null {
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
    categories: [...new Set(ev.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1].trim().toLowerCase()))].filter((c) => c && !APP_TAGS.has(c)),
    shopUrl,
    shipping: ev.tags
      .filter((t) => t[0] === "shipping_option" || t[0] === "shipping")
      .map((t) => ({ name: t[1] ?? "", amount: Number(t[2]), currency: (t[3] ?? "").toUpperCase() }))
      .filter((s) => s.name && Number.isFinite(s.amount)),
    createdAt: ev.created_at,
  };
}

/** For sale now: not sold, not hidden, and any status the seller left open. */
export function isSellable(l: Listing): boolean {
  return !!l.price && !l.hidden && l.status !== "sold" && l.status !== "deleted" && l.status !== "inactive";
}

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", BRL: "R$", CHF: "CHF " };

/** "23,550 sats", "$12", "€15", "CHF 14.50", "0.0021 BTC", "8 USDC" — as priced. */
export function formatListingPrice(p: ListingPrice): string {
  // Zero is not a price to print — "$0" reads as a mistake — it is a gift.
  if (p.amount === 0) return "Free";
  const c = p.currency.toUpperCase();
  let text: string;
  if (c === "SAT" || c === "SATS") text = `${new Intl.NumberFormat("en-US").format(p.amount)} ${p.amount === 1 ? "sat" : "sats"}`;
  else if (c === "BTC") text = `${p.amount} BTC`;
  else if (SYMBOL[c]) {
    const whole = Number.isInteger(p.amount);
    text = `${SYMBOL[c]}${new Intl.NumberFormat("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(p.amount)}`;
  } else text = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(p.amount)} ${c}`;
  return (p.frequency ? `${text} / ${p.frequency}` : text).trim();
}

/**
 * Markdown as words. Marketplace apps write descriptions in markdown; we
 * render text with live links, so headings lose their hashes, emphasis its
 * marks, bullets become bullets. Not a renderer — just no punctuation noise.
 */
export function plainMarkdown(md: string): string {
  return md
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
