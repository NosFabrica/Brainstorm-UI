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

export type SignupSectionKind = "unresolved_signups" | "unmapped_plans";

/** A Flash id an exhausted event may borrow, and which section lent it: a
 *  handle from Plans not mapped is an identified, paying subscriber, so
 *  "Dismiss as nobody's" cannot succeed for it (the server 404s). */
export interface SignupHandle {
  subscriptionId: string;
  from: SignupSectionKind;
}

/** Webhook event id → the Flash subscription id a signup section carries for
 *  it, and which section. A signup that named nobody wins over a plan not mapped. */
export function subscriptionIdsByEventId(report: Record<string, AdminBillingDivergenceSection | undefined>): Map<number, SignupHandle> {
  const map = new Map<number, SignupHandle>();
  for (const kind of ["unresolved_signups", "unmapped_plans"] as SignupSectionKind[]) {
    for (const row of report[kind]?.rows ?? []) {
      const r = row as { id?: unknown; flash_subscription_id?: unknown };
      if (typeof r.id === "number" && typeof r.flash_subscription_id === "string" && r.flash_subscription_id && !map.has(r.id)) {
        map.set(r.id, { subscriptionId: r.flash_subscription_id, from: kind });
      }
    }
  }
  return map;
}

/** One webhook delivery of a signup that named nobody, with how many times the
 *  replay tried before giving up — when the exhausted section knows. */
export interface SignupDelivery {
  id: number;
  event: string;
  created_at: string | null;
  process_error: string | null;
  attempts?: number;
}

/** One signup — one Flash subscription — and every delivery of it the report lists. */
export interface SignupGroup {
  /** Null for a delivery that carries no Flash id at all; it stands alone. */
  subscriptionId: string | null;
  deliveries: SignupDelivery[];
}

/**
 * One signup reads as one problem (Enes): two deliveries — started, then
 * cancelled — of one nobody's payment carry one Flash id, so they are one
 * entry with one menu. Groups keep the order of first appearance; a row with
 * no Flash id cannot be settled and stands alone. The exhausted section's
 * attempts ride the delivery line instead of repeating the row.
 */
export function groupSignups(rows: ReadonlyArray<unknown>, exhausted: ReadonlyArray<unknown> = []): SignupGroup[] {
  const attempts = new Map<number, number>();
  for (const e of exhausted) {
    const r = e as { id?: unknown; attempts?: unknown };
    if (typeof r.id === "number" && typeof r.attempts === "number") attempts.set(r.id, r.attempts);
  }
  const groups: SignupGroup[] = [];
  const byId = new Map<string, SignupGroup>();
  for (const row of rows) {
    const r = row as { id?: unknown; event?: unknown; created_at?: unknown; process_error?: unknown; flash_subscription_id?: unknown };
    const id = typeof r.id === "number" ? r.id : -1;
    const delivery: SignupDelivery = {
      id,
      event: typeof r.event === "string" ? r.event : "",
      created_at: typeof r.created_at === "string" ? r.created_at : null,
      process_error: typeof r.process_error === "string" ? r.process_error : null,
      ...(attempts.has(id) ? { attempts: attempts.get(id) } : {}),
    };
    const sid = typeof r.flash_subscription_id === "string" && r.flash_subscription_id ? r.flash_subscription_id : null;
    if (!sid) {
      groups.push({ subscriptionId: null, deliveries: [delivery] });
      continue;
    }
    const existing = byId.get(sid);
    if (existing) existing.deliveries.push(delivery);
    else {
      const g = { subscriptionId: sid, deliveries: [delivery] };
      byId.set(sid, g);
      groups.push(g);
    }
  }
  return groups;
}

/**
 * The exhausted events worth their own row: an event a signup group already
 * shows adds only its attempts, which the group carries, so it folds. An event
 * with no handle, or one borrowed from Plans not mapped, still stands alone.
 */
export function splitExhausted<R extends { id?: unknown }>(rows: R[], handles: Map<number, SignupHandle>): { standalone: R[]; folded: number } {
  const standalone: R[] = [];
  let folded = 0;
  for (const row of rows) {
    const id = typeof row.id === "number" ? row.id : null;
    if (id != null && handles.get(id)?.from === "unresolved_signups") folded += 1;
    else standalone.push(row);
  }
  return { standalone, folded };
}
