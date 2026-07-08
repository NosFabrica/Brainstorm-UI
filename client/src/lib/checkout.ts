// Rail-abstracted checkout entry. One resolver decides where "Subscribe" goes:
// - If a Flash hosted-checkout URL is configured (VITE_FLASH_CHECKOUT_URL), we
//   redirect there with tier/rail/pubkey/return params (Flash owns the recurring
//   NWC flow — do NOT reuse lib/zap.ts, which is one-shot NIP-57 zaps).
// - Otherwise (no creds yet) we fall back to the in-app /checkout preview page so
//   the whole flow stays clickable pre-integration.
// The `rail` param is where a future card rail slots in without touching callers.

import { env } from "@/lib/runtimeEnv";
import type { TierId, Rail } from "@/lib/plans";

export interface CheckoutTarget {
  /** true → external Flash redirect; false → in-app fallback route. */
  external: boolean;
  url: string;
}

export function resolveCheckout(
  tier: TierId,
  opts?: { rail?: Rail; pubkey?: string },
): CheckoutTarget {
  const rail: Rail = opts?.rail ?? "flash-lightning";
  const returnPath = `/checkout/success?tier=${tier}`;
  const base = env.VITE_FLASH_CHECKOUT_URL;

  if (base) {
    const u = new URL(base);
    u.searchParams.set("tier", tier);
    u.searchParams.set("rail", rail);
    if (opts?.pubkey) u.searchParams.set("pubkey", opts.pubkey);
    u.searchParams.set("return", returnPath);
    return { external: true, url: u.toString() };
  }

  // Stubbed until Flash creds land → in-app checkout preview.
  return { external: false, url: `/checkout?tier=${tier}&rail=${rail}` };
}
