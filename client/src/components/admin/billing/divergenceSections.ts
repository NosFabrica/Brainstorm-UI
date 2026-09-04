/**
 * The divergence report's ten sections, as admins should read them.
 *
 * Enes (2026-09-04): "these categories are more about knowing what's happening
 * than providing direct action options." So each section carries its meaning
 * in plain words, and the report reads in two tiers — Faults first (something
 * is wrong for a paying subscriber, or a payment is going nowhere), then For
 * the record (a decision, a count, a slow drift). Sections overlap by design:
 * an exhausted event is also an unresolved signup — one says what is wrong,
 * the other says nothing will fix it on its own.
 */
import type { AdminBillingDivergenceSection, DivergenceKind } from "@/services/api";

export type DivergenceTier = "fault" | "record";

export interface DivergenceMeta {
  tier: DivergenceTier;
  title: string;
  /** What the section means, in the admin's words. */
  meaning: string;
  /** The count is the signal; rows are detail. */
  countLed?: boolean;
}

export const DIVERGENCE_META: Record<DivergenceKind, DivergenceMeta> = {
  policy_mismatch: {
    tier: "fault",
    title: "Paying and receiving disagree",
    meaning:
      "Someone paying who isn't on the paid cadence, or someone on it who stopped paying. The bug the two columns exist to expose. Resync re-reads Flash and reapplies.",
  },
  failing_syncs: {
    tier: "fault",
    title: "Failing syncs",
    meaning:
      "The read from Flash failed and it still matters — a bad API key, or a paying subscriber we've lost track of. Abandoned checkouts are kept out so they can't drown this.",
  },
  unmapped_plans: {
    tier: "fault",
    title: "Plans not mapped",
    meaning:
      "A paying signup on a Flash plan that has no mapping here, so it grants nothing. Create the mapping and the event replays on the next sweep — the subscriber doesn't wait for their renewal.",
  },
  unresolved_signups: {
    tier: "fault",
    title: "Signups that named nobody",
    meaning:
      "Payments nobody is receiving anything for. Flash's payload carries no name or email, so the Flash id is the only handle — settle them when the subscriber gets in touch: attribute, or dismiss.",
  },
  exhausted_events: {
    tier: "fault",
    title: "Events replay gave up on",
    meaning:
      "Failed five times; nothing will fix these on their own. They also appear above as what went wrong — this list says which ones nobody is still trying.",
  },
  unrecognised_statuses: {
    tier: "fault",
    title: "Statuses we don't know",
    meaning:
      "Flash sent a status this build has no rule for. Unknown statuses hold the subscriber on their current tier indefinitely — this is the alarm on that default.",
  },
  admin_overrides: {
    tier: "record",
    title: "Admin overrides",
    meaning:
      "Subscribers whose policy a human set by hand, so billing leaves it alone. A decision, not a fault — listed so it's known who is comped or moved.",
  },
  stale_syncs: {
    tier: "record",
    title: "Not re-read recently",
    meaning:
      "Rows we haven't re-read from Flash in over a day, so their state is trusted less. Settled rows and abandoned checkouts are excluded on purpose.",
  },
  abandoned_checkouts: {
    tier: "record",
    title: "Abandoned checkouts",
    meaning:
      "Started but never paid; Flash discards them. Individually boring — the count is the signal: a spike means a broken checkout flow, not a billing fault.",
    countLed: true,
  },
  retired_plan_subscribers: {
    tier: "record",
    title: "Still on a retired plan",
    meaning:
      "Renewing normally on a plan nobody can buy any more. Ending or moving them is a human decision taken in Flash, one subscription at a time.",
  },
};

const FAULT_ORDER: DivergenceKind[] = ["policy_mismatch", "failing_syncs", "unmapped_plans", "unresolved_signups", "exhausted_events", "unrecognised_statuses"];
const RECORD_ORDER: DivergenceKind[] = ["admin_overrides", "stale_syncs", "abandoned_checkouts", "retired_plan_subscribers"];

export interface OrderedSection {
  kind: string;
  tier: DivergenceTier;
  /** Null for a kind this build doesn't know — rendered verbatim, under the record. */
  meta: DivergenceMeta | null;
  section: AdminBillingDivergenceSection;
}

/** Non-empty sections: faults in their fixed order, then the record, then anything new. */
export function orderedSections(report: Record<string, AdminBillingDivergenceSection | undefined>): OrderedSection[] {
  const out: OrderedSection[] = [];
  const known = new Set<string>([...FAULT_ORDER, ...RECORD_ORDER]);
  const take = (kind: DivergenceKind) => {
    const section = report[kind];
    if (section && section.count > 0) out.push({ kind, tier: DIVERGENCE_META[kind].tier, meta: DIVERGENCE_META[kind], section });
  };
  FAULT_ORDER.forEach(take);
  RECORD_ORDER.forEach(take);
  for (const [kind, section] of Object.entries(report)) {
    if (!known.has(kind) && section && section.count > 0) out.push({ kind, tier: "record", meta: null, section });
  }
  return out;
}

/** Webhook event id → Flash subscription id, from the signup sections that
 *  carry one. An exhausted event borrows its handle from here. */
export function subscriptionIdsByEventId(report: Record<string, AdminBillingDivergenceSection | undefined>): Map<number, string> {
  const map = new Map<number, string>();
  for (const kind of ["unresolved_signups", "unmapped_plans"]) {
    for (const row of report[kind]?.rows ?? []) {
      const r = row as { id?: unknown; flash_subscription_id?: unknown };
      if (typeof r.id === "number" && typeof r.flash_subscription_id === "string" && r.flash_subscription_id) map.set(r.id, r.flash_subscription_id);
    }
  }
  return map;
}
