import { describe, expect, it } from "vitest";
import { readinessOf } from "./readiness";

// Lists come from the observer's own Ranks: until a calculation has succeeded,
// nobody qualifies and a publish comes back empty. Read the admin user row the
// way the Users tab does.
describe("readinessOf", () => {
  it.each([
    ["no account row", null, "never"],
    ["a row never calculated", { times_calculated: 0, latest_status: null, last_updated: null }, "never"],
    ["a successful calculation", { times_calculated: 3, latest_status: "success", last_updated: "2026-09-15T10:00:00Z" }, "ready"],
    ["a failed calculation", { times_calculated: 2, latest_status: "failure", last_updated: "2026-09-15T10:00:00Z" }, "failed"],
    ["an errored calculation", { times_calculated: 2, latest_status: "error", last_updated: null }, "failed"],
    ["a calculation still running", { times_calculated: 1, latest_status: "pending", last_updated: null }, "pending"],
  ] as const)("reads %s", (_label, row, kind) => {
    expect(readinessOf(row).kind).toBe(kind);
  });
});
