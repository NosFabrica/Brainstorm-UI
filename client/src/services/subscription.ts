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
 * Which plan this person bought, priced by Flash.
 *
 * Which one is read through their billing row rather than looked up by policy:
 * two plans can sell one policy, and matching by policy would quote a price
 * they are not charged. Everything but `isActive` is Flash's answer about that
 * plan, so all of it is null when the server could not reach Flash — a card
 * that cannot say the price must not therefore say the wrong one.
 *
 * `isActive: false` is ours, and is how the UI knows to tell them their plan
 * is no longer offered.
 *
 * No plan name: what a subscriber is shown is the POLICY they hold, which is
 * what they actually receive.
 */
export interface SubscriptionPlanRecord {
  amountMinor: number | null;
  currency: string | null;
  billingInterval: string | null;
  isActive: boolean;
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
  /**
   * How they pay, in Flash's own word — `lightning`, `card`. FORMATTED, never
   * matched: their set can grow, and a method we don't recognise should still
   * render rather than vanish.
   *
   * Null far more often than not, and every surface renders null as no row at
   * all. Flash publishes no payment method per subscription, so the server can
   * only answer for a plan that accepts exactly one; a plan taking both does
   * not say which one this subscriber used, and nor does a free account, which
   * pays nothing. A guess here would be indistinguishable from a fact.
   */
  paymentMethod: string | null;
}

/**
 * One row of the pricing picker, as served by public GET /billing/plans.
 *
 * Two sources. `policy*` and `isDefault` are the server's own — what buying
 * this actually gets you, off the live scheduling policy. Everything else is
 * Flash's answer about the plan, so nothing here is a transcription anybody
 * has to keep correct.
 */
export interface BillingPlan {
  policyId: number;
  policyName: string;
  /** Live cadence off the `scheduling` row — the number the picker shows. */
  scheduleIntervalSeconds: number | null;
  isDefault: boolean;
  /** Flash's name for the plan. Null on the free row: nothing sells it. */
  planName: string | null;
  /** `daily | weekly | monthly | yearly | one_off`, or null. Formatted, never matched. */
  billingInterval: string | null;
  amountMinor: number;
  currency: string;
  /** Complete except `ref` — the click handler appends `&ref=<pubkey>`. */
  checkoutUrl: string | null;
  /** Flash's plan copy. Plain text; rendered escaped, never as markup. */
  description: string | null;
  features: string[] | null;
  notIncluded: string[] | null;
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
  paymentMethod: null,
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
    // Null, not zero: a price the server could not read is unknown, and a card
    // showing "Free" to someone who is charged is worse than showing nothing.
    amountMinor: num(o.amount_minor ?? o.amountMinor),
    currency: str(o.currency),
    billingInterval: str(o.billing_interval ?? o.billingInterval),
    // Absent reads as active: telling a subscriber their plan was retired on
    // the strength of a missing field is the wrong direction to guess.
    isActive: (o.is_active ?? o.isActive) === undefined ? true : Boolean(o.is_active ?? o.isActive),
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
    paymentMethod: str(r.payment_method ?? r.paymentMethod),
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
    planName: str(o.plan_name ?? o.planName),
    billingInterval: str(o.billing_interval ?? o.billingInterval),
    amountMinor: num(o.amount_minor ?? o.amountMinor) ?? 0,
    currency: str(o.currency) ?? "USD",
    checkoutUrl: str(o.checkout_url ?? o.checkoutUrl),
    description: str(o.description),
    features: strList(o.features),
    notIncluded: strList(o.not_included ?? o.notIncluded),
  };
}

function strList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const items = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return items.length > 0 ? items : null;
}
