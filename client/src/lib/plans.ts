// Single source of truth for Brainstorm's two subscription tiers.
//
// Consumed by the pricing page, the billing UI and the checkout flow.
//
// ## Why there are only two, and why the paid one is called Supporter
//
// The earlier three-tier version (Grapevine / Sovereign / Guardian) listed 21
// features across the paid tiers. An audit against the codebase found that
// NONE of the nine "Sovereign" features existed — no semantic search, no saved
// searches, no custom roots, no personal archive, no portable credential; the
// "algorithm knobs" were a `useState` slider on the explainer page wired to
// nothing. It would have sold a roadmap while reading like an inventory.
//
// So: one free tier, one paid tier, and a hard rule enforced by the types below
// — a feature that does not exist cannot appear in a list of what you get.
//
// ## What the paid tier actually buys
//
// A scheduling policy. `SchedulingItem` in services/api.ts already carries
// `schedule_interval_seconds`, `priority` and `manual_quota_limit`, and
// `PUT /admin/users/{pubkey}/scheduling` already moves people between policies.
// So the difference is enforced server-side — supporters really are recalculated
// weekly and really do run ahead of the free lane. Nothing here is cosmetic, and
// there is deliberately no client-side gating in this module: see
// docs/payments/FLASH-INTEGRATION.md.
//
// Prices are USD-primary in **minor units** to match Flash (`data-amount="200"`
// → $2.00). `satsPerMonth` is kept for the Lightning rail, which is not wired.

export type TierId = "free" | "supporter";

/** Subscription lifecycle state. Mirrors Flash's dunning + our backend record. */
export type SubscriptionStatus = "none" | "active" | "past_due" | "grace" | "canceled";

/** Payment rail a subscription is billed on. Lightning is not wired yet. */
export type Rail = "card" | "flash-lightning";

export interface FeatureDef {
  /** Stable key (kebab-case). */
  key: string;
  /** Customer-facing label. */
  label: string;
  /**
   * Whether this exists TODAY.
   *
   * The whole point of this field: `planned` items may only ever render inside
   * the roadmap section. They must never be counted, ticked, or listed as
   * something a tier includes. Keeping it in the data rather than in the copy
   * means the next person to edit the pricing page cannot accidentally promise
   * something unbuilt — `liveFeatures()` is the only accessor the page uses.
   */
  status: "live" | "planned";
}

export interface TierInfo {
  id: TierId;
  name: string;
  /** 0 = free, ascending. */
  order: number;
  /** Recurring price in USD **minor units** (cents). 0 for free. */
  usdMinorPerMonth: number;
  /** Lightning equivalent, for when that rail lands. Not charged today. */
  satsPerMonth: number;
  /** Short line under the price. */
  tagline: string;
  /** Supporting line — framing, not a feature claim. */
  note?: string;
  /** Feature keys this tier includes. Not cumulative — each list is complete. */
  featureKeys: string[];
  cta: { current: string; upgrade: string };
}

/**
 * Every feature key → its label and whether it exists.
 *
 * `live` entries were each confirmed present in the codebase (2026-08-17).
 * `planned` entries are real intentions with no implementation — they appear
 * only under "what your support funds".
 */
export const TIER_FEATURES: Record<string, FeatureDef> = {
  // --- Live, and free for everyone -----------------------------------------
  "ranked-search": { key: "ranked-search", label: "Search ranked by your network", status: "live" },
  "spam-filter": { key: "spam-filter", label: "Spam and impersonator filtering", status: "live" },
  reporting: { key: "reporting", label: "Report accounts that shouldn't be trusted", status: "live" },
  "trust-path": { key: "trust-path", label: "See how you're connected to anyone", status: "live" },
  "score-badges": { key: "score-badges", label: "Verification Scores on every profile", status: "live" },
  "network-discovery": { key: "network-discovery", label: "Discover who's new in your network", status: "live" },

  // --- Live, and what supporting gets you ----------------------------------
  // Each of these is a field on the Supporter scheduling policy, so they are
  // enforced by the scheduler rather than by the UI.
  "weekly-recalc": { key: "weekly-recalc", label: "Your scores recalculated every week, automatically", status: "live" },
  "queue-priority": { key: "queue-priority", label: "Priority in the calculation queue", status: "live" },
  "manual-allowance": { key: "manual-allowance", label: "More on-demand recalculations", status: "live" },
  "priority-support": { key: "priority-support", label: "Priority support", status: "live" },
  "locked-price": { key: "locked-price", label: "This price stays yours as more ships", status: "live" },

  // --- Planned. Roadmap only. Never listed as included. ---------------------
  //
  // Every item here is an argument GrapeRank already accepts and we don't yet
  // expose. `GrapeRankParams` is a per-run record carrying rigor, the
  // attenuation factor, and a rating + confidence for each of follow / mute /
  // report; the engine takes an `observer` as the seed. So this is surfacing
  // knobs that exist, not inventing capabilities — which is why it can be
  // written down without hedging.
  //
  // Four things were cut from the earlier list rather than reworded:
  //   • "Scores that update continuously" — that is the paid tier's weekly
  //     recalculation with a bigger number on it. Selling both makes what you
  //     actually buy look like a lesser version of what you don't.
  //   • "Alerts" — the dashboard already flags accounts in your network, free.
  //   • "Search your notes by meaning" — needs an embedding index that does not
  //     exist anywhere in the stack.
  //   • "Take your reputation to other apps" — already shipped; Settings
  //     publishes the NIP-85 declaration today.
  "custom-roots": { key: "custom-roots", label: "Choose whose follows your scores start from", status: "planned" },
  "signal-weights": { key: "signal-weights", label: "Decide how much a mute or a report counts", status: "planned" },
  "trust-distance": { key: "trust-distance", label: "Decide how far trust travels from you", status: "planned" },
  "score-preview": { key: "score-preview", label: "Try a change and see who it moves, before you keep it", status: "planned" },
  "impersonation-watch": { key: "impersonation-watch", label: "Hear when someone starts copying your profile", status: "planned" },
  "saved-searches": { key: "saved-searches", label: "Save a search and hear when someone new matches it", status: "planned" },
};

export const TIERS: Record<TierId, TierInfo> = {
  free: {
    id: "free",
    name: "Free",
    order: 0,
    usdMinorPerMonth: 0,
    satsPerMonth: 0,
    tagline: "everything you need to start",
    featureKeys: [
      "ranked-search",
      "spam-filter",
      "reporting",
      "trust-path",
      "score-badges",
      "network-discovery",
    ],
    cta: { current: "Your plan", upgrade: "Get started free" },
  },
  supporter: {
    id: "supporter",
    name: "Supporter",
    order: 1,
    usdMinorPerMonth: 200,
    satsPerMonth: 2100,
    tagline: "help build it, and get there first",
    note: "Early supporters fund the work. Everything in Free, plus a head start.",
    featureKeys: [
      "weekly-recalc",
      "queue-priority",
      "manual-allowance",
      "priority-support",
      "locked-price",
    ],
    cta: { current: "Your plan", upgrade: "Become a supporter" },
  },
};

/** Tiers low → high. Drives rendering order. */
export const TIER_ORDER: TierId[] = ["free", "supporter"];

/** The one tier that can be bought. */
export const PAID_TIER: TierId = "supporter";

export function tierRank(id: TierId): number {
  return TIERS[id].order;
}

/** True when `userTier` is at or above `required`. */
export function tierMeetsRequirement(userTier: TierId, required: TierId): boolean {
  return tierRank(userTier) >= tierRank(required);
}

/**
 * The features a tier includes — **live ones only**.
 *
 * This is the ONLY accessor the pricing page should use for "what you get".
 * A `planned` key sitting in a tier's `featureKeys` is silently dropped here
 * rather than rendered as a promise, which is the safe direction to fail.
 */
export function liveFeatures(id: TierId): FeatureDef[] {
  return TIERS[id].featureKeys
    .map((key) => TIER_FEATURES[key])
    .filter((f): f is FeatureDef => !!f && f.status === "live");
}

/** Everything planned, for the "what your support funds" section. */
export function plannedFeatures(): FeatureDef[] {
  return Object.values(TIER_FEATURES).filter((f) => f.status === "planned");
}

/** "$2" / "Free" — from minor units, so it can't drift from what Flash charges. */
export function formatPrice(id: TierId): string {
  const minor = TIERS[id].usdMinorPerMonth;
  if (minor === 0) return "Free";
  const major = minor / 100;
  return `$${Number.isInteger(major) ? major : major.toFixed(2)}`;
}
