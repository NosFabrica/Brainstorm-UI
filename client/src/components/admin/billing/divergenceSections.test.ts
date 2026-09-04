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
import { DIVERGENCE_META, orderedSections, subscriptionIdsByEventId } from "./divergenceSections";

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
  it("maps webhook event ids to the Flash subscription id across the signup sections", () => {
    const map = subscriptionIdsByEventId({
      unresolved_signups: section([{ id: 14, flash_subscription_id: "sub_a" }, { id: 15, flash_subscription_id: "sub_b" }]),
      unmapped_plans: section([{ id: 42, flash_subscription_id: "sub_c" }, { id: 43, flash_subscription_id: null }]),
      exhausted_events: section([{ id: 14, attempts: 5 }]),
    });
    expect(map.get(14)).toBe("sub_a");
    expect(map.get(42)).toBe("sub_c");
    expect(map.has(43)).toBe(false);
    expect(map.has(99)).toBe(false);
  });
});
