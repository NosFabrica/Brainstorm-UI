// @vitest-environment node
/**
 * The web of trust step before a paper: what the reader is waiting for, or what to do,
 * from the assistant the server minted, whether search ranks through it, and the scoring
 * status. Having an assistant is not having scores: it is minted at sign-in.
 */
import { describe, expect, it } from "vitest";
import { wotStepOf } from "./setupSteps";

describe("the web of trust step", () => {
  it("is set up first, before anything else is asked", () => {
    expect(wotStepOf({ hasAssistant: false, ranked: false, scoring: "ready" })).toEqual({
      state: "todo",
      why: "setup",
    });
  });

  it("is done once search ranks through the reader's assistant", () => {
    expect(wotStepOf({ hasAssistant: true, ranked: true, scoring: "idle" })).toEqual({ state: "done" });
  });

  it("says what it is waiting for while scores are on their way", () => {
    expect(wotStepOf({ hasAssistant: true, ranked: false, scoring: "calculating" })).toEqual({
      state: "pending",
      phase: "calculating",
    });
    expect(wotStepOf({ hasAssistant: true, ranked: false, scoring: "publishing" })).toEqual({
      state: "pending",
      phase: "publishing",
    });
    // Published, but the search relay hasn't picked them up yet.
    expect(wotStepOf({ hasAssistant: true, ranked: false, scoring: "ready" })).toEqual({
      state: "pending",
      phase: "indexing",
    });
  });

  it("asks for a calculation that never ran, or one that failed, rather than waiting forever", () => {
    expect(wotStepOf({ hasAssistant: true, ranked: false, scoring: "idle" })).toEqual({
      state: "todo",
      why: "uncalculated",
    });
    expect(wotStepOf({ hasAssistant: true, ranked: false, scoring: "failed" })).toEqual({
      state: "todo",
      why: "failed",
    });
  });
});
