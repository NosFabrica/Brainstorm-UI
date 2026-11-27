import { npubFromPubkey } from "@/lib/shareId";
import { type Tone } from "@/lib/tones";

/** What the subscriber roster's pieces share: Flash's links, status tones, entitlement reasons, the grid's cells. */

/**
 * Invoices and refunds still live in Flash; cancelling and pausing no longer do.
 * The links out stay regardless — acting on a subscription is a different
 * question from seeing what Flash actually says about it.
 *
 * Subscribers are untouched by any of this: they still manage their own
 * subscription through Flash's portal.
 */
export const FLASH_VAULT_URL = "https://dev.vault.paywithflash.com";
export const FLASH_DASHBOARD_URL = `${FLASH_VAULT_URL}/subscriptions`;

/** Deep link to one subscription's detail page in the Flash dashboard. */
export function flashSubscriptionUrl(subscriptionId: string): string {
  return `${FLASH_VAULT_URL}/subscriptions/active/${subscriptionId}`;
}

/** Flash's statuses are an open set — color the ones we know, never crash on new ones. */
export function statusTone(status: string): Tone {
  if (status === "active" || status === "trial") return "success";
  if (status === "pending" || status === "past_due" || status === "paused") return "warning";
  if (status === "canceled" || status === "expired") return "neutral";
  return "neutral";
}

/**
 * The server's EntitlementReason, in words. Most of these are *decisions*, not
 * errors — "held" and "unknown_plan" mean it looked and deliberately left the
 * tier alone, which is easy to misread as the call having done nothing.
 */
export const ENTITLEMENT_REASONS: Record<string, string> = {
  granted: "Flash says they're entitled; the paid tier is applied.",
  revoked: "The subscription has ended — they're back on the default tier.",
  held: "Nothing certain enough to act on (dunning, or a cancellation still inside its paid period). Tier left as-is.",
  blocked: "They're blocked from paid entitlement, so nothing was granted.",
  admin_override: "An admin assignment holds this tier; billing didn't take it away.",
  attributed: "It was already attributed to them — they hold the tier, so nothing needed to change.",
  no_reference: "The subscription carries no reference to a user.",
  unknown_user: "No account matches this pubkey.",
  unknown_plan: "Flash's plan isn't mapped to an entitlement here — map it under plans.",
  unknown_subscription: "Flash has no subscription for this user.",
  reference_mismatch: "Flash's record names a different user. Nothing was changed — worth investigating.",
  busy: "Something else is reconciling this user right now. Try again shortly.",
};

export function entitlementReasonText(reason: string): string {
  return ENTITLEMENT_REASONS[reason] ?? `Server reported "${reason}".`;
}

/** "npub1abc…wxyz" — enough to recognize, full value in the title attribute. */
export function shortNpub(pubkey: string): { short: string; full: string } {
  try {
    const npub = npubFromPubkey(pubkey);
    return { short: `${npub.slice(0, 12)}…${npub.slice(-4)}`, full: npub };
  } catch {
    return { short: `${pubkey.slice(0, 8)}…`, full: pubkey };
  }
}

// The User Database's grid, so the two admin rosters read as one system:
// shaded header row, column rules, hairline rows.
export const th =
  "px-2 py-2.5 align-middle whitespace-nowrap text-left border-r border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";
export const thLast =
  "px-2 py-2.5 align-middle whitespace-nowrap text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";
export const td =
  "px-2 py-2.5 text-sm text-slate-700 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800/60";

export type ProfileBits = { name?: string; picture?: string };

export type SortKey = "subscriber" | "status" | "service" | "scheduling" | "source" | "period" | "synced" | "nextbill";
export type SortState = { key: SortKey; dir: "asc" | "desc" } | null;
