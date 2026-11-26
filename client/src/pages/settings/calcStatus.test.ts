import { describe, expect, it } from "vitest";
import { calcStatusOf, formatCalcTime } from "./calcStatus";

describe("calcStatusOf", () => {
  it("is quiet with nothing loaded", () => {
    expect(calcStatusOf(undefined, undefined)).toEqual({
      isRecalcInProgress: false,
      isGrapeRankFailedState: false,
      grapeRankStatus: null,
      lastCalculated: null,
      lastTriggered: null,
      taPubkey: null,
    });
  });

  it("reads a run waiting on either stage as in progress", () => {
    expect(calcStatusOf({ internal_publication_status: "waiting" }, null).isRecalcInProgress).toBe(true);
    expect(calcStatusOf({ status: "waiting" }, null).isRecalcInProgress).toBe(true);
  });

  it("reads a failure in the run or its assertions, whatever the case", () => {
    expect(calcStatusOf({ status: "FAILURE" }, null).isGrapeRankFailedState).toBe(true);
    expect(calcStatusOf({ status: "success", ta_status: "Failure" }, null).isGrapeRankFailedState).toBe(true);
    expect(calcStatusOf({ status: "success", ta_status: "success" }, null).isGrapeRankFailedState).toBe(false);
  });

  it("prefers the assertions' status and the history's times", () => {
    const run = { status: "success", ta_status: "pending", updated_at: "run-updated", created_at: "run-created" };
    expect(calcStatusOf(run, null)).toMatchObject({
      grapeRankStatus: "pending",
      lastCalculated: "run-updated",
      lastTriggered: "run-created",
    });
    expect(
      calcStatusOf(run, {
        last_time_calculated_graperank: "hist-calc",
        last_time_triggered_graperank: "hist-trig",
        ta_pubkey: "ta",
      }),
    ).toMatchObject({ lastCalculated: "hist-calc", lastTriggered: "hist-trig", taPubkey: "ta" });
  });
});

describe("formatCalcTime", () => {
  it("reads a zoneless server time as UTC", () => {
    expect(formatCalcTime("2026-11-02T10:30:00")).toBe(formatCalcTime("2026-11-02T10:30:00Z"));
    expect(formatCalcTime("2026-11-02T10:30:00Z")).toBe(
      new Date(Date.UTC(2026, 10, 2, 10, 30)).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  });
});
