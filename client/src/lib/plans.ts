// Single source of truth for Brainstorm's two subscription tiers.
//
// Consumed by the pricing page, the billing UI and the checkout flow.
//
// ## Why there are only two, and why the paid one is called Priority
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
// The paid tier was briefly called "Supporter" and pitched as funding the work.
// The team rejected that (along with "Early Access"): people are buying a
// service, not backing a project, and the name should say which service. Hence
// "Priority" — it names the thing you actually get when the queue is busy.
//
// ## What the paid tier actually buys
//
// A scheduling policy. `SchedulingItem` in services/api.ts already carries
// `schedule_interval_seconds` and `priority`, and
// `PUT /admin/users/{pubkey}/scheduling` already moves people between policies.
// So the difference is enforced server-side — Priority really is recalculated
// weekly (7 days) against the free default's ~2 months (60 days), and really
// does run ahead of the free lane. Nothing here is cosmetic, and there is
// deliberately no client-side gating in this module: see
// docs/payments/FLASH-INTEGRATION.md.
//
// NOT a difference: manual recalculation. It stays unlimited on both tiers,
// rate-limited only to stop abuse (`manual_quota_limit` already defaults to 20
// per week server-side). A quota that makes someone think before clicking is
// friction we are choosing not to sell.
//
// Prices are USD-primary in **minor units** to match Flash (`data-amount="200"`
// → $2.00). `satsPerMonth` is kept for the Lightning rail, which is not wired.

export type TierId = "free" | "priority";

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
  /** This line states the tier's interval. The pricing card shows it as the
   *  hero number instead of a bullet, so it is never said twice. */
  interval?: true;
  /**
   * Roadmap grouping. Planned items only — a flat list of ten reads as a wish
   * list, where three named directions read as a plan.
   */
  theme?: RoadmapTheme;
}

export type RoadmapTheme = "search" | "assistant" | "scoring";

/** Heading + one line of framing per roadmap group, in display order. */
export const ROADMAP_THEMES: { key: RoadmapTheme; title: string; blurb: string }[] = [
  {
    key: "search",
    title: "Search that reaches past profiles",
    blurb: "Find what people wrote, ranked by the network you trust — not by whoever shouted loudest.",
  },
  {
    key: "assistant",
    title: "An assistant of your own",
    blurb: "Your own assistant on Nostr, watching your network so you don't have to.",
  },
  {
    key: "scoring",
    title: "Scoring you can shape",
    blurb: "The engine already has these knobs. We're handing them to you.",
  },
];

export interface TierInfo {
  id: TierId;
  name: string;
  /** 0 = free, ascending. */
  order: number;
  /** Recurring price in USD **minor units** (cents). 0 for free. */
  usdMinorPerMonth: number;
  /** Lightning equivalent, for when that rail lands. Not charged today. */
  satsPerMonth: number;
  /**
   * Days between automatic recalculations — the SAME number the feature label
   * quotes and the same one the scheduling policy is configured with. Here so
   * "next scheduled" can be derived instead of guessed, and so the label and the
   * arithmetic cannot drift apart.
   */
  recalcIntervalDays: number;
  /** Short line under the price. */
  tagline: string;
  /** Small true label over the name — "For active accounts". Never "Most
   *  popular" until it is. */
  kicker?: string;
  /** Supporting line — framing, not a feature claim. */
  note?: string;
  /**
   * The tier whose features this one includes. The pricing card draws that
   * tier's list, dimmed, above this tier's own under a "Plus" heading — so the
   * card visibly CONTAINS the lower tier instead of asserting it in a sentence
   * nobody counts. `featureKeys` stays this tier's own lines only.
   */
  inherits?: TierId;
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
  // Both tiers state an exact interval. "About every two months" was hedging —
  // it reads as an estimate we might miss, when it is a configured number
  // (`schedule_interval_seconds`) that either holds or is a bug. A figure someone
  // can check is worth more than a range that sounds safe.
  "recalc-60d": { key: "recalc-60d", label: "New follows show up within 60 days", status: "live", interval: true },
  // Concrete, and the thing that stops "slower schedule" reading as "crippled":
  // you can always refresh yourself, on either tier.
  "manual-unlimited": { key: "manual-unlimited", label: "Unlimited manual recalculation", status: "live" },
  "ranked-search": { key: "ranked-search", label: "Search ranked by your network", status: "live" },
  "verified-followers": { key: "verified-followers", label: "Verified follower count", status: "live" },
  "network-alerts": { key: "network-alerts", label: "Network alerts", status: "live" },
  // NIP-85 Trusted Assertions (kind 30382) are published for every account —
  // the Developers page has described them as "any client can fetch and
  // verify them" since before pricing existed. Live, not a promise.
  "portability": { key: "portability", label: "Compute your web of trust for supporting clients", status: "live" },

  // --- Live, and what Priority gets you ------------------------------------
  // Each of these is a field on the Priority scheduling policy, so they are
  // enforced by the scheduler rather than by the UI.
  //
  // Two came off after the team's review. "More on-demand recalculations" is
  // gone because manual is unlimited for everyone now. "This price stays yours"
  // is gone because it means "you're early, be rewarded" — the framing they
  // rejected — and it quietly commits us never to reprice early payers.
  // Weekly recalculation, said once as the hero and once as what it touches.
  // Four consequences spelled out line by line read as repetition (team
  // review, Aug 21), so they are one line here.
  "weekly-recalc": { key: "weekly-recalc", label: "New follows show up within 7 days, not 60", status: "live", interval: true },
  "weekly-fresh": { key: "weekly-fresh", label: "Weekly updates to your followers, alerts and web of trust", status: "live" },
  "queue-priority": { key: "queue-priority", label: "Ahead of the free queue when Brainstorm is busy", status: "live" },
  "priority-support": { key: "priority-support", label: "Priority support", status: "live" },

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
  "content-search": { key: "content-search", label: "Search what people wrote, not just who they are", status: "planned", theme: "search" },
  "search-ranking": { key: "search-ranking", label: "Results ordered by the people you trust, not by volume", status: "planned", theme: "search" },
  "saved-searches": { key: "saved-searches", label: "Save a search and hear when something new matches it", status: "planned", theme: "search" },

  "assistant-watch": { key: "assistant-watch", label: "An assistant that watches your network while you're away", status: "planned", theme: "assistant" },
  "assistant-trends": { key: "assistant-trends", label: "What's moving in your corner of Nostr, before it's obvious", status: "planned", theme: "assistant" },
  "assistant-rules": { key: "assistant-rules", label: "Tell it what to watch for — and how loudly to tell you", status: "planned", theme: "assistant" },
  "impersonation-watch": { key: "impersonation-watch", label: "Hear the moment someone starts copying your profile", status: "planned", theme: "assistant" },

  "custom-roots": { key: "custom-roots", label: "Choose whose follows your scores start from", status: "planned", theme: "scoring" },
  "signal-weights": { key: "signal-weights", label: "Decide how much a mute or a report counts", status: "planned", theme: "scoring" },
  "trust-distance": { key: "trust-distance", label: "Decide how far trust travels from you", status: "planned", theme: "scoring" },
  "score-preview": { key: "score-preview", label: "Try a change and see who it moves, before you keep it", status: "planned", theme: "scoring" },
};

export const TIERS: Record<TierId, TierInfo> = {
  free: {
    id: "free",
    name: "Free",
    order: 0,
    usdMinorPerMonth: 0,
    satsPerMonth: 0,
    recalcIntervalDays: 60,
    tagline: "for checking someone occasionally",
    // Team review, Aug 21: "less is more" — exactly the lines they named.
    featureKeys: [
      "recalc-60d",
      "manual-unlimited",
      "verified-followers",
      "ranked-search",
      "network-alerts",
      "portability",
    ],
    cta: { current: "Your plan", upgrade: "Get started free" },
  },
  priority: {
    id: "priority",
    name: "Priority",
    order: 1,
    usdMinorPerMonth: 200,
    satsPerMonth: 2100,
    recalcIntervalDays: 7,
    tagline: "for acting on what you see",
    // The "Everything in Free" sentence became a drawn, dimmed list on the card
    // (`inherits`) — a sentence nobody counts versus nine checkmarks everyone
    // does. The interval itself is the card's hero number, so no note repeats it.
    kicker: "For active accounts",
    inherits: "free",
    featureKeys: [
      "weekly-recalc",
      "weekly-fresh",
      "queue-priority",
      "priority-support",
    ],
    cta: { current: "Your plan", upgrade: "Get Priority" },
  },
};

/** Tiers low → high. Drives rendering order. */
export const TIER_ORDER: TierId[] = ["free", "priority"];

/** The one tier that can be bought. */
export const PAID_TIER: TierId = "priority";

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

/** Planned work grouped by direction, in `ROADMAP_THEMES` order. */
export function plannedByTheme(): { key: RoadmapTheme; title: string; blurb: string; items: FeatureDef[] }[] {
  const planned = plannedFeatures();
  return ROADMAP_THEMES.map((t) => ({
    ...t,
    items: planned.filter((f) => f.theme === t.key),
  })).filter((g) => g.items.length > 0);
}

/**
 * When the next automatic recalculation is due, in words.
 *
 * Derived from the plan's interval and the last run — there is no user-facing
 * next-run field on the backend today, so this is arithmetic, not a report. That
 * is why the UI labels it "next scheduled" rather than "will run at": the
 * scheduler decides the moment, this says which window it falls in. Prefer a
 * real next-run field over this the day one exists.
 *
 * Returns null with no last run, because a next-run guess with nothing behind it
 * is fiction rather than an estimate.
 */
export function nextScheduledLabel(
  lastRunMs: number | null,
  tier: TierId,
  nowMs: number = Date.now(),
): string | null {
  if (!lastRunMs) return null;
  const dueMs = lastRunMs + TIERS[tier].recalcIntervalDays * 86_400_000;
  const days = Math.round((dueMs - nowMs) / 86_400_000);
  if (days <= 0) return "due now";
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

/**
 * The Lightning price, in sats — "2,100 sats". A configured price, not a
 * conversion: Lightning subscribers are quoted in their own unit, because a
 * sats payer shown "$2.00" is being shown someone else's money. (Benjamin's
 * call, and the same courtesy card payers already get in reverse.)
 */
export function formatSats(id: TierId): string {
  return `${TIERS[id].satsPerMonth.toLocaleString("en-US")} sats`;
}

/** "$2" / "Free" — from minor units, so it can't drift from what Flash charges. */
export function formatPrice(id: TierId): string {
  const minor = TIERS[id].usdMinorPerMonth;
  if (minor === 0) return "Free";
  const major = minor / 100;
  return `$${Number.isInteger(major) ? major : major.toFixed(2)}`;
}
