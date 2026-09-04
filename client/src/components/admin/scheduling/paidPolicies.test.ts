import { describe, expect, it } from "vitest";
import { paidSchedulingIds } from "./paidPolicies";

describe("paidSchedulingIds", () => {
  it("marks only policies targeted by a mapping we still sell", () => {
    const ids = paidSchedulingIds([
      { scheduling_id: 1, is_active: true },
      { scheduling_id: 3, is_active: false }, // withdrawn from sale
    ]);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(3)).toBe(false);
  });

  it("is empty when there are no mappings (endpoint absent or unconfigured)", () => {
    expect(paidSchedulingIds([]).size).toBe(0);
  });
});
