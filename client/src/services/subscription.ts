// The single seam between the subscription UI and its data source.
//
// Until the backend subscription record + Flash webhook sync ship, this runs in
// MOCK mode (localStorage), so the entire pricing/billing/gating UI is buildable
// and QA-able with zero backend. Flip VITE_FEATURE_SUBSCRIPTION_API on to route
// to the real `/user/subscription` endpoint instead. Nothing else in the app
// needs to change when that flag flips — this file is the only swap point.

import { apiClient } from "@/services/api";
import { FEATURES } from "@/config/featureFlags";
import type { TierId, SubscriptionStatus, Rail } from "@/lib/plans";

export interface Subscription {
  tier: TierId;
  status: SubscriptionStatus;
  /** ISO timestamp of the next renewal, or null for the free tier. */
  currentPeriodEnd: string | null;
  rail: Rail | null;
}

/** The safe default: everyone is on the free Grapevine tier. */
export const DEFAULT_SUBSCRIPTION: Subscription = {
  tier: "grapevine",
  status: "active",
  currentPeriodEnd: null,
  rail: null,
};

const MOCK_KEY = "brainstorm_mock_subscription";

function readMock(): Subscription {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (!raw) return DEFAULT_SUBSCRIPTION;
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    return DEFAULT_SUBSCRIPTION;
  }
}

/** Coerce a raw (snake_case backend or mock) object into a valid Subscription. */
function normalize(raw: unknown): Subscription {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tier = (["grapevine", "sovereign", "guardian"] as const).includes(r.tier as TierId)
    ? (r.tier as TierId)
    : "grapevine";
  const status = (["none", "active", "past_due", "grace", "canceled"] as const).includes(
    r.status as SubscriptionStatus,
  )
    ? (r.status as SubscriptionStatus)
    : "active";
  const periodEnd = (r.current_period_end ?? r.currentPeriodEnd) as string | null | undefined;
  const rail = (["flash-lightning", "card"] as const).includes(r.rail as Rail)
    ? (r.rail as Rail)
    : null;
  return {
    tier,
    status,
    currentPeriodEnd: periodEnd ?? null,
    rail,
  };
}

/** Fetch the current subscription — real endpoint when enabled, else the mock. */
export async function fetchSubscription(): Promise<Subscription> {
  if (FEATURES.subscriptionApi) {
    const raw = await apiClient.getSubscription();
    return normalize(raw);
  }
  return readMock();
}

/** Cancel the subscription — real endpoint when enabled, else mutate the mock. */
export async function cancelSubscription(): Promise<void> {
  if (FEATURES.subscriptionApi) {
    await apiClient.cancelSubscription();
    return;
  }
  const current = readMock();
  setMockSubscription(current.tier, "canceled");
}

// --- Dev / QA helpers (mock mode only) ---------------------------------------

/**
 * Set the mock subscription so QA can flip tiers and watch gating + billing
 * update. Paid tiers get an ~30-day period end on the Lightning rail. No-op
 * behavior is fine when the real API flag is on (mock is simply ignored).
 */
export function setMockSubscription(tier: TierId, status: SubscriptionStatus = "active"): void {
  const paid = tier !== "grapevine";
  const sub: Subscription = {
    tier,
    status,
    currentPeriodEnd: paid ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    rail: paid ? "flash-lightning" : null,
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
