import { describe, expect, it } from "vitest";
import { resolveCheckout } from "./checkout";
import type { BillingPlan } from "@/services/subscription";

const PLAN: BillingPlan = {
  policyId: 2,
  policyName: "Priority",
  amountMinor: 200,
  currency: "USD",
  scheduleIntervalSeconds: 7 * 86_400,
  isDefault: false,
  billingPeriodUnit: "month",
  billingPeriodCount: 1,
  checkoutUrl: "https://vault.example/subscriptions/signup/svc/plan?redirect_uri=https%3A%2F%2Fapp%2Fbilling%2Freturn",
  blurb: null,
  includes: null,
  excludes: null,
};
const PUBKEY = "a".repeat(64);

describe("resolveCheckout", () => {
  it("appends ref — the entire identity design — to the server-built URL", () => {
    const t = resolveCheckout(PLAN, PUBKEY);
    expect(t.external).toBe(true);
    expect(t.url).toBe(`${PLAN.checkoutUrl}&ref=${PUBKEY}`);
  });

  it("uses ? when the server URL carries no query yet", () => {
    const t = resolveCheckout({ ...PLAN, checkoutUrl: "https://vault.example/signup/svc/plan" }, PUBKEY);
    expect(t.url).toBe(`https://vault.example/signup/svc/plan?ref=${PUBKEY}`);
  });

  it("refuses to open without a pubkey — an unbindable payment is worse than none", () => {
    expect(resolveCheckout(PLAN, null)).toEqual({ external: false, url: "" });
    expect(resolveCheckout(PLAN, undefined)).toEqual({ external: false, url: "" });
  });

  it("refuses when the instance has no billing (no plan / no checkout_url)", () => {
    expect(resolveCheckout(undefined, PUBKEY).external).toBe(false);
    expect(resolveCheckout({ ...PLAN, checkoutUrl: null }, PUBKEY).external).toBe(false);
  });

  it("url-encodes the ref", () => {
    const t = resolveCheckout(PLAN, "npub with spaces");
    expect(t.url.endsWith("ref=npub%20with%20spaces")).toBe(true);
  });
});
