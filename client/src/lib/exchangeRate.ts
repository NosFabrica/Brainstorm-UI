import type { ListingPrice } from "@/lib/listing";

/**
 * One Bitcoin price, so a Shop page priced in sats, dollars, euros and
 * francs can be compared — and each card can say what it costs in the
 * buyer's own money, under the price the seller wrote. The seller's price
 * stays the price; the second line is an approximation, marked as one.
 *
 * Rates come from mempool.space's public prices endpoint (no key), asked
 * once and kept for ten minutes; an outage is simply no second line. The
 * buyer's money is read from their browser's region — the least surprising
 * default until a setting asks.
 */
export type Fiat = "USD" | "EUR" | "GBP" | "CAD" | "CHF" | "AUD" | "JPY";
export type BtcRates = Partial<Record<Fiat, number>>;

const FIATS: readonly Fiat[] = ["USD", "EUR", "GBP", "CAD", "CHF", "AUD", "JPY"];
const isFiat = (c: string): c is Fiat => (FIATS as readonly string[]).includes(c);

const EURO_AREA = new Set(["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]);
const BY_REGION: Record<string, Fiat> = { US: "USD", GB: "GBP", CA: "CAD", CH: "CHF", AU: "AUD", JP: "JPY" };

/** The buyer's money, from a BCP-47 locale's region; dollars when there is none we price in. */
export function viewerCurrency(locale: string = typeof navigator !== "undefined" ? navigator.language : "en-US"): Fiat {
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale).maximize().region;
  } catch {
    region = undefined;
  }
  // `maximize()` guesses a region for a bare language ("de" → DE); the
  // buyer said nothing about where they are, so a bare language is dollars.
  if (!/-[A-Za-z]{2}(-|$)/.test(locale) && !/-\d{3}(-|$)/.test(locale)) return "USD";
  if (!region) return "USD";
  if (BY_REGION[region]) return BY_REGION[region];
  if (EURO_AREA.has(region)) return "EUR";
  return "USD";
}

const SATS_PER_BTC = 100_000_000;
/** Dollar stablecoins count as dollars here. */
const AS_USD = new Set(["USD", "USDC", "USDT"]);

const fiatOf = (currency: string): Fiat | null => {
  const c = currency.toUpperCase();
  if (AS_USD.has(c)) return "USD";
  return isFiat(c) ? c : null;
};

/** Any price in sats — fiat through the rate, or null when we have none for it. */
export function toSats(price: Pick<ListingPrice, "amount" | "currency">, rates: BtcRates | null): number | null {
  const c = price.currency.toUpperCase();
  if (c === "SATS" || c === "SAT") return price.amount;
  if (c === "BTC") return Math.round(price.amount * SATS_PER_BTC);
  const fiat = fiatOf(c);
  const rate = fiat ? rates?.[fiat] : undefined;
  if (!fiat || !rate) return null;
  return Math.round((price.amount / rate) * SATS_PER_BTC);
}

/** Any price in the viewer's money, or null when we cannot get there. */
export function priceInCurrency(price: Pick<ListingPrice, "amount" | "currency">, rates: BtcRates | null, target: Fiat): number | null {
  const rate = rates?.[target];
  if (!rate) return null;
  const sats = toSats(price, rates);
  if (sats === null) return null;
  return (sats / SATS_PER_BTC) * rate;
}

const formatFiat = (amount: number, fiat: Fiat): string => {
  // Whole money reads whole ("€189"); cents show only when there are some.
  const digits = fiat === "JPY" || Number.isInteger(Math.round(amount * 100) / 100) ? 0 : 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: fiat, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
};
/** A few sats round to "$0", which reads as free. Under the smallest coin, say so. */
const formatFiatApprox = (amount: number, fiat: Fiat): string => {
  const smallest = fiat === "JPY" ? 1 : 0.01;
  if (amount > 0 && amount < smallest) return `under ${formatFiat(smallest, fiat)}`;
  return formatFiat(amount, fiat);
};
const formatSats = (sats: number): string => `${new Intl.NumberFormat("en-US").format(Math.round(sats))} sats`;

/**
 * "≈ $23.55" under a sats price; "≈ 12,000 sats" under a price already in
 * the viewer's money; "≈ €10.80" under a price in someone else's. Null
 * when there is nothing honest to add: no rate, a gift, money we can't read.
 */
export function secondPriceLine(price: ListingPrice, rates: BtcRates | null, target: Fiat): string | null {
  if (!rates || price.amount === 0) return null;
  const native = fiatOf(price.currency);
  let text: string;
  if (native === target) {
    const sats = toSats(price, rates);
    if (sats === null) return null;
    text = formatSats(sats);
  } else {
    const amount = priceInCurrency(price, rates, target);
    if (amount === null) return null;
    text = formatFiatApprox(amount, target);
  }
  return `≈ ${text}${price.frequency ? ` / ${price.frequency}` : ""}`;
}

export interface PriceBand {
  key: "under" | "mid" | "up";
  label: string;
  holds: (amountInTarget: number) => boolean;
}

/** Under 25, 25 to 100, 100 and up — a hundred times that in yen. */
export function priceBands(target: Fiat): PriceBand[] {
  const scale = target === "JPY" ? 100 : 1;
  const low = 25 * scale;
  const high = 100 * scale;
  const money = (n: number) => formatFiat(n, target);
  return [
    { key: "under", label: `Under ${money(low)}`, holds: (a) => a < low },
    { key: "mid", label: `${money(low)} – ${money(high)}`, holds: (a) => a >= low && a < high },
    { key: "up", label: `${money(high)} and up`, holds: (a) => a >= high },
  ];
}

const PRICES_URL = "https://mempool.space/api/v1/prices";
const TTL_MS = 10 * 60 * 1000;
let remembered: { at: number; promise: Promise<BtcRates | null> } | null = null;

/** Test seam: forget the remembered rate. */
export function __resetBtcRates(): void {
  remembered = null;
}

/** One BTC in each fiat we price in; null on any failure, and the next caller asks again. */
export function fetchBtcRates(): Promise<BtcRates | null> {
  const now = Date.now();
  if (remembered && now - remembered.at < TTL_MS) return remembered.promise;
  const promise = fetch(PRICES_URL, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((body: unknown) => {
      if (!body || typeof body !== "object") return null;
      const out: BtcRates = {};
      for (const f of FIATS) {
        const v = (body as Record<string, unknown>)[f];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) out[f] = v;
      }
      return Object.keys(out).length ? out : null;
    })
    .catch(() => null)
    .then((rates) => {
      if (rates === null && remembered?.promise === promise) remembered = null;
      return rates;
    });
  remembered = { at: now, promise };
  return promise;
}
