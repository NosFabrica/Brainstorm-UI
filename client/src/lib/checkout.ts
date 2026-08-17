// Where "Get Priority" goes.
//
// ## What Flash actually accepts (measured, 2026-08-17)
//
// Flash's public docs describe an older surface — `app.paywithflash.com/
// subscription-page?flashId=459&params=<base64 JSON>`. Our vault is a different
// product, and it takes NONE of that. Fetching our real signup page and probing
// it showed:
//
//   • the URL is path-based:  /subscriptions/signup/{serviceId}/{planId}
//   • the documented `?params=<base64>` pre-fill does nothing
//   • plain `?email=&npub=&external_uuid=` does nothing either
//   • there is no external-id field on the form at all
//
// So there is no payload to build — just a deep link. Everything the earlier
// `resolveCheckout()` did (tier/rail/pubkey/return query params) was addressed
// to an API that does not exist on this surface.
//
// Link to the PLAN, not the service: the service-level URL is a "Get started"
// interstitial listing plans, and with one plan it is a click offering no choice.
//
// ## Why a map rather than one env var
//
// Lightning will need its own Flash plan when that rail lands, and dev and
// production are separate vaults with different UUIDs. A single scalar cannot
// express `tier × rail → plan`, and discovering that later means touching every
// caller. `VITE_FLASH_PRIORITY_CARD` holds "<serviceId>/<planId>".

import { env } from "@/lib/runtimeEnv";
import type { TierId, Rail } from "@/lib/plans";

export interface CheckoutTarget {
  /**
   * false → this environment has no Flash vault configured. Callers must show
   * that plainly rather than navigating: there is no in-app way to take a
   * payment, and a fake checkout page would be a worse lie than an empty state.
   */
  external: boolean;
  url: string;
}

/** "<serviceId>/<planId>" per purchasable tier+rail, from runtime env. */
function planPath(tier: TierId, rail: Rail): string {
  if (tier === "priority" && rail === "card") {
    return (env.VITE_FLASH_PRIORITY_CARD || "").trim().replace(/^\/+|\/+$/g, "");
  }
  return ""; // Lightning has no plan yet.
}

export function buildFlashCheckoutUrl(planPathSegment: string): string {
  const base = (env.VITE_FLASH_BASE_URL || "").trim().replace(/\/+$/, "");
  return `${base}/subscriptions/signup/${planPathSegment}`;
}

/**
 * Resolve where Subscribe goes. Falls back to the in-app preview route when the
 * vault isn't configured, so the whole flow stays clickable without credentials
 * — which is also how it behaves in local dev and in tests.
 */
export function resolveCheckout(
  tier: TierId,
  opts?: { rail?: Rail },
): CheckoutTarget {
  const rail: Rail = opts?.rail ?? "card";
  const path = planPath(tier, rail);
  const base = (env.VITE_FLASH_BASE_URL || "").trim();

  if (base && path) {
    return { external: true, url: buildFlashCheckoutUrl(path) };
  }
  // No vault configured (local dev, or before creds land). No URL to give.
  return { external: false, url: "" };
}
