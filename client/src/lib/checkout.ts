// Where "Get Priority" goes.
//
// ## The current Flash surface (UI-HANDOFF.md, supersedes the 2026-08-17 probes)
//
// The earlier probes hit an older product: that page read no query string, so
// this file used to build a bare deep link from two VITE_FLASH_* vars and a
// long comment explained why no parameter would ever work. Our account is on a
// newer product now:
//
//   • the SERVER builds the checkout URL (GET /billing/plans → `checkout_url`),
//     carrying the service id, plan id and the exactly-matched `redirect_uri` —
//     exact to the character, which is why the server owns it;
//   • the UI appends ONE parameter: `ref=<hex pubkey>` (≤200 chars; a pubkey is
//     64). Flash echoes it back on the redirect, and it is the entire identity
//     design — the pending-checkout/email-correlation machinery is gone;
//   • one plan takes both rails; the subscriber picks card vs Lightning on
//     Flash's page, so there is no rail parameter here;
//   • checkout is IDEMPOTENT on `ref`: an existing subscriber gets redirected
//     back with their subscription instead of charged twice.
//
// `window.open` must stay synchronous inside the click handler (popup
// blockers); optional `&email=` / `&name=` prefills exist but we don't store
// either, so we send neither.

import type { BillingPlan } from "@/services/subscription";

export interface CheckoutTarget {
  /**
   * false → nothing to open: this instance has no billing (empty plans), the
   * plan carries no checkout_url, or there's no signed-in pubkey to bind the
   * payment to. Callers show that plainly rather than navigating — a fake
   * checkout page would be a worse lie than an empty state.
   */
  external: boolean;
  url: string;
}

/** The URL Subscribe opens: the server's checkout_url plus our one parameter. */
export function resolveCheckout(
  plan: BillingPlan | undefined,
  pubkey: string | null | undefined,
): CheckoutTarget {
  const base = plan?.checkoutUrl;
  if (!base || !pubkey) return { external: false, url: "" };
  const sep = base.includes("?") ? "&" : "?";
  return { external: true, url: `${base}${sep}ref=${encodeURIComponent(pubkey)}` };
}
