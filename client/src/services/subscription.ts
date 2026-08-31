// The single seam between the subscription UI and its data source.
//
// `VITE_FEATURE_SUBSCRIPTION_API=true` routes to the real endpoints; otherwise
// this runs in MOCK mode (localStorage), which is the only free way to see
// `pending`, `grace` and `canceled` — there is no Flash sandbox. That flag
// means mock-vs-real and nothing else: whether an INSTANCE sells anything is
// answered by `/billing/plans` coming back empty, which is a fact rather than
// a claim.
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
import { FEATURES } from "@/config/featureFlags";
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

const MOCK_KEY = "brainstorm_mock_subscription";

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
 * Coerce a raw object — snake_case from the backend, or camelCase from the
 * mock — into a valid Subscription. Deliberately total: anything unrecognised
 * degrades to "no policy" rather than propagating a bad value into billing
 * copy.
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

function readMock(): Subscription {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (!raw) return MOCK_FREE_SUBSCRIPTION;
    return normalize(JSON.parse(raw));
  } catch {
    return MOCK_FREE_SUBSCRIPTION;
  }
}

/** Fetch the current subscription — real endpoint when enabled, else the mock. */
export async function fetchSubscription(): Promise<Subscription> {
  if (FEATURES.subscriptionApi) {
    const raw = await apiClient.getSubscription();
    return normalize(raw);
  }
  return readMock();
}

/**
 * Ask the server to re-read Flash NOW and return the result — the redirect
 * landing call and the in-flight poll (handoff A2/A4). Mock mode just re-reads
 * the mock; the /billing/return page mutates it first so the demo flow works.
 */
export async function refreshSubscription(): Promise<Subscription> {
  if (FEATURES.subscriptionApi) {
    return normalize(await apiClient.refreshSubscription());
  }
  return readMock();
}

/**
 * Cancel, MOCK ONLY. The real path is `subscription.manageUrl` — follow it
 * (handoff A6); there is no cancel API to call, and the old DELETE is gone.
 */
export async function cancelSubscription(): Promise<void> {
  // Cancelling changes WHETHER they're subscribed, not WHAT they were on.
  const current = readMock();
  setMockSubscription(current.policy ? !current.policy.isDefault : false, "canceled");
}

const MOCK_PLANS_KEY = "brainstorm_mock_plans";

// The mock's two policies, shared by the plans array and the mock subscriber so
// the picker can mark the right row by policy id.
const MOCK_FREE_POLICY: SubscriptionPolicy = {
  id: 1,
  name: "Free",
  scheduleIntervalSeconds: 60 * 86_400,
  isDefault: true,
};
const MOCK_PAID_POLICY: SubscriptionPolicy = {
  id: 2,
  name: "Priority",
  scheduleIntervalSeconds: 7 * 86_400,
  isDefault: false,
};

/** Mock mode's logged-out/never-paid state: the default policy, nothing bought. */
const MOCK_FREE_SUBSCRIPTION: Subscription = {
  ...DEFAULT_SUBSCRIPTION,
  policy: MOCK_FREE_POLICY,
};

// The mock's checkout_url points at the REAL Priority plan on the Flash dev
// vault (plan 019ef08a…, $2/month, both rails — the launch plan), so testers
// exercise the same checkout the server's /billing/plans will serve.
// CAUTION: there is no Flash sandbox — completing THIS page charges a real
// card or wallet $2. Cheap rehearsals: the Staging-Daily plan
// (01a039cc…, $0.10/day) via a hand-built URL — see
// docs/payments/FLASH-SETUP-CHECKLIST.md. Both localhost:5001 and staging
// redirect_uris are registered with Flash, so the round trip works.
function mockPlans(): BillingPlan[] {
  return [
    {
      policyId: MOCK_FREE_POLICY.id,
      policyName: MOCK_FREE_POLICY.name,
      scheduleIntervalSeconds: MOCK_FREE_POLICY.scheduleIntervalSeconds,
      isDefault: true,
      billingPeriodUnit: null,
      billingPeriodCount: null,
      amountMinor: 0,
      currency: "USD",
      checkoutUrl: null,
      blurb: null,
      includes: null,
      excludes: null,
    },
    {
      policyId: MOCK_PAID_POLICY.id,
      policyName: MOCK_PAID_POLICY.name,
      scheduleIntervalSeconds: MOCK_PAID_POLICY.scheduleIntervalSeconds,
      isDefault: false,
      billingPeriodUnit: "month",
      billingPeriodCount: 1,
      amountMinor: 200,
      currency: "USD",
      checkoutUrl:
        "https://dev.server.vault.paywithflash.com/subscriptions/signup/019eb7e1-c789-731e-9c9a-e84e83500097/019ef08a-3c5f-7228-a15b-4838937045f5?redirect_uri=" +
        encodeURIComponent(window.location.origin + "/billing/return"),
      blurb: null,
      includes: null,
      excludes: null,
    },
  ];
}

/**
 * The plans on offer, in the order the server returns them — the client never
 * sorts. An EMPTY array is the "this instance has no billing" signal that
 * hides every entry point (handoff A8).
 *
 * Mock mode serves the two-row shape above — override by setting localStorage
 * `brainstorm_mock_plans` to a JSON array (e.g. `[]` to rehearse the
 * self-hosted, no-billing state, or three rows to rehearse a yearly plan).
 */
export async function fetchPlans(): Promise<BillingPlan[]> {
  if (FEATURES.subscriptionApi) {
    const raw = await apiClient.getBillingPlans();
    const items = (raw?.plans ?? []) as Array<Record<string, unknown>>;
    return items.map(normalizePlan);
  }
  try {
    const raw = localStorage.getItem(MOCK_PLANS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizePlan);
    }
  } catch { /* fall through to defaults */ }
  return mockPlans();
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

// --- Dev / QA helpers (mock mode only) ---------------------------------------

/**
 * Set the mock so QA can flip between the free policy and a paid one and watch
 * billing follow. Paid gets a ~30-day period. A no-op in practice when the
 * real API flag is on — the mock is simply never read.
 *
 * There is no rail argument any more: Flash's subscription object carries no
 * payment-method field, so nothing outside a demo could ever know, and the
 * contract dropped it rather than shipping a permanently-null one.
 */
export function setMockSubscription(
  paid: boolean,
  status: SubscriptionStatus = "active",
  /** Days until a scheduled cancellation takes effect; null = not cancelling. */
  cancelInDays: number | null = null,
): void {
  const now = Date.now();
  const sub: Subscription = {
    policy: paid ? MOCK_PAID_POLICY : MOCK_FREE_POLICY,
    plan: paid
      ? { amountMinor: 200, currency: "USD", isActive: true, billingPeriodUnit: "month", billingPeriodCount: 1 }
      : null,
    status,
    currentPeriodStart: paid ? new Date(now - 30 * 86_400_000).toISOString() : null,
    currentPeriodEnd: paid ? new Date(now + 30 * 86_400_000).toISOString() : null,
    nextBillingDate: paid ? new Date(now + 30 * 86_400_000).toISOString() : null,
    cancelEffectiveDate:
      paid && cancelInDays !== null
        ? new Date(now + cancelInDays * 86_400_000).toISOString()
        : null,
    // The REAL dev-vault portal, so the manage/cancel demo clicks through to
    // the actual magic-link page (guide §2: portal/{serviceId}).
    manageUrl: paid ? "https://dev.server.vault.paywithflash.com/subscriptions/portal/019eb7e1-c789-731e-9c9a-e84e83500097" : null,
  };
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(sub));
  } catch {
    /* ignore storage failures */
  }
}

export function clearMockSubscription(): void {
  try {
    localStorage.removeItem(MOCK_KEY);
  } catch {
    /* ignore */
  }
}
