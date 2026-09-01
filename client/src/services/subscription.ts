// The single seam between the subscription UI and its data source: the server,
// and only the server. Whether an INSTANCE sells anything is answered by
// `/billing/plans` coming back empty, which is a fact rather than a claim.
//
// ## The rule this file exists to enforce
//
// The UI never decides who has paid; it asks. What a paying account actually
// gets is a scheduling POLICY applied server-side (see
// docs/payments/FLASH-INTEGRATION.md), so this is a *report* of state, not the
// state itself. That is why every failure path below resolves to "no policy,
// nothing bought" rather than throwing: a backend hiccup must never read as
// "paid", and equally must never strip anything from someone who is — their
// policy is unaffected by whatever this function returns.
//
// ## There is no tier string
//
// The policy a user holds IS their tier. Grouping is `policy.id`, paid-vs-free
// is `policy.isDefault`, the label is `policy.name`, and the billing period is
// a unit plus a count the client FORMATS from rather than matches against.
// Nothing here filters on a vocabulary it has to recognise — a plan we don't
// understand still renders, because dropping it takes a purchasable plan off
// the pricing page.

import { apiClient } from "@/services/api";
import type { SubscriptionStatus } from "@/lib/plans";

/** The scheduling policy a user holds — what they receive. This is the tier. */
export interface SubscriptionPolicy {
  id: number;
  name: string;
  scheduleIntervalSeconds: number;
  /** The policy everyone holds without buying anything. "Free", structurally. */
  isDefault: boolean;
}

/**
 * What this person actually bought, read through their billing row.
 *
 * Deliberately not "their policy's current price": someone on a retired or
 * repriced plan still pays what they signed up for, and matching by policy
 * would quote them a price they are not charged. `isActive: false` is how the
 * UI knows to tell them their plan is no longer offered.
 */
export interface SubscriptionPlanRecord {
  amountMinor: number;
  currency: string;
  isActive: boolean;
  billingPeriodUnit: string | null;
  billingPeriodCount: number | null;
}

export interface Subscription {
  /** Null only on an instance with no scheduling policies — a broken install. */
  policy: SubscriptionPolicy | null;
  /** Null when there is no billing row: nobody has bought anything. */
  plan: SubscriptionPlanRecord | null;
  status: SubscriptionStatus;
  /** All three dates come off the row. Nothing here is date arithmetic. */
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  /**
   * ISO timestamp at which a cancellation takes effect, or null if none is
   * scheduled. Flash reports a cancelled-but-still-running subscription as
   * `active` — the subscriber IS still entitled — so this, not `status`, is
   * what separates "renews then" from "ends then".
   */
  cancelEffectiveDate: string | null;
  /** Where the user goes to cancel/manage (Flash's portal today), or null. */
  manageUrl: string | null;
}

/** One row of the pricing picker, as served by public GET /billing/plans. */
export interface BillingPlan {
  policyId: number;
  policyName: string;
  /** Live cadence off the `scheduling` row — the number the picker shows. */
  scheduleIntervalSeconds: number | null;
  isDefault: boolean;
  /** `day | week | month | year | once`, or null. Formatted, never matched. */
  billingPeriodUnit: string | null;
  billingPeriodCount: number | null;
  amountMinor: number;
  currency: string;
  /** Complete except `ref` — the click handler appends `&ref=<pubkey>`. */
  checkoutUrl: string | null;
  /** Admin-editable plan copy. Plain text; rendered escaped, never as markup. */
  blurb: string | null;
  includes: string[] | null;
  excludes: string[] | null;
}

/** The safe default: no policy known, nothing bought, nothing claimed. */
export const DEFAULT_SUBSCRIPTION: Subscription = {
  policy: null,
  plan: null,
  status: "none",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  nextBillingDate: null,
  cancelEffectiveDate: null,
  manageUrl: null,
};

// A closed set the SERVER controls and translates into — unlike a tier, this
// one is ours end to end, so recognising it is safe.
const STATUSES: readonly SubscriptionStatus[] = [
  "none",
  "pending",
  "active",
  "past_due",
  "grace",
  "canceled",
];

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizePolicy(raw: unknown): SubscriptionPolicy | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = num(o.id);
  if (id === null) return null;
  return {
    id,
    name: str(o.name) ?? "Your plan",
    scheduleIntervalSeconds: num(o.schedule_interval_seconds ?? o.scheduleIntervalSeconds) ?? 0,
    isDefault: Boolean(o.is_default ?? o.isDefault),
  };
}

function normalizePlanRecord(raw: unknown): SubscriptionPlanRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    amountMinor: num(o.amount_minor ?? o.amountMinor) ?? 0,
    currency: str(o.currency) ?? "USD",
    // Absent reads as active: telling a subscriber their plan was retired on
    // the strength of a missing field is the wrong direction to guess.
    isActive: (o.is_active ?? o.isActive) === undefined ? true : Boolean(o.is_active ?? o.isActive),
    billingPeriodUnit: str(o.billing_period_unit ?? o.billingPeriodUnit),
    billingPeriodCount: num(o.billing_period_count ?? o.billingPeriodCount),
  };
}

/**
 * Coerce the backend's raw snake_case object into a valid Subscription.
 * Deliberately total: anything unrecognised degrades to "no policy" rather
 * than propagating a bad value into billing copy.
 */
function normalize(raw: unknown): Subscription {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = STATUSES.includes(r.status as SubscriptionStatus)
    ? (r.status as SubscriptionStatus)
    : "none";
  return {
    policy: normalizePolicy(r.policy),
    plan: normalizePlanRecord(r.plan),
    status,
    currentPeriodStart: str(r.current_period_start ?? r.currentPeriodStart),
    currentPeriodEnd: str(r.current_period_end ?? r.currentPeriodEnd),
    nextBillingDate: str(r.next_billing_date ?? r.nextBillingDate),
    cancelEffectiveDate: str(r.cancel_effective_date ?? r.cancelEffectiveDate),
    manageUrl: str(r.manage_url ?? r.manageUrl),
  };
}

/** Fetch the current subscription as the server reports it. */
export async function fetchSubscription(): Promise<Subscription> {
  return normalize(await apiClient.getSubscription());
}

/**
 * Ask the server to re-read Flash NOW and return the result — the redirect
 * landing call and the in-flight poll (handoff A2/A4).
 */
export async function refreshSubscription(): Promise<Subscription> {
  return normalize(await apiClient.refreshSubscription());
}

/**
 * The plans on offer, in the order the server returns them — the client never
 * sorts. An EMPTY array is the "this instance has no billing" signal that
 * hides every entry point (handoff A8).
 */
export async function fetchPlans(): Promise<BillingPlan[]> {
  const raw = await apiClient.getBillingPlans();
  const items = (raw?.plans ?? []) as Array<Record<string, unknown>>;
  return items.map(normalizePlan);
}

/**
 * Total by construction — it can never return null.
 *
 * The old version dropped any row whose `tier` it didn't recognise, which
 * silently took a purchasable plan off the pricing page. There is nothing left
 * to recognise: an unknown policy id, a missing name and an unfamiliar billing
 * period all still render.
 */
function normalizePlan(r: Record<string, unknown> | BillingPlan): BillingPlan {
  const o = r as Record<string, unknown>;
  return {
    policyId: num(o.policy_id ?? o.policyId) ?? -1,
    policyName: str(o.policy_name ?? o.policyName) ?? "Plan",
    scheduleIntervalSeconds: num(o.schedule_interval_seconds ?? o.scheduleIntervalSeconds),
    isDefault: Boolean(o.is_default ?? o.isDefault),
    billingPeriodUnit: str(o.billing_period_unit ?? o.billingPeriodUnit),
    billingPeriodCount: num(o.billing_period_count ?? o.billingPeriodCount),
    amountMinor: num(o.amount_minor ?? o.amountMinor) ?? 0,
    currency: str(o.currency) ?? "USD",
    checkoutUrl: str(o.checkout_url ?? o.checkoutUrl),
    blurb: str(o.blurb),
    includes: strList(o.includes),
    excludes: strList(o.excludes),
  };
}

function strList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const items = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return items.length > 0 ? items : null;
}
