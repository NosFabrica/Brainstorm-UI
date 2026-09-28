/**
 * The Connection page's policy for a set of follow-paths, with no React and
 * no fetch in it: which paths are the same, what a path's risk is, how the
 * groups order, and how far to sample when the server hands back one random
 * path at a time. The team (2026-09-24): surface paths that run through a
 * flagged or unverified account so a reader can spot a bad actor inside
 * their trust network; Benjamin: keep it simple to understand.
 */
import { describe, expect, it, vi } from "vitest";
import { classifyPath, dedupePaths, groupPaths, orderedPaths, pathKey } from "./hopsPaths";

const ME = "a".repeat(64);
const T = "f".repeat(64);
const C1 = "1".repeat(64);
const C2 = "2".repeat(64);
const C3 = "3".repeat(64);

/** Signals as the hooks hand them: `undefined` not landed, `null` unrated. */
const signals = (scores: Record<string, number | null | undefined>, flags: Record<string, boolean | undefined> = {}) => ({
  scoreOf: (pk: string) => scores[pk],
  flaggedOf: (pk: string) => flags[pk],
});
const clean = { [ME]: 0.9, [C1]: 0.3, [C2]: 0.05, [C3]: 0.2, [T]: 0.4 };

describe("dedupePaths", () => {
  it("keeps one of each path, in the order first seen", () => {
    expect(dedupePaths([[ME, C1, T], [ME, C2, T], [ME, C1, T]])).toEqual([[ME, C1, T], [ME, C2, T]]);
    expect(pathKey([ME, C1, T])).toBe(`${ME},${C1},${T}`);
  });
});

describe("classifyPath", () => {
  it("a path whose connectors are all known, unflagged and over the line is verified", () => {
    expect(classifyPath([ME, C1, C3, T], signals(clean))).toEqual({ risk: "verified", riskyIndex: -1, riskyCount: 0 });
    // A direct follow has no connector to judge.
    expect(classifyPath([ME, T], signals(clean))).toEqual({ risk: "verified", riskyIndex: -1, riskyCount: 0 });
  });

  it("a connector under the verified line, or unrated, makes the path unverified", () => {
    expect(classifyPath([ME, C1, C2, T], signals({ ...clean, [C2]: 0.01 }))).toEqual({ risk: "unverified", riskyIndex: 2, riskyCount: 1 });
    expect(classifyPath([ME, C1, C2, T], signals({ ...clean, [C1]: null, [C2]: 0.0 }))).toEqual({ risk: "unverified", riskyIndex: 1, riskyCount: 2 });
  });

  it("a flagged connector makes the path flagged — decisive even while another node is still loading; the first risky node in walk order is the one to point at", () => {
    expect(classifyPath([ME, C1, C2, T], signals({ ...clean, [C1]: undefined }, { [C2]: true }))).toEqual({ risk: "flagged", riskyIndex: 2, riskyCount: 1 });
    expect(classifyPath([ME, C1, C2, T], signals({ ...clean, [C1]: 0.001 }, { [C2]: true }))).toEqual({ risk: "flagged", riskyIndex: 1, riskyCount: 2 });
  });

  it("is still checking while a connector's signal has not landed and nothing is flagged", () => {
    expect(classifyPath([ME, C1, C2, T], signals({ ...clean, [C2]: undefined })).risk).toBe("checking");
    // A landed score with no flag word is a landed verdict: both come from one batch.
    expect(classifyPath([ME, C1, C2, T], signals(clean, { [C1]: undefined, [C2]: undefined })).risk).toBe("verified");
  });

  it("never judges the origin or the target", () => {
    expect(classifyPath([ME, C1, T], signals({ ...clean, [T]: null }, { [ME]: true })).risk).toBe("verified");
  });
});

describe("groupPaths and orderedPaths", () => {
  it("buckets by risk, orders a bucket by how many risky nodes then first seen, and lays the groups out verified → unverified → flagged", () => {
    const s = signals({ ...clean, [C2]: 0.01, [C3]: 0.005 }, { [C1]: true });
    const paths = [[ME, C1, T], [ME, C2, C3, T], [ME, C3, T], [ME, ME, T]];
    const g = groupPaths(paths, (p) => classifyPath(p, s));
    expect(g.flagged).toEqual([[ME, C1, T]]);
    expect(g.unverified).toEqual([[ME, C3, T], [ME, C2, C3, T]]); // one risky node before two
    expect(g.verified).toEqual([[ME, ME, T]]);
    expect(g.checking).toEqual([]);
    expect(orderedPaths(g)).toEqual([[ME, ME, T], [ME, C3, T], [ME, C2, C3, T], [ME, C1, T]]);
  });
});

/**
 * The server hands back one random shortest path per call. Until it returns
 * the list it already computes, the page samples: a few calls, de-duplicated,
 * stopping early when there is nothing more to learn.
 */
import { samplePaths } from "./hopsPaths";

const head = (path: string[], pathCount: number, extra: Partial<import("@/services/api/users").ShortestPath> = {}) =>
  ({ from: ME, to: T, reachable: true, hops: path.length - 1, path, pathCount, pathCountCapped: false, maxHops: 6, ...extra });

describe("samplePaths", () => {
  it("asks nothing more when there is only one path", async () => {
    const fetchOne = vi.fn();
    expect(await samplePaths(head([ME, C1, T], 1), fetchOne)).toEqual({ paths: [[ME, C1, T]], calls: 0, complete: true });
    expect(fetchOne).not.toHaveBeenCalled();
  });

  it("takes the server's list when it sends one, de-duplicated, and asks nothing more", async () => {
    const fetchOne = vi.fn();
    const h = head([ME, C1, T], 19, { paths: [[ME, C1, T], [ME, C2, T], [ME, C1, T]] });
    expect(await samplePaths(h, fetchOne)).toEqual({ paths: [[ME, C1, T], [ME, C2, T]], calls: 0, complete: true });
    expect(fetchOne).not.toHaveBeenCalled();
  });

  it("stops once every path is in hand — a wave never asks for more than are left", async () => {
    const answers = [[ME, C2, T], [ME, C3, T]];
    const fetchOne = vi.fn(async () => head(answers[fetchOne.mock.calls.length - 1] ?? [ME, C1, T], 3));
    const r = await samplePaths(head([ME, C1, T], 3), fetchOne);
    expect(r.paths).toEqual([[ME, C1, T], [ME, C2, T], [ME, C3, T]]);
    expect(r.complete).toBe(true);
    expect(fetchOne).toHaveBeenCalledTimes(2); // 3 paths, 1 in hand: at most 2 more
  });

  it("gives up after the budget when the server keeps repeating itself, and says so", async () => {
    const fetchOne = vi.fn(async () => head([ME, C1, T], 19));
    const r = await samplePaths(head([ME, C1, T], 19), fetchOne, { maxCalls: 7, wave: 3 });
    expect(r).toEqual({ paths: [[ME, C1, T]], calls: 6, complete: false });
  });

  it("chases a small set until every path is seen, well past the old seven calls", async () => {
    // Benjamin (2026-09-24), on "We checked 5 of the 9": what's up with the other 4?
    const answers = ["2", "3", "4", "5", "6", "7", "8", "9"].map((c) => [ME, c.repeat(64), T]);
    const fetchOne = vi.fn(async () => head(answers[fetchOne.mock.calls.length - 1], 9));
    const r = await samplePaths(head([ME, C1, T], 9), fetchOne);
    expect(r.paths).toHaveLength(9);
    expect(r).toMatchObject({ calls: 8, complete: true });
  });

  it("keeps drawing on a small set until the budget is spent — a server that repeats itself cannot stop it early", async () => {
    const fetchOne = vi.fn(async () => head([ME, C1, T], 9));
    const r = await samplePaths(head([ME, C1, T], 9), fetchOne);
    expect(r).toEqual({ paths: [[ME, C1, T]], calls: 35, complete: false });
  });

  it("keeps the short budget for a large set — a hundred-odd paths are never chased", async () => {
    let n = 1;
    const fetchOne = vi.fn(async () => head([ME, String(n++).padStart(64, "0"), T], 119));
    const r = await samplePaths(head([ME, C1, T], 119), fetchOne);
    expect(r).toMatchObject({ calls: 6, complete: false });
    expect(r.paths).toHaveLength(7);
  });

  it("drops a sample that failed and keeps the rest", async () => {
    let n = 0;
    const fetchOne = vi.fn(async () => { n++; if (n === 2) throw new Error("relay hiccup"); return head(n === 1 ? [ME, C2, T] : [ME, C3, T], 3); });
    const r = await samplePaths(head([ME, C1, T], 3), fetchOne);
    expect(r.paths).toEqual([[ME, C1, T], [ME, C2, T], [ME, C3, T]]);
    expect(r.complete).toBe(true);
  });
});
