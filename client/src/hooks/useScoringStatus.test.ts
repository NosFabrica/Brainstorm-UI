import { describe, expect, it } from "vitest";
import { scoringStatusOf } from "./useScoringStatus";

const fresh = { triggeredRecently: true, hasScores: false };
const returning = { triggeredRecently: false, hasScores: true };
const unscored = { triggeredRecently: false, hasScores: false };

const run = (status: string, internal: string | null, ta: string | null, trigger_source = "manual") => ({
  status,
  internal_publication_status: internal,
  ta_status: ta,
  trigger_source,
});

describe("scoringStatusOf", () => {
  it("is ready once both stages succeeded", () => {
    expect(scoringStatusOf(run("success", "success", "success"), unscored)).toBe("ready");
  });

  it("shows a run this device just triggered, stage by stage", () => {
    expect(scoringStatusOf(undefined, fresh)).toBe("calculating");
    expect(scoringStatusOf(run("waiting", "waiting", "waiting"), fresh)).toBe("calculating");
    expect(scoringStatusOf(run("ongoing", "waiting", "waiting"), fresh)).toBe("calculating");
    expect(scoringStatusOf(run("success", "success", "ongoing"), fresh)).toBe("publishing");
  });

  // The reported bug: scores finished hours ago, but the latest run is the
  // backend's own scheduled refresh, queued — the pill span forever.
  it("keeps a returning account ready while a background refresh is queued or running", () => {
    expect(scoringStatusOf(run("waiting", "waiting", "waiting", "scheduled"), returning)).toBe("ready");
    expect(scoringStatusOf(run("ongoing", "waiting", "waiting", "periodic"), returning)).toBe("ready");
    expect(scoringStatusOf(run("success", "ongoing", "success", "manual"), returning)).toBe("ready");
  });

  it("does not report a background refresh's failure", () => {
    expect(scoringStatusOf(run("failure", "failure", "waiting", "scheduled"), returning)).toBe("ready");
    expect(scoringStatusOf(run("failure", "failure", "waiting", "scheduled"), unscored)).toBe("idle");
  });

  it("does not spin for a scheduled run on an account this device never saw scored", () => {
    expect(scoringStatusOf(run("waiting", "waiting", "waiting", "scheduled"), unscored)).toBe("idle");
  });

  it("treats a failed publication as terminal, not 'publishing' forever", () => {
    expect(scoringStatusOf(run("success", "success", "failure"), fresh)).toBe("failed");
    expect(scoringStatusOf(run("success", "success", "failure"), returning)).toBe("ready");
  });

  it("treats a run with no pending stage as finished, whatever the stragglers say", () => {
    expect(scoringStatusOf(run("success", "success", null), unscored)).toBe("idle");
    expect(scoringStatusOf(run("success", "success", null), returning)).toBe("ready");
  });

  it("still shows a first calc started on another device", () => {
    expect(scoringStatusOf(run("ongoing", "waiting", "waiting", "manual"), unscored)).toBe("calculating");
  });
});
