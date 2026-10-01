import { describe, expect, it } from "vitest";
import { networkOfRun, runOf } from "./graperankRun";

describe("runOf", () => {
  const run = { status: "success", internal_publication_status: "success" };

  it("reads the run out of the server's envelope", () => {
    expect(runOf({ code: 200, data: run, message: "ok" })).toBe(run);
  });

  it("reads a bare run as it is", () => {
    expect(runOf(run)).toBe(run);
  });

  it("is null when the server answered with no run, undefined when there is no answer yet", () => {
    expect(runOf({ code: 200, data: null, message: "ok" })).toBeNull();
    expect(runOf(null)).toBeNull();
    expect(runOf(undefined)).toBeUndefined();
  });
});

describe("networkOfRun", () => {
  // The server's shape: tier → hops → count. Above the run's verified line are
  // high, medium_high, medium and medium_low; at or below it, low and flagged.
  const counts = {
    high: { "1": 40, "2": 10 },
    medium_high: { "2": 100 },
    medium: { "2": 300 },
    medium_low: { "2": 800 },
    low: { "2": 900, "3": 84 },
    low_and_reported_by_2_or_more_trusted_pubkeys: { "2": 3 },
  };

  it("counts who came out verified from this point of view, and everyone the run reached", () => {
    expect(networkOfRun(counts)).toEqual({ verified: 1250, reached: 2237 });
    expect(networkOfRun(JSON.stringify(counts))).toEqual({ verified: 1250, reached: 2237 });
  });

  it("is null when the run does not say, or says it in a shape we cannot split", () => {
    expect(networkOfRun("")).toBeNull();
    expect(networkOfRun(null)).toBeNull();
    expect(networkOfRun("not json")).toBeNull();
    expect(networkOfRun({ "1": { a: 5 } })).toBeNull();
  });
});
