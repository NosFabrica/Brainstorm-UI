import { describe, expect, it } from "vitest";
import { adminHistoryFailureStage, parseServerDate } from "./AdminHistory";

describe("parseServerDate", () => {
  it("reads a zoneless server time as UTC, with a space or a T", () => {
    expect(parseServerDate("2026-11-02 10:30:00").toISOString()).toBe("2026-11-02T10:30:00.000Z");
    expect(parseServerDate("2026-11-02T10:30:00").toISOString()).toBe("2026-11-02T10:30:00.000Z");
  });

  it("keeps a zone the server did write", () => {
    expect(parseServerDate("2026-11-02T10:30:00Z").toISOString()).toBe("2026-11-02T10:30:00.000Z");
    expect(parseServerDate(" 2026-11-02T10:30:00+02:00 ").toISOString()).toBe("2026-11-02T08:30:00.000Z");
  });
});

describe("adminHistoryFailureStage", () => {
  const ok = { status: "success", ta_status: "success", internal_publication_status: "success" };

  it("is null for a run nothing failed in", () => {
    expect(adminHistoryFailureStage(ok)).toBeNull();
    expect(adminHistoryFailureStage({ status: "", ta_status: null, internal_publication_status: null })).toBeNull();
  });

  it("names the first stage that failed, in pipeline order", () => {
    expect(adminHistoryFailureStage({ ...ok, status: "FAILURE", ta_status: "failure" })).toBe("calculation");
    expect(adminHistoryFailureStage({ ...ok, ta_status: "failure", internal_publication_status: "failed" })).toBe("ta");
    expect(adminHistoryFailureStage({ ...ok, internal_publication_status: "failed" })).toBe("publication");
    expect(adminHistoryFailureStage({ ...ok, internal_publication_status: "Failure" })).toBe("publication");
  });
});
