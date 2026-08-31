import { describe, expect, it } from "vitest";
import { paidSchedulingIds } from "./paidPolicies";

describe("paidSchedulingIds", () => {
  it("marks only policies targeted by an active, non-free mapping", () => {
    const ids = paidSchedulingIds([
      { scheduling_id: 1, amount_minor: 200, is_active: true }, // paid
      { scheduling_id: 2, amount_minor: 0, is_active: true }, // free mapping
      { scheduling_id: 3, amount_minor: 200, is_active: false }, // retired plan
    ]);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(false);
    expect(ids.has(3)).toBe(false);
  });

  it("is empty when there are no mappings (endpoint absent or unconfigured)", () => {
    expect(paidSchedulingIds([]).size).toBe(0);
  });
});
