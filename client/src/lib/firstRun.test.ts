/**
 * Who the first run is offered to: an account new to Brainstorm — its scores
 * never calculated, however it signed in — once. An account already using
 * Brainstorm is never sent there.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { isFirstRunDone, markFirstRunDone, needsFirstRun } from "./firstRun";

const ME = "a".repeat(64);

describe("needsFirstRun", () => {
  it("offers it to an account new to Brainstorm: its scores were never calculated", () => {
    expect(needsFirstRun({ done: false, everCalculated: false })).toBe(true);
  });

  // However it signed in, made here or with a key: before today nobody had a
  // first run, so "made here" alone would send every existing user through it.
  it("never to an account already using Brainstorm, nor on a guess before the server answers", () => {
    expect(needsFirstRun({ done: false, everCalculated: true })).toBe(false);
    expect(needsFirstRun({ done: false, everCalculated: undefined })).toBe(false);
  });

  it("only once: finished or skipped, it isn't offered again", () => {
    expect(needsFirstRun({ done: true, everCalculated: false })).toBe(false);
  });
});

describe("the first-run mark", () => {
  beforeEach(() => localStorage.clear());

  it("is per account", () => {
    markFirstRunDone(ME);
    expect(isFirstRunDone(ME)).toBe(true);
    expect(isFirstRunDone("b".repeat(64))).toBe(false);
    expect(isFirstRunDone(null)).toBe(false);
  });
});
