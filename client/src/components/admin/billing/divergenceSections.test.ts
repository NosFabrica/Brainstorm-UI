// @vitest-environment node
/**
 * The divergence report's ten sections, as admins should read them. Enes:
 * "these are more about knowing what's happening than acting" — so each
 * section carries its meaning, and the report is read in two tiers: Faults
 * (something is wrong for a paying subscriber) first, For the record below.
 * Sections overlap by design (an exhausted event is also an unresolved
 * signup); the id map lets the exhausted row borrow the signup's handle.
 */
import { describe, expect, it } from "vitest";
import { DIVERGENCE_META, groupSignups, orderedSections, splitExhausted, subscriptionIdsByEventId } from "./divergenceSections";

const section = (rows: Record<string, unknown>[] = [{}]) => ({ count: rows.length, truncated: false, rows });

describe("orderedSections", () => {
  it("puts faults first in their fixed order, then the record, then unknown kinds last", () => {
    const out = orderedSections({
      abandoned_checkouts: section(),
      unmapped_plans: section(),
      policy_mismatch: section(),
      some_future_kind: section(),
      stale_syncs: section(),
      exhausted_events: section(),
    });
    expect(out.map((s) => s.kind)).toEqual(["policy_mismatch", "unmapped_plans", "exhausted_events", "stale_syncs", "abandoned_checkouts", "some_future_kind"]);
    expect(out.map((s) => s.tier)).toEqual(["fault", "fault", "fault", "record", "record", "record"]);
    expect(out.find((s) => s.kind === "some_future_kind")?.meta).toBeNull();
  });

  it("drops empty sections — a zero says nothing", () => {
    const out = orderedSections({ policy_mismatch: { count: 0, truncated: false, rows: [] }, stale_syncs: section() });
    expect(out.map((s) => s.kind)).toEqual(["stale_syncs"]);
  });

  it("every known kind has a title and a plain-language meaning", () => {
    for (const meta of Object.values(DIVERGENCE_META)) {
      expect(meta.title.length).toBeGreaterThan(3);
      expect(meta.meaning.length).toBeGreaterThan(20);
    }
    expect(DIVERGENCE_META.abandoned_checkouts.countLed).toBe(true);
  });
});

describe("subscriptionIdsByEventId", () => {
  it("maps webhook event ids to the Flash subscription id across the signup sections, remembering which", () => {
    const map = subscriptionIdsByEventId({
      unresolved_signups: section([{ id: 14, flash_subscription_id: "sub_a" }, { id: 15, flash_subscription_id: "sub_b" }]),
      unmapped_plans: section([{ id: 42, flash_subscription_id: "sub_c" }, { id: 43, flash_subscription_id: null }]),
      exhausted_events: section([{ id: 14, attempts: 5 }]),
    });
    expect(map.get(14)).toEqual({ subscriptionId: "sub_a", from: "unresolved_signups" });
    // An exhausted event borrowing from Plans not mapped is an identified, paying
    // subscriber — Dismiss cannot succeed there, so the origin has to be kept.
    expect(map.get(42)).toEqual({ subscriptionId: "sub_c", from: "unmapped_plans" });
    expect(map.has(43)).toBe(false);
    expect(map.has(99)).toBe(false);
  });
});

// Enes: "One signup reads as one problem." Two deliveries (started, then
// cancelled) of one nobody's payment are one entry; the attempts the exhausted
// section knows ride the delivery line instead of repeating the row.
describe("groupSignups", () => {
  const rows = [
    { id: 14, event: "subscription.activated", created_at: "2026-09-02T00:00:00Z", process_error: "no_reference", flash_subscription_id: "sub_a" },
    { id: 16, event: "subscription.activated", created_at: "2026-09-01T00:00:00Z", process_error: "no_reference", flash_subscription_id: "sub_b" },
    { id: 15, event: "subscription.canceled", created_at: "2026-09-04T00:00:00Z", process_error: "no_reference", flash_subscription_id: "sub_a" },
    { id: 17, event: "subscription.activated", created_at: null, process_error: "no_reference", flash_subscription_id: null },
  ];
  const exhausted = [{ id: 14, event: "subscription.activated", attempts: 5, process_error: "no_reference" }, { id: 15, event: "subscription.canceled", attempts: 5, process_error: "no_reference" }];
  it("one group per Flash subscription, in order of first appearance; a row with no id stands alone", () => {
    const groups = groupSignups(rows, exhausted);
    expect(groups.map((g) => g.subscriptionId)).toEqual(["sub_a", "sub_b", null]);
    expect(groups[0].deliveries.map((d) => d.id)).toEqual([14, 15]);
    expect(groups[1].deliveries.map((d) => d.id)).toEqual([16]);
    expect(groups[2].deliveries.map((d) => d.id)).toEqual([17]);
  });
  it("a delivery the replay gave up on carries its attempts; one still trying carries none", () => {
    const groups = groupSignups(rows, exhausted);
    expect(groups[0].deliveries.map((d) => d.attempts)).toEqual([5, 5]);
    expect(groups[1].deliveries[0].attempts).toBeUndefined();
  });
});

describe("splitExhausted", () => {
  it("folds the events a signup group already shows; the rest stand alone, with their origin", () => {
    const handles = subscriptionIdsByEventId({
      unresolved_signups: section([{ id: 14, flash_subscription_id: "sub_a" }]),
      unmapped_plans: section([{ id: 42, flash_subscription_id: "sub_c" }]),
    });
    const out = splitExhausted(
      [{ id: 14, event: "e", attempts: 5, process_error: "no_reference" }, { id: 42, event: "e", attempts: 5, process_error: "unknown_plan" }, { id: 99, event: "e", attempts: 5, process_error: "boom" }],
      handles,
    );
    expect(out.folded).toBe(1);
    expect(out.standalone.map((r) => r.id)).toEqual([42, 99]);
  });
});
