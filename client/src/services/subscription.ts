// The single seam between the subscription UI and its data source.
//
// Until the backend record + Flash webhook sync ship, this runs in MOCK mode
// (localStorage), so the whole pricing/billing surface is buildable and
// demo-able with zero backend. `VITE_FEATURE_SUBSCRIPTION_API=true` routes to
// the real `/user/subscription` endpoint instead. Nothing else in the app
// changes when that flips — this file is the only swap point.
//
// ## The rule this file exists to enforce
//
// The UI never decides who has paid; it asks. What a paying account actually
// gets is a scheduling policy applied server-side (see
// docs/payments/FLASH-INTEGRATION.md), so this is a *report* of state, not the
// state itself. That is why every failure path below resolves to the free tier
// rather than throwing: a backend hiccup must never read as "paid", and equally
// must never strip anything from someone who is — their policy is unaffected by
// whatever this function returns.

import { apiClient } from "@/services/api";
import { FEATURES } from "@/config/featureFlags";
import type { TierId, SubscriptionStatus, Rail } from "@/lib/plans";

export interface Subscription {
  tier: TierId;
  status: SubscriptionStatus;
  /** ISO timestamp of the next renewal, or null on the free tier. */
  currentPeriodEnd: string | null;
  rail: Rail | null;
  /** Where the user goes to cancel/manage (Flash's portal today), or null. */
  manageUrl: string | null;
}

/** One purchasable (or free) plan, as served by public GET /billing/plans. */
export interface BillingPlan {
  tier: TierId;
  name: string;
  amountMinor: number;
  currency: string;
  /** Live cadence off the `scheduling` row — the number the pricing page shows. */
  scheduleIntervalSeconds: number | null;
  /** Complete except `ref` — the click handler appends `&ref=<pubkey>`. Null on free. */
  checkoutUrl: string | null;
}

/** The safe default: everyone is free until something says otherwise. */
export const DEFAULT_SUBSCRIPTION: Subscription = {
  tier: "free",
  status: "active",
  currentPeriodEnd: null,
  rail: null,
  manageUrl: null,
};

const MOCK_KEY = "brainstorm_mock_subscription";

const TIERS: readonly TierId[] = ["free", "priority"];
const STATUSES: readonly SubscriptionStatus[] = [
  "none",
  "pending",
  "active",
  "past_due",
  "grace",
  "canceled",
];
const RAILS: readonly Rail[] = ["card", "flash-lightning"];

/**
 * Coerce a raw object — snake_case from the backend, or camelCase from the mock
 * — into a valid Subscription. Deliberately total: anything unrecognised
 * degrades to the free tier rather than propagating a bad value into gating or
 * billing copy.
 */
function normalize(raw: unknown): Subscription {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tier = TIERS.includes(r.tier as TierId) ? (r.tier as TierId) : "free";
  const status = STATUSES.includes(r.status as SubscriptionStatus)
    ? (r.status as SubscriptionStatus)
    : "active";
  const periodEnd = (r.current_period_end ?? r.currentPeriodEnd) as string | null | undefined;
  const rail = RAILS.includes(r.rail as Rail) ? (r.rail as Rail) : null;
  const manageUrl = (r.manage_url ?? r.manageUrl) as string | null | undefined;
  return { tier, status, currentPeriodEnd: periodEnd ?? null, rail, manageUrl: typeof manageUrl === "string" && manageUrl ? manageUrl : null };
}

function readMock(): Subscription {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (!raw) return DEFAULT_SUBSCRIPTION;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_SUBSCRIPTION;
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
  setMockSubscription(readMock().tier, "canceled");
}

const MOCK_PLANS_KEY = "brainstorm_mock_plans";

/**
 * The plans on offer. Real mode asks the public endpoint; an EMPTY array is
 * the "this instance has no billing" signal that hides every entry point
 * (handoff A8). Mock mode serves the documented two-plan shape — override by
 * setting localStorage `brainstorm_mock_plans` to a JSON array (e.g. `[]` to
 * rehearse the self-hosted, no-billing state).
 */
export async function fetchPlans(): Promise<BillingPlan[]> {
  if (FEATURES.subscriptionApi) {
    const raw = await apiClient.getBillingPlans();
    const items = (raw?.plans ?? []) as Array<Record<string, unknown>>;
    return items
      .map((r) => normalizePlan(r))
      .filter((pl): pl is BillingPlan => pl !== null);
  }
  try {
    const raw = localStorage.getItem(MOCK_PLANS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizePlan).filter((pl): pl is BillingPlan => pl !== null);
    }
  } catch { /* fall through to defaults */ }
  // The mock's checkout_url points at the REAL Flash dev vault (the ids the
  // deleted VITE_FLASH_PRIORITY_CARD carried), so clicking through shows the
  // actual signup page instead of a dead placeholder domain. CAUTION: there is
  // no Flash sandbox — completing THIS page charges a real card. The
  // redirect_uri here is an approximation; the registered one (and therefore a
  // working redirect) arrives with the server's /billing/plans.
  return [
    { tier: "free", name: "Free", amountMinor: 0, currency: "USD", scheduleIntervalSeconds: 60 * 86_400, checkoutUrl: null },
    {
      tier: "priority", name: "Priority", amountMinor: 200, currency: "USD",
      scheduleIntervalSeconds: 7 * 86_400,
      checkoutUrl:
        "https://dev.server.vault.paywithflash.com/subscriptions/signup/019eb7e1-c789-731e-9c9a-e84e83500097/01a039cc-105d-7608-a9f0-6725aaae9933?redirect_uri=" +
        encodeURIComponent(window.location.origin + "/billing/return"),
    },
  ];
}

function normalizePlan(r: Record<string, unknown> | BillingPlan): BillingPlan | null {
  const o = r as Record<string, unknown>;
  const tier = (o.tier === "free" || o.tier === "priority") ? (o.tier as TierId) : null;
  if (!tier) return null;
  const seconds = (o.schedule_interval_seconds ?? o.scheduleIntervalSeconds) as number | undefined;
  const checkout = (o.checkout_url ?? o.checkoutUrl) as string | null | undefined;
  return {
    tier,
    name: typeof o.name === "string" ? o.name : tier,
    amountMinor: typeof (o.amount_minor ?? o.amountMinor) === "number" ? ((o.amount_minor ?? o.amountMinor) as number) : 0,
    currency: typeof o.currency === "string" ? o.currency : "USD",
    scheduleIntervalSeconds: typeof seconds === "number" && Number.isFinite(seconds) ? seconds : null,
    checkoutUrl: typeof checkout === "string" && checkout ? checkout : null,
  };
}

// --- Dev / QA helpers (mock mode only) ---------------------------------------

/**
 * Set the mock so QA can flip tiers and watch billing follow. Paid gets a
 * ~30-day period end on the card rail, matching what a real first payment
 * produces. A no-op in practice when the real API flag is on — the mock is
 * simply never read.
 */
export function setMockSubscription(
  tier: TierId,
  status: SubscriptionStatus = "active",
  rail: Rail = "card",
): void {
  const paid = tier !== "free";
  const sub: Subscription = {
    tier,
    status,
    currentPeriodEnd: paid
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null,
    rail: paid ? rail : null,
    // A fake portal so the cancel-follows-manage_url flow is demoable.
    manageUrl: paid ? "https://flash.example/portal/mock" : null,
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
