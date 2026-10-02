/**
 * The Connection page's policy over a Path network, with no React and no
 * fetch in it: how many paths there are, which accounts are risky and how
 * many paths run through them, and the safest-first order of the paths.
 */
import { describe, expect, it } from "vitest";
import { countPaths, firstRiskyIndex, networkJudged, pathAt, riskyAccounts, type PathNetwork } from "./hopsPaths";

const ME = "a".repeat(64);
const T = "f".repeat(64);
const C1 = "1".repeat(64);
const C2 = "2".repeat(64);
const C3 = "3".repeat(64);
const C4 = "4".repeat(64);
const C5 = "5".repeat(64);

/** Signals as the hooks hand them: `undefined` not landed, `null` unrated. */
const signals = (
  scores: Record<string, number | null | undefined>,
  flags: Record<string, boolean | undefined> = {},
) => ({
  scoreOf: (pk: string) => scores[pk],
  flaggedOf: (pk: string) => flags[pk],
});
const clean = { [ME]: 0.9, [C1]: 0.3, [C2]: 0.05, [C3]: 0.2, [T]: 0.4 };

/**
 * The PRD's diamond: you → {C1, C2, C3} → {C4, C5} → T, where C1 and C2 reach
 * both C4 and C5 and C3 reaches only C5. Five paths; three run through C5.
 */
const diamond: PathNetwork = {
  from: ME,
  to: T,
  layers: [
    [C1, C2, C3],
    [C4, C5],
  ],
  links: [[[0, 1], [0, 1], [1]]],
};

describe("countPaths", () => {
  it("counts every walk through the network", () => {
    expect(countPaths(diamond)).toBe(5);
  });

  it("one hop is one path; two hops is one path per connector", () => {
    expect(countPaths({ from: ME, to: T, layers: [], links: [] })).toBe(1);
    expect(countPaths({ from: ME, to: T, layers: [[C1, C2, C3]], links: [] })).toBe(3);
  });
});

describe("firstRiskyIndex", () => {
  it("the first flagged or unverified connector in walk order; -1 when none", () => {
    expect(firstRiskyIndex([ME, C1, C3, T], signals(clean))).toBe(-1);
    expect(firstRiskyIndex([ME, C1, C2, T], signals({ ...clean, [C2]: 0.01 }))).toBe(2);
    expect(firstRiskyIndex([ME, C1, C2, T], signals({ ...clean, [C1]: null }, { [C2]: true }))).toBe(1);
  });

  it("never judges the origin or the target", () => {
    expect(firstRiskyIndex([ME, C1, T], signals({ ...clean, [T]: null }, { [ME]: true }))).toBe(-1);
  });
});

describe("riskyAccounts", () => {
  const scored = { [C1]: 0.3, [C2]: 0.2, [C3]: 0.25, [C4]: 0.4, [C5]: 0.5 };

  it("names each flagged connector with the paths through it, and the paths through any of them", () => {
    const r = riskyAccounts(diamond, "flagged", signals(scored, { [C5]: true }));
    expect(r.accounts).toEqual([{ pubkey: C5, hop: 2, paths: 3 }]);
    expect(r.paths).toBe(3);
  });

  it("orders the most paths first, then the nearest hop — and never counts a path twice", () => {
    // C1 and C4 each sit on two paths (C1→C4, C1→C5 / C1→C4, C2→C4); C1 is nearer.
    const r = riskyAccounts(diamond, "flagged", signals(scored, { [C1]: true, [C4]: true, [C3]: true }));
    expect(r.accounts.map((a) => a.pubkey)).toEqual([C1, C4, C3]);
    expect(r.paths).toBe(4); // C1→C4, C1→C5, C2→C4, C3→C5
  });

  it("unverified is its own group: under the line or unrated", () => {
    const r = riskyAccounts(diamond, "unverified", signals({ ...scored, [C3]: 0.01, [C4]: null }));
    expect(r.accounts.map((a) => a.pubkey)).toEqual([C4, C3]);
    expect(r.paths).toBe(3);
  });

  it("nothing risky: no accounts, no paths", () => {
    expect(riskyAccounts(diamond, "flagged", signals(scored))).toEqual({ accounts: [], paths: 0 });
  });
});

describe("pathAt — safest first, one path at a time", () => {
  const scored = { [C1]: 0.3, [C2]: 0.2, [C3]: 0.25, [C4]: 0.4, [C5]: 0.5 };
  const all = (s: ReturnType<typeof signals>, through?: string) =>
    Array.from({ length: through ? 3 : 5 }, (_, k) => pathAt(diamond, s, k, through)?.slice(1, -1));

  it("verified paths first, the strongest weakest link leading; flagged last", () => {
    expect(all(signals(scored, { [C5]: true }))).toEqual([
      [C1, C4], // weakest 0.3
      [C2, C4], // weakest 0.2
      [C1, C5], // flagged, weakest 0.3
      [C3, C5], // flagged, weakest 0.25
      [C2, C5], // flagged, weakest 0.2
    ]);
  });

  it("unverified sits between verified and flagged, and fewer risky connectors come first", () => {
    const s = signals({ ...scored, [C3]: 0.01, [C4]: 0.01 }, { [C5]: true });
    expect(all(s)).toEqual([
      [C1, C4], // unverified (C4)
      [C2, C4],
      [C1, C5], // flagged, one risky connector
      [C2, C5],
      [C3, C5], // flagged, two risky connectors
    ]);
  });

  it("inside a group, fewer flagged connectors before fewer unverified ones", () => {
    // C1→C5: flagged C5 + unverified C1. C2→C5... C3→C5: C3 and C5 both flagged.
    const s = signals({ ...scored, [C1]: 0.01 }, { [C3]: true, [C5]: true, [C4]: true });
    const flaggedTwice = [C3, C5];
    const flaggedAndUnverified = [C1, C5];
    const order = all(s);
    expect(order.findIndex((p) => p?.join() === flaggedAndUnverified.join())).toBeLessThan(
      order.findIndex((p) => p?.join() === flaggedTwice.join()),
    );
  });

  it("ends with both ends, and is past the end once every path is out", () => {
    const s = signals(scored);
    expect(pathAt(diamond, s, 0)).toEqual([ME, C1, C4, T]);
    expect(pathAt(diamond, s, 5)).toBeUndefined();
  });

  it("through an account: only the paths through it, in the same order", () => {
    const s = signals(scored, { [C5]: true });
    expect(pathAt(diamond, s, 0, C5)).toEqual([ME, C1, C5, T]);
    expect(pathAt(diamond, s, 0, C3)).toEqual([ME, C3, C5, T]);
    expect(pathAt(diamond, s, 1, C3)).toBeUndefined();
  });

  it("before any signal lands, pubkey order — the same answer every time", () => {
    expect(all(signals({}))).toEqual([
      [C1, C4],
      [C1, C5],
      [C2, C4],
      [C2, C5],
      [C3, C5],
    ]);
  });

  it("one and two hops", () => {
    const s = signals(scored);
    expect(pathAt({ from: ME, to: T, layers: [], links: [] }, s, 0)).toEqual([ME, T]);
    expect(pathAt({ from: ME, to: T, layers: [[C2, C1]], links: [] }, s, 0)).toEqual([ME, C1, T]);
  });
});

describe("networkJudged", () => {
  it("only once every connector's signal has landed — a flag decides on its own", () => {
    const scored = { [C1]: 0.3, [C2]: 0.2, [C3]: 0.25, [C4]: 0.4 };
    expect(networkJudged(diamond, signals(scored))).toBe(false);
    expect(networkJudged(diamond, signals(scored, { [C5]: true }))).toBe(true);
    expect(networkJudged(diamond, signals({ ...scored, [C5]: null }))).toBe(true);
    expect(networkJudged({ from: ME, to: T, layers: [], links: [] }, signals({}))).toBe(true);
  });
});
