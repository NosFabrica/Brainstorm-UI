// @vitest-environment node
/**
 * Concepts asked for in one render go out as one read per reader — the
 * trustSignals pattern, for list items on a results page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = vi.fn();
vi.mock("@/services/dictionary", () => ({ loadDictionary: (...a: unknown[]) => load(...a) }));
vi.mock("@/lib/connection", () => ({ connectionSpeed: () => "normal" }));

import { __resetConceptBatch, resolveConceptBatched } from "./conceptBatch";

const A = `39998:${"a".repeat(64)}:github-accounts`;
const B = `39998:${"b".repeat(64)}:urls`;
const READER = { pubkey: "1".repeat(64), taPubkey: "2".repeat(64) };
const resolvedFor = (c: string) => ({ governing: { coordinate: c } });

beforeEach(() => {
  vi.useFakeTimers();
  __resetConceptBatch();
  load.mockReset();
  load.mockImplementation(async (_reader: unknown, concepts: string[]) =>
    concepts.map((c) => ({ communityCoordinate: c, resolved: resolvedFor(c), inDictionary: false, items: [] })),
  );
});
afterEach(() => vi.useRealTimers());

describe("resolveConceptBatched", () => {
  it("one read for every concept asked in the window", async () => {
    const pa = resolveConceptBatched(READER, A);
    const pb = resolveConceptBatched(READER, B);
    await vi.advanceTimersByTimeAsync(60);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(READER, [A, B], undefined, { items: false });
    expect(await pa).toEqual(resolvedFor(A));
    expect(await pb).toEqual(resolvedFor(B));
  });

  it("the same concept asked twice is asked once", async () => {
    const p1 = resolveConceptBatched(READER, A);
    const p2 = resolveConceptBatched(READER, A);
    expect(p1).toBe(p2);
    await vi.advanceTimersByTimeAsync(60);
    expect(load.mock.calls[0][1]).toEqual([A]);
  });

  it("each reader is read for separately — their copies differ", async () => {
    void resolveConceptBatched(READER, A);
    void resolveConceptBatched({ pubkey: null, taPubkey: null }, A);
    await vi.advanceTimersByTimeAsync(60);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a page that keeps asking still gets answers by the ceiling", async () => {
    void resolveConceptBatched(READER, A);
    for (let i = 0; i < 100; i++) {
      await vi.advanceTimersByTimeAsync(40);
      void resolveConceptBatched(READER, `39998:${"c".repeat(64)}:c-${i}`);
    }
    expect(load).toHaveBeenCalled();
  });

  it("a failed read answers null, not an error", async () => {
    load.mockRejectedValue(new Error("down"));
    const p = resolveConceptBatched(READER, A);
    await vi.advanceTimersByTimeAsync(60);
    expect(await p).toBeNull();
  });
});
