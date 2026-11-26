import { describe, expect, it } from "vitest";
import type { BrainstormRequestInstance } from "../types";
import { recentFailureGroups } from "./recentFailures";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const HOUR = 3_600_000;
let id = 0;
const run = (minsAgo: number, over: Partial<BrainstormRequestInstance> = {}): BrainstormRequestInstance => ({
  created_at: new Date(NOW - minsAgo * 60_000).toISOString(),
  updated_at: new Date(NOW - minsAgo * 60_000).toISOString(),
  private_id: ++id,
  status: "failed",
  ta_status: null,
  internal_publication_status: null,
  error: { code: "x", message: "Timeout after 12345 ms" },
  count_values: null,
  password: "",
  algorithm: "graperank",
  parameters: "",
  how_many_others_with_priority: 0,
  pubkey: "a".repeat(64),
  trigger_source: null,
  ...over,
});

describe("recentFailureGroups", () => {
  it("groups the window's failures by error and stage, newest pattern first", () => {
    const old = run(30, { pubkey: "b".repeat(64), error: { code: "x", message: "Timeout after 99999 ms" } });
    const newest = run(5);
    const relay = run(10, { status: "success", internal_publication_status: "failed", error: null });
    const { groups, totalFailures } = recentFailureGroups(
      [old, newest, relay, run(90), run(20, { status: "success", error: null })],
      HOUR,
      NOW,
    );
    expect(totalFailures).toBe(3);
    expect(groups.map((g) => [g.count, g.latest.private_id, g.pubkeys.size])).toEqual([
      [2, newest.private_id, 2],
      [1, relay.private_id, 1],
    ]);
  });

  it("keeps the eight most recent patterns", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      run(i + 1, { error: { code: "x", message: `cause ${"z".repeat(i)}` } }),
    );
    expect(recentFailureGroups(items, HOUR, NOW).groups).toHaveLength(8);
  });

  it("leaves out warnings", () => {
    const warning = run(1, { error: { code: "no_follows", message: "no follows", severity: "warning" } });
    expect(recentFailureGroups([warning], HOUR, NOW).totalFailures).toBe(0);
  });
});
