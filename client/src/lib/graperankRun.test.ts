import { describe, expect, it } from "vitest";
import { runOf } from "./graperankRun";

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
