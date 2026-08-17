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
}

/** The safe default: everyone is free until something says otherwise. */
export const DEFAULT_SUBSCRIPTION: Subscription = {
  tier: "free",
  status: "active",
  currentPeriodEnd: null,
  rail: null,
};

const MOCK_KEY = "brainstorm_mock_subscription";

const TIERS: readonly TierId[] = ["free", "priority"];
const STATUSES: readonly SubscriptionStatus[] = [
  "none",
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
  return { tier, status, currentPeriodEnd: periodEnd ?? null, rail };
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

/** Cancel — real endpoint when enabled, else mutate the mock. */
export async function cancelSubscription(): Promise<void> {
  if (FEATURES.subscriptionApi) {
    await apiClient.cancelSubscription();
    return;
  }
  setMockSubscription(readMock().tier, "canceled");
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
): void {
  const paid = tier !== "free";
  const sub: Subscription = {
    tier,
    status,
    currentPeriodEnd: paid
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null,
    rail: paid ? "card" : null,
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
