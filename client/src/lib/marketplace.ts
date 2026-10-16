/**
 * The Open Markets kinds around a listing (kind 30402, lib/listing): a
 * product collection (30405), a shipping option (30406) and a product review
 * (31555), read for a buyer. Spec: Open Markets §3 and §5.
 *
 * Two of these numbers are shared. Shopstr keeps a buyer's cart on 30405 (a
 * `d` and encrypted content, no title) and escrow records on 30406 (no title,
 * service or country). Neither is a collection or a shipping option, so each
 * reader here wants what makes one: a title, and for a shipping option
 * something that prices or places it. Anything else is null and is drawn as
 * the plain event it is.
 *
 * Probed 2026-10-16 on the production relay: the shipping options published so
 * far carry a title, a price and a service — "digital" among them, which the
 * spec does not list — and no `country`, so `country` is not required here.
 */
import { formatListingPrice, shippingOf, type ListingPrice, type ShippingRef } from "@/lib/listing";

type EventLike = { kind: number; pubkey?: string; tags: string[][]; content: string };

export const COLLECTION_KIND = 30405;
export const SHIPPING_OPTION_KIND = 30406;
export const PRODUCT_REVIEW_KIND = 31555;

const tagOf = (ev: EventLike, k: string): string | undefined =>
  ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
const isHttp = (s: string | undefined | null): s is string => !!s && /^https?:\/\//i.test(s);
const PRODUCT_ADDRESS = /^30402:[0-9a-f]{64}:/i;

// ——— Shipping options (30406) ———

export interface ShippingOption {
  title: string;
  /** The option's own base cost, as priced. Null when it names none. */
  price: ListingPrice | null;
  /** "standard", "express", "overnight", "pickup" — or what the publisher wrote. */
  service: string | null;
  carrier: string | null;
  /** ISO 3166-1 alpha-2 codes, upper-cased. */
  countries: string[];
  /** ISO 3166-2 codes. */
  regions: string[];
  duration: { min: number; max: number; unit: "H" | "D" | "W" } | null;
  location: string | null;
  description: string | null;
  /** Package limits and per-unit prices, already in words: ["Max weight", "30 kg"]. */
  limits: [string, string][];
}

const LIMITS: [string, string][] = [
  ["weight-min", "Min weight"],
  ["weight-max", "Max weight"],
  ["dim-min", "Min size"],
  ["dim-max", "Max size"],
];
const PER_UNIT: [string, string][] = [
  ["price-weight", "Per weight"],
  ["price-volume", "Per volume"],
  ["price-distance", "Per distance"],
];

function priceOf(t: string[] | undefined): ListingPrice | null {
  const amount = Number(t?.[1]);
  const currency = t?.[2]?.trim().toUpperCase();
  return t?.[1]?.trim() && Number.isFinite(amount) && amount >= 0 && currency ? { amount, currency } : null;
}

/** A kind-30406 shipping option, or null for anything else on the number (Shopstr's escrow records). */
export function parseShippingOption(ev: EventLike): ShippingOption | null {
  if (ev.kind !== SHIPPING_OPTION_KIND) return null;
  const title = tagOf(ev, "title");
  const price = priceOf(ev.tags.find((t) => t[0] === "price"));
  const service = tagOf(ev, "service")?.toLowerCase() ?? null;
  const countries = [
    ...new Set(
      ev.tags
        .filter((t) => t[0] === "country")
        .flatMap((t) => t.slice(1))
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (!title || (!price && !service && countries.length === 0)) return null;
  const durationTag = ev.tags.find((t) => t[0] === "duration");
  const min = Number(durationTag?.[1]);
  const max = Number(durationTag?.[2]);
  const unit = durationTag?.[3]?.trim().toUpperCase();
  const duration =
    durationTag &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= 0 &&
    max >= min &&
    (unit === "H" || unit === "D" || unit === "W")
      ? { min, max, unit: unit as "H" | "D" | "W" }
      : null;
  const limits: [string, string][] = [];
  for (const [k, label] of LIMITS) {
    const t = ev.tags.find((x) => x[0] === k);
    if (t?.[1]?.trim()) limits.push([label, [t[1].trim(), t[2]?.trim()].filter(Boolean).join(" ")]);
  }
  for (const [k, label] of PER_UNIT) {
    const t = ev.tags.find((x) => x[0] === k);
    const amount = Number(t?.[1]);
    if (!t?.[1]?.trim() || !Number.isFinite(amount)) continue;
    // ["price-weight", "0.75", "USD", "kg"] in the spec's example; ["price-weight", "0.75", "kg"] in its table.
    const currency = t.length > 3 ? t[2]?.trim().toUpperCase() : (price?.currency ?? "");
    const per = (t.length > 3 ? t[3] : t[2])?.trim();
    limits.push([label, `${formatListingPrice({ amount, currency: currency ?? "" })}${per ? ` / ${per}` : ""}`]);
  }
  return {
    title,
    price,
    service,
    carrier: tagOf(ev, "carrier") ?? null,
    countries,
    regions: [
      ...new Set(
        ev.tags
          .filter((t) => t[0] === "region")
          .flatMap((t) => t.slice(1))
          .map((c) => c.trim())
          .filter(Boolean),
      ),
    ],
    duration,
    location: tagOf(ev, "location") ?? null,
    description: ev.content.trim() || null,
    limits,
  };
}

const SERVICE_WORDS: Record<string, string> = {
  standard: "Standard",
  express: "Express",
  overnight: "Overnight",
  pickup: "Pickup",
  digital: "Digital delivery",
};

/** "Express", "Pickup", "Digital delivery" — a service as a buyer reads it. */
export function serviceLabel(service: string | null): string | null {
  if (!service) return null;
  return SERVICE_WORDS[service] ?? service.charAt(0).toUpperCase() + service.slice(1);
}

const UNIT_WORDS = { H: ["hour", "hours"], D: ["day", "days"], W: ["week", "weeks"] } as const;

/** "1–3 days", "24 hours". */
export function durationLabel(d: ShippingOption["duration"]): string | null {
  if (!d) return null;
  const [one, many] = UNIT_WORDS[d.unit];
  if (d.min === d.max) return `${d.min} ${d.min === 1 ? one : many}`;
  return `${d.min}–${d.max} ${many}`;
}

/** "US, CA, MX +2" — where an option ships, briefly. */
export function countriesLabel(countries: string[], max = 4): string | null {
  if (countries.length === 0) return null;
  return `${countries.slice(0, max).join(", ")}${countries.length > max ? ` +${countries.length - max}` : ""}`;
}

/**
 * What a buyer pays for one option on one product: the option's own price plus
 * the product's extra cost. The extra is in the product's currency; when the
 * option is priced in another, the two are shown side by side rather than
 * added. "Free" when both come to nothing.
 */
export function shippingCostLabel(
  price: ListingPrice | null,
  extra: number | null,
  productCurrency: string | null | undefined,
): string | null {
  const extraPrice = extra && extra > 0 ? { amount: extra, currency: (productCurrency ?? "").toUpperCase() } : null;
  if (!price) return extraPrice ? `+${formatListingPrice(extraPrice)}` : null;
  if (!extraPrice) return formatListingPrice(price);
  if (!extraPrice.currency || extraPrice.currency === price.currency)
    return formatListingPrice({ amount: price.amount + extraPrice.amount, currency: price.currency });
  return `${formatListingPrice(price)} + ${formatListingPrice(extraPrice)}`;
}

/** One way a product ships, as its page lists it. */
export interface ShippingRow {
  key: string;
  title: string;
  /** What it costs this product, in words; null when unknown. */
  cost: string | null;
  service: string | null;
  countries: string | null;
  duration: string | null;
  carrier: string | null;
  /** The collection it came through, when the product took it on from one. */
  via: string | null;
  /** The option's address, when it is a 30406 (its own page); null for a name the listing priced itself. */
  address: string | null;
  /** False while — or because — the referenced option could not be read. */
  resolved: boolean;
}

/** A d-tag worth showing as a name: "voltvault-worldwide-free-shipping", not a UUID, a hash or a timestamp. */
function nameFromD(d: string): string | null {
  const plain = d.trim();
  if (!/[a-z]{3}/i.test(plain) || /^[0-9a-f-]{16,}$/i.test(plain) || /\d{9,}/.test(plain)) return null;
  const words = plain.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
}

/**
 * Every way a product ships, from what the listing says and what its
 * references name: options it prices itself (Shopstr's shape), options it
 * points at (each at its own price plus the product's extra cost), and the
 * options of any collection it points at, the extra applied to each (Open
 * Markets: "the extra cost should be applied to all shipping options from the
 * collection"). Product and collection options are merged, the first mention
 * of an option winning. A reference not (yet) found still says it exists.
 */
export function shippingRows(
  listing: {
    shipping: { name: string; amount: number; currency: string }[];
    shippingRefs: ShippingRef[];
    price: ListingPrice | null;
  },
  resolve: (address: string) => EventLike | undefined,
): ShippingRow[] {
  const currency = listing.price?.currency ?? null;
  const rows: ShippingRow[] = listing.shipping.map((s, i) => ({
    key: `inline:${i}`,
    title: s.name,
    cost: formatListingPrice({ amount: s.amount, currency: s.currency || currency || "" }),
    service: null,
    countries: null,
    duration: null,
    carrier: null,
    via: null,
    address: null,
    resolved: true,
  }));
  const seen = new Set<string>();
  const optionRow = (address: string, extra: number | null, via: string | null): ShippingRow | null => {
    if (seen.has(address)) return null;
    seen.add(address);
    const event = resolve(address);
    const option = event ? parseShippingOption(event) : null;
    if (!option) {
      const d = address.split(":").slice(2).join(":");
      return {
        key: address,
        title: nameFromD(d) ?? "Shipping option",
        cost: shippingCostLabel(null, extra, currency),
        service: null,
        countries: null,
        duration: null,
        carrier: null,
        via,
        address,
        resolved: false,
      };
    }
    return {
      key: address,
      title: option.title,
      cost: shippingCostLabel(option.price, extra, currency),
      service: serviceLabel(option.service),
      countries: countriesLabel(option.countries),
      duration: durationLabel(option.duration),
      carrier: option.carrier,
      via,
      address,
      resolved: true,
    };
  };
  for (const ref of listing.shippingRefs) {
    if (ref.kind === SHIPPING_OPTION_KIND) {
      const row = optionRow(ref.address, ref.extra, null);
      if (row) rows.push(row);
      continue;
    }
    const collection = resolve(ref.address);
    const parsed = collection ? parseCollection(collection) : null;
    if (!parsed) {
      // Not (yet) found: the product still ships somehow — say so, with its extra.
      if (!seen.has(ref.address)) {
        seen.add(ref.address);
        rows.push({
          key: ref.address,
          title: "Collection's shipping options",
          cost: shippingCostLabel(null, ref.extra, currency),
          service: null,
          countries: null,
          duration: null,
          carrier: null,
          via: nameFromD(ref.d),
          address: ref.address,
          resolved: false,
        });
      }
      continue;
    }
    const options = parsed.shippingRefs.filter((r) => r.kind === SHIPPING_OPTION_KIND);
    for (const option of options) {
      const row = optionRow(option.address, ref.extra, parsed.title);
      if (row) rows.push(row);
    }
  }
  return foldUnnamed(rows);
}

/** Options not found and with no name of their own read the same: one "2 shipping options" row, not two alike. */
function foldUnnamed(rows: ShippingRow[]): ShippingRow[] {
  const out: ShippingRow[] = [];
  const counts = new Map<string, { row: ShippingRow; n: number }>();
  for (const row of rows) {
    if (row.resolved || row.title !== "Shipping option") {
      out.push(row);
      continue;
    }
    const key = `${row.cost}|${row.via}`;
    const held = counts.get(key);
    if (held) {
      held.n += 1;
      held.row.title = `${held.n} shipping options`;
      continue;
    }
    const copy = { ...row };
    counts.set(key, { row: copy, n: 1 });
    out.push(copy);
  }
  return out;
}

/** The 30406 addresses a listing's shipping reaches through its collections, once those are in hand. */
export function collectionShippingAddresses(
  refs: ShippingRef[],
  resolve: (address: string) => EventLike | undefined,
): string[] {
  const out = new Set<string>();
  for (const ref of refs) {
    if (ref.kind !== COLLECTION_KIND) continue;
    const collection = resolve(ref.address);
    const parsed = collection ? parseCollection(collection) : null;
    for (const r of parsed?.shippingRefs ?? []) if (r.kind === SHIPPING_OPTION_KIND) out.add(r.address);
  }
  return [...out];
}

// ——— Collections (30405) ———

export interface ProductCollection {
  title: string;
  summary: string | null;
  description: string | null;
  image: string | null;
  /** The products it names, as `30402:<pubkey>:<d>`, in order. */
  products: string[];
  shippingRefs: ShippingRef[];
  location: string | null;
}

/** A kind-30405 product collection, or null for anything else on the number (Shopstr's encrypted carts). */
export function parseCollection(ev: EventLike): ProductCollection | null {
  if (ev.kind !== COLLECTION_KIND) return null;
  const title = tagOf(ev, "title");
  if (!title) return null;
  const image = ev.tags.find((t) => t[0] === "image" && isHttp(t[1]?.trim()))?.[1]?.trim() ?? null;
  return {
    title,
    summary: tagOf(ev, "summary") ?? null,
    description: ev.content.trim() || null,
    image,
    products: [
      ...new Set(
        ev.tags.filter((t) => t[0] === "a" && PRODUCT_ADDRESS.test(t[1]?.trim() ?? "")).map((t) => t[1].trim()),
      ),
    ],
    shippingRefs: shippingOf(ev.tags).refs,
    location: tagOf(ev, "location") ?? null,
  };
}

// ——— Product reviews (31555) ———

export interface ProductReview {
  /** The reviewed product, `30402:<merchant>:<d>`. */
  product: string;
  /** The primary rating, 0 (thumbs down) to 1 (thumbs up). */
  thumb: number;
  /** The optional per-category scores, 0..1, in order. */
  categories: { name: string; score: number }[];
  /** Open Markets' total: thumb × 0.5 + 0.5 × the categories' mean; the thumb alone without any. */
  total: number;
  text: string | null;
}

/** Open Markets §5's rating calculation. */
export function productReviewTotal(thumb: number, categories: number[]): number {
  if (categories.length === 0) return thumb;
  const mean = categories.reduce((a, b) => a + b, 0) / categories.length;
  return thumb * 0.5 + 0.5 * mean;
}

/**
 * The `rating` tags that score one aspect — a third element names it — on the
 * spec's 0..1 scale, in order. A relay review's speed and uptime, a product
 * review's value and delivery. A score outside 0..1 is malformed and dropped.
 */
export function ratingAspects(ev: Pick<EventLike, "tags">, skip: string[] = []): { name: string; score: number }[] {
  const skipped = new Set(skip.map((s) => s.toLowerCase()));
  return ev.tags
    .filter((t) => t[0] === "rating" && t[1]?.trim() && t[2]?.trim() && !skipped.has(t[2].trim().toLowerCase()))
    .map((t) => ({ name: t[2].trim(), score: Number(t[1]) }))
    .filter((a) => Number.isFinite(a.score) && a.score >= 0 && a.score <= 1);
}

/**
 * A kind-31555 review of a product: `d` names it (`a:30402:<merchant>:<d>`),
 * a `thumb` rating is required. Null without either — a review that says
 * neither what nor how is not one we can show.
 */
export function parseProductReview(ev: EventLike): ProductReview | null {
  if (ev.kind !== PRODUCT_REVIEW_KIND) return null;
  const d = tagOf(ev, "d")?.replace(/^a:/i, "") ?? "";
  if (!PRODUCT_ADDRESS.test(d)) return null;
  const thumbTag = ev.tags.find((t) => t[0] === "rating" && t[2]?.trim().toLowerCase() === "thumb");
  const thumb = Number(thumbTag?.[1]);
  if (!thumbTag?.[1]?.trim() || !Number.isFinite(thumb) || thumb < 0 || thumb > 1) return null;
  const categories = ratingAspects(ev, ["thumb"]);
  const [kind, pubkey, ...rest] = d.split(":");
  return {
    product: `${kind}:${pubkey.toLowerCase()}:${rest.join(":")}`,
    thumb,
    categories,
    total: productReviewTotal(
      thumb,
      categories.map((c) => c.score),
    ),
    text: ev.content.trim() || null,
  };
}
