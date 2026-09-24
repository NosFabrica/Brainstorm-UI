import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { viewerCurrency, toSats, secondPriceLine, priceInCurrency, priceBands, fetchBtcRates, __resetBtcRates, type BtcRates } from "./exchangeRate";

// mempool.space's public prices, probed 2026-09-24: one BTC in each fiat.
const rates: BtcRates = { USD: 100_000, EUR: 90_000, GBP: 80_000, CAD: 140_000, CHF: 85_000, AUD: 150_000, JPY: 15_000_000 };

describe("viewerCurrency — the buyer's own money, from their browser", () => {
  it("reads the region: US, GB, the euro area, else dollars", () => {
    expect(viewerCurrency("en-US")).toBe("USD");
    expect(viewerCurrency("en-GB")).toBe("GBP");
    expect(viewerCurrency("de-DE")).toBe("EUR");
    expect(viewerCurrency("it-IT")).toBe("EUR");
    expect(viewerCurrency("fr-CA")).toBe("CAD");
    expect(viewerCurrency("de-CH")).toBe("CHF");
    expect(viewerCurrency("en-AU")).toBe("AUD");
    expect(viewerCurrency("ja-JP")).toBe("JPY");
    expect(viewerCurrency("pt-BR")).toBe("USD");
    expect(viewerCurrency("en")).toBe("USD");
    expect(viewerCurrency("")).toBe("USD");
  });
});

describe("toSats — every price on one scale", () => {
  it("sats and BTC need no rate; fiat needs its own", () => {
    expect(toSats({ amount: 23550, currency: "SATS" }, null)).toBe(23550);
    expect(toSats({ amount: 1, currency: "SAT" }, null)).toBe(1);
    expect(toSats({ amount: 0.0021, currency: "BTC" }, null)).toBe(210_000);
    expect(toSats({ amount: 12, currency: "USD" }, rates)).toBe(12_000);
    expect(toSats({ amount: 9, currency: "EUR" }, rates)).toBe(10_000);
    expect(toSats({ amount: 12, currency: "USD" }, null)).toBeNull();
    // Dollar stablecoins are dollars for this purpose.
    expect(toSats({ amount: 8, currency: "USDC" }, rates)).toBe(8_000);
    expect(toSats({ amount: 50, currency: "BRL" }, rates)).toBeNull();
  });

  it("priceInCurrency turns any price into the viewer's fiat", () => {
    expect(priceInCurrency({ amount: 23550, currency: "SATS" }, rates, "USD")).toBeCloseTo(23.55, 2);
    expect(priceInCurrency({ amount: 12, currency: "USD" }, rates, "EUR")).toBeCloseTo(10.8, 2);
    expect(priceInCurrency({ amount: 50, currency: "BRL" }, rates, "USD")).toBeNull();
  });
});

describe("secondPriceLine — the native price with the other one underneath", () => {
  it("a sats price shows the viewer's money; a fiat price in their money shows sats", () => {
    expect(secondPriceLine({ amount: 23550, currency: "SATS" }, rates, "USD")).toBe("≈ $23.55");
    expect(secondPriceLine({ amount: 210_000, currency: "SATS" }, rates, "EUR")).toBe("≈ €189");
    expect(secondPriceLine({ amount: 12, currency: "USD" }, rates, "USD")).toBe("≈ 12,000 sats");
    expect(secondPriceLine({ amount: 0.0021, currency: "BTC" }, rates, "GBP")).toBe("≈ £168");
  });

  it("a fiat price in another money shows the viewer's money", () => {
    expect(secondPriceLine({ amount: 12, currency: "USD" }, rates, "EUR")).toBe("≈ €10.80");
    expect(secondPriceLine({ amount: 9, currency: "EUR" }, rates, "JPY")).toBe("≈ ¥1,500");
  });

  it("nothing to say without a rate, for a gift, or for money we cannot convert", () => {
    expect(secondPriceLine({ amount: 12, currency: "USD" }, null, "USD")).toBeNull();
    expect(secondPriceLine({ amount: 23550, currency: "SATS" }, null, "USD")).toBeNull();
    expect(secondPriceLine({ amount: 0, currency: "SATS" }, rates, "USD")).toBeNull();
    expect(secondPriceLine({ amount: 50, currency: "BRL" }, rates, "USD")).toBeNull();
  });

  it("a recurring price keeps its rhythm", () => {
    expect(secondPriceLine({ amount: 12, currency: "USD", frequency: "month" }, rates, "USD")).toBe("≈ 12,000 sats / month");
  });
});

describe("priceBands — under, between, and up, in the viewer's money", () => {
  it("dollars split at 25 and 100; yen at 2,500 and 10,000", () => {
    expect(priceBands("USD").map((b) => b.label)).toEqual(["Under $25", "$25 – $100", "$100 and up"]);
    expect(priceBands("EUR").map((b) => b.label)).toEqual(["Under €25", "€25 – €100", "€100 and up"]);
    expect(priceBands("JPY").map((b) => b.label)).toEqual(["Under ¥2,500", "¥2,500 – ¥10,000", "¥10,000 and up"]);
    const [under, mid, up] = priceBands("USD");
    expect(under.holds(24.99)).toBe(true);
    expect(under.holds(25)).toBe(false);
    expect(mid.holds(25)).toBe(true);
    expect(mid.holds(99.99)).toBe(true);
    expect(up.holds(100)).toBe(true);
  });
});

describe("fetchBtcRates — one ask, remembered for ten minutes", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    __resetBtcRates();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads mempool.space's prices, once for every caller", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ time: 1, USD: 84395, EUR: 74192, GBP: 63852, CAD: 119237, CHF: 69828, AUD: 120296, JPY: 13411137 }) });
    const [a, b] = await Promise.all([fetchBtcRates(), fetchBtcRates()]);
    expect(a).toEqual({ USD: 84395, EUR: 74192, GBP: 63852, CAD: 119237, CHF: 69828, AUD: 120296, JPY: 13411137 });
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://mempool.space/api/v1/prices");
  });

  it("an outage is no rate — and the next caller asks again", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchBtcRates()).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ USD: 1 }) });
    expect(await fetchBtcRates()).toEqual({ USD: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a body without numbers is no rate", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ USD: "n/a" }) });
    expect(await fetchBtcRates()).toBeNull();
  });
});
