// Marketing copy, the roadmap, and the formatters every billing surface shares.
//
// ## There is no tier set here any more
//
// What is on offer is whatever GET /billing/plans says is on offer: a flat
// list of plans, each carrying its own policy name plus the price, name and
// billing interval the server read from Flash.
// What a subscriber HOLDS is the policy on /user/subscription. Neither is a
// vocabulary this file knows in advance — see `components/billing/PlanPicker.tsx`
// and `hooks/useSubscription.ts`. Do not reintroduce a constant for a plan;
// add a field to the server response instead.
//
// What belongs here: `TIER_FEATURES` (the promise boundary), `productClaims()`
// (what Brainstorm does, on any plan), `ROADMAP_THEMES` / `plannedByTheme()`
// (/roadmap), and the formatters — amounts, billing periods, cadences, billing
// dates, and the one status-label map both billing cards render.
//
// ## The promise boundary
//
// An earlier three-tier version (Grapevine / Sovereign / Guardian) listed 21
// features across the paid tiers. An audit against the codebase found that
// NONE of the nine "Sovereign" features existed — no semantic search, no saved
// searches, no custom roots, no personal archive, no portable credential; the
// "algorithm knobs" were a `useState` slider on the explainer page wired to
// nothing. It would have sold a roadmap while reading like an inventory.
//
// Hence `status: "live" | "planned"` and the accessors below: a feature that
// does not exist cannot appear in a list of what you get.
//
// ## What a paid policy actually buys
//
// A scheduling policy. `SchedulingItem` in services/api.ts carries
// `schedule_interval_seconds` and `priority`, and
// `PUT /admin/users/{pubkey}/scheduling` moves people between policies. The
// difference is enforced server-side, and the cadence a surface quotes comes
// from the live policy — never from a number baked in here. See
// docs/payments/FLASH-INTEGRATION.md.
//
// NOT a difference: manual recalculation. It stays unlimited on every policy,
// rate-limited only to stop abuse (`manual_quota_limit` already defaults to 20
// per week server-side). A quota that makes someone think before clicking is
// friction we are choosing not to sell.
//
// Prices are minor units, to match Flash (`data-amount="200"` → $2.00).

/** Subscription lifecycle state. Mirrors Flash's dunning + our backend record. */
// "pending": a real payment awaiting confirmation (Lightning can take ~10
// minutes). Without it the server is forced to send "none" and a genuinely
// paying user reads as free — handoff A5.
export type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "grace" | "canceled";

/**
 * The one status wording, for every surface that shows it.
 *
 * Settings and Insights each kept their own copy of this and they had already
 * drifted ("Cancelled" vs "Canceled") — two labels for one server value is a
 * bug the moment anyone reads both pages.
 */
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: "—",
  pending: "Confirming payment",
  active: "Active",
  past_due: "Payment due",
  grace: "Grace period",
  canceled: "Cancelled",
};

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
   * something a plan includes. Keeping it in the data rather than in the copy
   * means the next person to edit the pricing page cannot accidentally promise
   * something unbuilt — `productClaims()` is the only accessor the page uses.
   */
  status: "live" | "planned";
  /** This line states a cadence. A surface showing the interval as its hero
   *  number skips the bullet, so it is never said twice. */
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
  // The label here is a FALLBACK — the live interval comes from
  // GET /billing/plans (`schedule_interval_seconds`) and surfaces render
  // `recalcFeatureLabel(days)` instead, so retuning a policy can't leave the
  // pricing page advertising a stale number. Keys lost their baked-in numbers
  // for the same reason (was `recalc-60d` / `weekly-recalc`).
  "recalc-interval": { key: "recalc-interval", label: recalcFeatureLabel(60), status: "live", interval: true },
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
  "recalc-interval-paid": { key: "recalc-interval-paid", label: recalcFeatureLabel(7, 60), status: "live", interval: true },
  // Cadence-neutral on purpose — "Weekly" would drift the day an admin retunes
  // the policy, and the interval is the hero number elsewhere.
  "auto-fresh": { key: "auto-fresh", label: "Automatic updates to your followers, alerts and web of trust", status: "live" },
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

/**
 * A LAST RESORT, not the truth. The cadence is the live `scheduling` row,
 * served per-plan by GET /billing/plans as `schedule_interval_seconds` —
 * admins retune it without a deploy, so anything baked here can drift
 * silently. One scalar rather than a per-plan map on purpose: there is no
 * fixed set of plans to key a map by, and a wrong number that is obviously a
 * placeholder beats a wrong number that looks authoritative.
 */
export const FALLBACK_RECALC_DAYS = 60;

/**
 * A cadence in seconds — how every policy stores it — as whole days, which is
 * how every surface says it. Null when there is no usable interval, so callers
 * show "—" instead of "every 0 days".
 */
export function cadenceDays(seconds: number | null | undefined): number | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? Math.max(1, Math.round(seconds / 86_400))
    : null;
}

/** The cadence sentence, from the LIVE interval. */
export function recalcFeatureLabel(days: number, comparedToDays?: number): string {
  const d = (n: number) => (n === 1 ? "1 day" : `${n} days`);
  return comparedToDays != null
    ? `New follows show up within ${d(days)}, not ${comparedToDays}`
    : `New follows show up within ${d(days)}`;
}

/**
 * What Brainstorm does, for everyone, on any plan.
 *
 * These four were bullets on the old free tier card, but none of them is tier
 * copy — they are true of the product, so they survive the tier set as one
 * static section on /pricing rather than vanishing with the card that happened
 * to list them. Routed through `TIER_FEATURES` so the promise boundary still
 * applies: a key marked `planned` is dropped rather than rendered as a claim.
 */
export const PRODUCT_CLAIM_KEYS = [
  "ranked-search",
  "verified-followers",
  "portability",
  "network-alerts",
] as const;

export function productClaims(): FeatureDef[] {
  return PRODUCT_CLAIM_KEYS.map((key) => TIER_FEATURES[key]).filter(
    (f): f is FeatureDef => !!f && f.status === "live",
  );
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
  /** Days between runs — the holder's own policy cadence, in days. */
  intervalDays: number | null,
  nowMs: number = Date.now(),
): string | null {
  if (!lastRunMs || !intervalDays || intervalDays <= 0) return null;
  const dueMs = lastRunMs + intervalDays * 86_400_000;
  const days = Math.round((dueMs - nowMs) / 86_400_000);
  if (days <= 0) return "due now";
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

/**
 * How many minor units make one major unit. NOT always 100: yen and won have
 * none, dinar has three. Intl knows every ISO code, so ask it rather than
 * hardcoding the divisor — `¥100` was rendering as `¥1`.
 *
 * `SAT` is not an ISO currency, so Intl throws on it and we answer for it here:
 * a sat is already the smallest unit of bitcoin, so the amount holds whole sats.
 * Flash is ambiguous about this — the dashboard shows our 1-sat test plan as
 * both "SAT 1.00" and "100 sats", and which is authoritative is still an open
 * question with them. Now that the amount comes from Flash's own plan object
 * rather than from a column an admin typed, that question decides what a
 * subscriber reads: if they mean hundredths, this renders 100x.
 */
const ZERO_DECIMAL_NON_ISO = new Set(["SAT", "SATS"]);

function minorUnitsPerMajor(code: string): number {
  if (ZERO_DECIMAL_NON_ISO.has(code)) return 1;
  try {
    const digits = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).resolvedOptions().maximumFractionDigits;
    return 10 ** (digits ?? 2);
  } catch {
    return 100;
  }
}

/**
 * "$2.00" / "€2.00" / "¥100" / "1,000 sats" / "Free" — from a plan's own minor
 * units, so it cannot drift from what Flash charges. Takes the numbers rather
 * than a tier, because the numbers are what the server sends.
 */
export function formatCurrency(amountMinor: number, currency: string): string {
  if (!Number.isFinite(amountMinor)) return "—";
  const code = currency.trim().toUpperCase();
  const major = amountMinor / minorUnitsPerMajor(code);

  if (ZERO_DECIMAL_NON_ISO.has(code)) {
    const n = new Intl.NumberFormat().format(major);
    return `${n} ${major === 1 ? "sat" : "sats"}`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${code}`;
  }
}

export function formatAmount(amountMinor: number, currency: string): string {
  if (Number.isFinite(amountMinor) && amountMinor <= 0) return "Free";
  return formatCurrency(amountMinor, currency);
}

/** Flash's documented intervals, in words. Their set is open — see below. */
const BILLING_INTERVALS: Record<string, string> = {
  daily: "per day",
  weekly: "per week",
  monthly: "per month",
  yearly: "per year",
  // No lifecycle, so no cadence: it sells but grants nothing automatically.
  one_off: "one-time",
};

/**
 * "per month", "per year", "one-time" — Flash's `billingInterval`, in words.
 *
 * Formatted, not matched. Flash documents its set as the five above but is free
 * to add to it, and a value this file does not recognise must still render:
 * dropping the row, or the cadence, would take a purchasable plan off the
 * pricing page or price it with no period. So an unknown word reads as itself,
 * and an absent one returns null so the caller shows a price alone.
 */
export function formatBillingInterval(interval: string | null | undefined): string | null {
  const word = typeof interval === "string" ? interval.trim() : "";
  if (!word) return null;
  return BILLING_INTERVALS[word.toLowerCase()] ?? word;
}

const BILLING_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A billing value as a local Date: a bare date placed at `at` on its own day,
 * anything else read as the instant it is.
 *
 * The shape is what decides, not a rule about which shape Flash will send —
 * it sends bare dates today and intends to move to instants. A value with no
 * time has nothing to localise, and `new Date("2026-09-20")` reads it as UTC
 * midnight, which renders as the 19th for every viewer west of UTC. So a bare
 * date is built from its own parts, where formatting cannot move the day.
 */
function asLocalDate(iso: string, at: [number, number, number, number]): Date {
  const parts = DATE_ONLY.exec(iso);
  return parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), ...at)
    : new Date(iso);
}

/**
 * The day a billing value names, for every viewer wherever they are — and the
 * one date wording for every billing surface, which had each grown its own.
 *
 * Formatted in the reader's own locale (`undefined`), not a fixed one: the DAY
 * must not move, which is what `asLocalDate` guarantees, but how that day is
 * written is a reading preference. Pinning en-US would show a European operator
 * "Sep 20, 2026" — one inconsistency traded for a worse one.
 */
export function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = asLocalDate(iso, [0, 0, 0, 0]);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, BILLING_DATE_FORMAT);
}

/**
 * When a billing deadline actually falls, for the surfaces asking "is this
 * still ahead of us?". A deadline given as a bare date runs to the END of that
 * day — read as midnight it retires a pending-cancellation notice a full day
 * early, on the day the subscriber most needs to see it.
 */
export function billingDeadlineMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = asLocalDate(iso, [23, 59, 59, 999]);
  return Number.isNaN(at.getTime()) ? null : at.getTime();
}
