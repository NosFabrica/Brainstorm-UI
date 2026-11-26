import { describe, expect, it } from "vitest";
import {
  extractErrorMessage,
  getActivityPipelineState,
  getFailureStage,
  isFailedActivity,
  isFailedStatus,
  isItemFailed,
  normalizeErrorKey,
  pickFailureStage,
} from "./failures";
import type { BrainstormRequestInstance } from "./types";

const run = (over: Partial<BrainstormRequestInstance> = {}): BrainstormRequestInstance => ({
  created_at: "2026-10-22T11:00:00Z",
  updated_at: "2026-10-22T11:05:00Z",
  private_id: 1,
  status: "success",
  ta_status: null,
  internal_publication_status: null,
  error: null,
  count_values: null,
  password: "",
  algorithm: "graperank",
  parameters: "",
  how_many_others_with_priority: 0,
  pubkey: "a".repeat(64),
  trigger_source: null,
  ...over,
});
const warning = { code: "no_follows", message: "no follows", severity: "warning" as const };

describe("isFailedStatus", () => {
  it("knows the backend's three words for failure, in any case", () => {
    expect(["failure", "FAILED", "error"].map(isFailedStatus)).toEqual([true, true, true]);
    expect([null, undefined, "", "success", "waiting"].map(isFailedStatus)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("a run that fails on the user's own graph", () => {
  it("is a warning, not a failure", () => {
    const r = run({ status: "failure", error: warning });
    expect(isFailedActivity(r)).toBe(false);
    expect(isItemFailed(r)).toBe(false);
    expect(getActivityPipelineState(r)).toBe("warning");
  });
});

describe("isItemFailed and getFailureStage", () => {
  it("name the first stage that failed", () => {
    expect(getFailureStage(run({ status: "failed", ta_status: "failed" }))).toBe("Calculation");
    expect(getFailureStage(run({ ta_status: "failed" }))).toBe("Trust Attestation");
    expect(getFailureStage(run({ internal_publication_status: "error" }))).toBe("Publication");
    expect(getFailureStage(run())).toBeNull();
    expect(isItemFailed(run({ internal_publication_status: "error" }))).toBe(true);
    expect(isItemFailed(run())).toBe(false);
  });

  it("pickFailureStage reads the same order from flags", () => {
    expect(pickFailureStage({ statusFailed: false, taFailed: true, pubFailed: true })).toBe("ta");
    expect(pickFailureStage({ statusFailed: false, taFailed: false, pubFailed: false })).toBeNull();
  });
});

describe("getActivityPipelineState", () => {
  it("groups the backend's statuses", () => {
    expect(getActivityPipelineState(run({ status: "ongoing" }))).toBe("active");
    expect(getActivityPipelineState(run({ status: "queued" }))).toBe("waiting");
    expect(getActivityPipelineState(run({ status: "failed" }))).toBe("failed");
    expect(getActivityPipelineState(run())).toBe("complete");
  });
});

describe("extractErrorMessage", () => {
  it("prefers the recorded message, else says which stage had none", () => {
    expect(extractErrorMessage(run({ status: "failed", error: { code: "x", message: "  boom " } }))).toBe("boom");
    expect(extractErrorMessage(run({ ta_status: "failed" }))).toMatch(/Trust Attestation stage/);
    expect(extractErrorMessage(run())).toMatch(/^No error details recorded\./);
  });
});

describe("normalizeErrorKey", () => {
  it("groups messages that differ only in ids and numbers", () => {
    const a = normalizeErrorKey("Timeout for 0xdeadbeef00 after 12345 ms");
    const b = normalizeErrorKey("timeout for 0xfeedface11   after 99999 ms");
    expect(a).toBe(b);
    expect(a).toBe("timeout for <hex> after <n> ms");
  });
});
