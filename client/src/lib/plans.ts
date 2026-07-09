// Single source of truth for Brainstorm's subscription tiers.
//
// Consumed by the pricing page, the entitlement/gating helpers, the checkout
// flow, and the billing UI. Prices are sats-primary (the charge is in sats via
// PayWithFlash); the USD figure is a static human-readable approximation, not a
// live conversion. Most Sovereign/Guardian features are backend capabilities —
// the UI shows a locked state + upgrade prompt; real enforcement is server-side.

export type TierId = "grapevine" | "sovereign" | "guardian";

/** Subscription lifecycle state (mirrors the backend/Flash status contract). */
export type SubscriptionStatus = "none" | "active" | "past_due" | "grace" | "canceled";

/** Payment rail a subscription is billed on. Card is not wired yet (seam only). */
export type Rail = "flash-lightning" | "card";

export interface FeatureDef {
  /** Stable gating key (kebab-case) referenced by useEntitlement. */
  key: string;
  /** Customer-facing label shown in the pricing table + upgrade prompts. */
  label: string;
}

export interface TierInfo {
  id: TierId;
  name: string;
  /** 0 = free base, ascending. Drives `>=` comparisons for gating. */
  order: number;
  /** Recurring price in sats. 0 for the free tier. */
  satsPerMonth: number;
  /** Static, human-readable ≈USD label (not a live conversion). */
  usdApprox: string;
  /** Short line under the price (e.g. "own your data"). */
  tagline: string;
  /** Optional pill on the card (e.g. Guardian "Creators + brands"). */
  badge?: string;
  /** Whether this tier can be purchased today. `false` → shown as "coming soon"
   *  (in the vision, not yet buyable). The free base tier is always `true`. */
  available: boolean;
  /** Optional supporting line under the price (framing, e.g. early-supporter). */
  note?: string;
  /** Gating keys unlocked AT this tier (delta only; tiers are cumulative). */
  featureKeys: string[];
  /** Customer-facing CTA labels. */
  cta: { current: string; upgrade: string };
}

// Every gating key → its customer-facing label. Built once so the pricing table,
// upgrade prompts, and billing all read the same wording.
export const TIER_FEATURES: Record<string, FeatureDef> = {
  // Grapevine (free)
  "wot-feed": { key: "wot-feed", label: "WoT-ranked feed + search" },
  "deep-scores": { key: "deep-scores", label: "Deep scores, full graph depth" },
  "spam-filter": { key: "spam-filter", label: "Spam + impersonator filtering" },
  "report-impersonators": { key: "report-impersonators", label: "Report impersonators" },
  "report-impact": { key: "report-impact", label: "Report-impact preview" },
  vouch: { key: "vouch", label: "Vouch for real humans" },
  "trust-path": { key: "trust-path", label: "Trust-path lens (why in your web)" },
  "is-this-real": { key: "is-this-real", label: 'One-tap "is this real?"' },
  "profile-badges": { key: "profile-badges", label: "Live grapevine profile badges" },
  "dm-gate": { key: "dm-gate", label: "Grapevine DM + reply gate" },
  "community-lens": { key: "community-lens", label: "Community grapevines as a lens" },
  "network-discovery": { key: "network-discovery", label: "New-in-your-network discovery" },

  // Sovereign
  "fresh-scores": { key: "fresh-scores", label: "Fresh, near-real-time scores" },
  "full-history": { key: "full-history", label: "Full history, searchable forever" },
  "semantic-search": { key: "semantic-search", label: "Semantic search over your notes" },
  "wot-alerts": { key: "wot-alerts", label: "WoT-filtered alerts + saved searches" },
  "custom-roots": { key: "custom-roots", label: "Custom / weighted roots" },
  "algorithm-knobs": { key: "algorithm-knobs", label: "Algorithm knobs (tune GrapeRank)" },
  "personal-archive": { key: "personal-archive", label: "Tagged personal archive" },
  "portable-credential": { key: "portable-credential", label: "Portable reputation credential" },
  "no-ads": { key: "no-ads", label: "No ads, no ranking for sale" },

  // Guardian
  "identity-watch": { key: "identity-watch", label: "Full identity-surface watch (name, pfp, npub, NIP-05, LN address)" },
  "clone-alerts": { key: "clone-alerts", label: "Clone alerts + network-wide takedown" },
  "verified-human-badge": { key: "verified-human-badge", label: "Verified-human badge" },
  "audience-trust-api": { key: "audience-trust-api", label: "Audience trust-check API" },
  "team-seats": { key: "team-seats", label: "Team seats / delegated access" },
  "reach-analytics": { key: "reach-analytics", label: "Reach + amplification analytics" },
  "published-vouch-list": { key: "published-vouch-list", label: "Published vouch list" },
  "data-api": { key: "data-api", label: "API access to your own data" },
};

export const TIERS: Record<TierId, TierInfo> = {
  grapevine: {
    id: "grapevine",
    name: "Grapevine",
    order: 0,
    satsPerMonth: 0,
    usdApprox: "Free",
    tagline: "forever — the flywheel",
    available: true,
    featureKeys: [
      "wot-feed", "deep-scores", "spam-filter", "report-impersonators", "report-impact",
      "vouch", "trust-path", "is-this-real", "profile-badges", "dm-gate",
      "community-lens", "network-discovery",
    ],
    cta: { current: "Current plan", upgrade: "Get started free" },
  },
  sovereign: {
    id: "sovereign",
    name: "Sovereign",
    order: 1,
    satsPerMonth: 2100,
    usdApprox: "≈ $2/mo",
    tagline: "own your data",
    available: true,
    note: "Early supporter — lock in this price as more features roll out",
    featureKeys: [
      "fresh-scores", "full-history", "semantic-search", "wot-alerts", "custom-roots",
      "algorithm-knobs", "personal-archive", "portable-credential", "no-ads",
    ],
    cta: { current: "Current plan", upgrade: "Upgrade to Sovereign" },
  },
  guardian: {
    id: "guardian",
    name: "Guardian",
    order: 2,
    satsPerMonth: 21000,
    usdApprox: "≈ $20/mo",
    tagline: "protect your name",
    badge: "Creators + brands",
    available: false,
    note: "Coming soon — unlocks as identity-protection features ship",
    featureKeys: [
      "identity-watch", "clone-alerts", "verified-human-badge", "audience-trust-api",
      "team-seats", "reach-analytics", "published-vouch-list", "data-api",
    ],
    cta: { current: "Current plan", upgrade: "Join the waitlist" },
  },
};

/** Tiers low → high. Drives rendering order and cumulative feature rollups. */
export const TIER_ORDER: TierId[] = ["grapevine", "sovereign", "guardian"];

export function tierRank(id: TierId): number {
  return TIERS[id].order;
}

/** A tier that can actually be purchased right now (paid AND available). */
export function isPurchasable(id: TierId): boolean {
  const t = TIERS[id];
  return t.available && t.satsPerMonth > 0;
}

/** True when `userTier` is at or above `required` (the gating check). */
export function tierMeetsRequirement(userTier: TierId, required: TierId): boolean {
  return tierRank(userTier) >= tierRank(required);
}

/**
 * The lowest tier that grants `featureKey`. Since each tier lists only the
 * features it *adds*, the tier whose delta contains the key is the required one.
 * Falls back to "guardian" for an unknown key (fail closed).
 */
export function featureRequiredTier(featureKey: string): TierId {
  for (const id of TIER_ORDER) {
    if (TIERS[id].featureKeys.includes(featureKey)) return id;
  }
  return "guardian";
}

/** Cumulative feature list for a tier (grapevine ⊆ sovereign ⊆ guardian). */
export function allFeaturesForTier(id: TierId): FeatureDef[] {
  const max = tierRank(id);
  return TIER_ORDER
    .filter((t) => tierRank(t) <= max)
    .flatMap((t) => TIERS[t].featureKeys)
    .map((key) => TIER_FEATURES[key])
    .filter(Boolean);
}

/** The features a tier ADDS over the one below it (for "Everything in X, plus…"). */
export function deltaFeaturesForTier(id: TierId): FeatureDef[] {
  return TIERS[id].featureKeys.map((key) => TIER_FEATURES[key]).filter(Boolean);
}

/** The tier immediately below `id`, or null for the free base. */
export function previousTier(id: TierId): TierId | null {
  const idx = TIER_ORDER.indexOf(id);
  return idx > 0 ? TIER_ORDER[idx - 1] : null;
}
