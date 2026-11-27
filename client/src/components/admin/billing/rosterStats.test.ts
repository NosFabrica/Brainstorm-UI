import { describe, expect, it } from "vitest";
import type { AdminBillingDivergenceReport, AdminBillingSubscription } from "@/services/api";
import { subscriptionIdsByEventId } from "./divergenceSections";
import { dismissDeliveryCount, rosterStats } from "./rosterStats";

const sub = (flash_status: string, over: Partial<AdminBillingSubscription> = {}): AdminBillingSubscription => ({
  pubkey: "a".repeat(64),
  flash_status,
  scheduling_source: "billing",
  billing_blocked: false,
  ...over,
});
const section = <R>(rows: R[], count = rows.length) => ({ count, truncated: false, rows });

describe("rosterStats", () => {
  it("counts the page's entitled, past-due, pending and ending subscribers", () => {
    const stats = rosterStats(
      [
        sub("active"),
        sub("trial", { cancel_effective_date: "2026-12-01" }),
        sub("past_due"),
        sub("pending"),
        sub("cancelled", { cancel_effective_date: "2026-01-01" }),
      ],
      {},
      new Map(),
    );
    expect(stats).toEqual({ active: 2, past_due: 1, pending: 1, ending: 1, faults: 0 });
  });

  it("counts the fault tier once: an exhausted event of a listed signup isn't counted again", () => {
    const divergence = {
      unresolved_signups: section([{ id: 7, flash_subscription_id: "sub_1" }]),
      exhausted_events: section([{ id: 7 }, { id: 8 }]),
      stale_syncs: section([{}, {}, {}]),
    } as unknown as AdminBillingDivergenceReport;
    const stats = rosterStats([], divergence, subscriptionIdsByEventId(divergence));
    // 1 signup + 2 exhausted events (one of them the same signup); stale syncs are for the record.
    expect(stats.faults).toBe(2);
  });
});

describe("dismissDeliveryCount", () => {
  const divergence = {
    unresolved_signups: section([
      { id: 1, flash_subscription_id: "sub_1", event: "created" },
      { id: 2, flash_subscription_id: "sub_1", event: "cancelled" },
      { id: 3, flash_subscription_id: "sub_2", event: "created" },
    ]),
  } as unknown as AdminBillingDivergenceReport;

  it("is the deliveries the report lists for that signup, and at least one", () => {
    expect(dismissDeliveryCount(divergence, "sub_1")).toBe(2);
    expect(dismissDeliveryCount(divergence, "sub_2")).toBe(1);
    expect(dismissDeliveryCount(divergence, "sub_9")).toBe(1);
    expect(dismissDeliveryCount(divergence, null)).toBe(1);
  });
});
