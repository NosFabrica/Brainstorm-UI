// @vitest-environment node
import { describe, expect, it } from "vitest";
import { capMap, capSet, capSettledMemo, sweepMap } from "./boundedMap";

describe("bounded session memos", () => {
  it("capMap and capSet forget the oldest first", () => {
    const map = new Map([1, 2, 3, 4].map((n) => [n, n]));
    capMap(map, 2);
    expect([...map.keys()]).toEqual([3, 4]);
    const set = new Set([1, 2, 3]);
    capSet(set, 1);
    expect([...set]).toEqual([3]);
  });

  it("sweepMap drops what has expired before capping", () => {
    const map = new Map([
      ["old", 5],
      ["live", 50],
    ]);
    sweepMap(map, (until) => until, 10, 10);
    expect([...map.keys()]).toEqual(["live"]);
  });

  it("capSettledMemo never drops a key still waiting", () => {
    const pending = new Map<string, unknown>([
      ["waiting", 1],
      ["a", 1],
      ["b", 1],
    ]);
    const settled = new Map<string, unknown>([
      ["a", 1],
      ["b", 1],
    ]);
    capSettledMemo(pending, settled, 1);
    expect(pending.has("waiting")).toBe(true);
    expect([...settled.keys()]).toEqual([]);
    expect([...pending.keys()]).toEqual(["waiting"]);
  });
});
