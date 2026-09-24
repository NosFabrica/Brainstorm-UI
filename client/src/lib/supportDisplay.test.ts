import { describe, expect, it } from "vitest";
import { buildTimeline, statusRank, statusTone } from "./supportDisplay";

describe("supportDisplay", () => {
  it("colors and ranks the known statuses, and treats unknown ones like closed", () => {
    expect(["open", "answered", "closed", "escalated"].map(statusTone)).toEqual(["info", "success", "neutral", "neutral"]);
    expect(["open", "answered", "closed", "escalated"].map(statusRank)).toEqual([0, 1, 2, 2]);
  });

  it("interleaves messages and events by time, the event first on a tie", () => {
    const at = "2026-09-01T10:00:00.000Z";
    const later = "2026-09-01T10:05:00.000Z";
    const timeline = buildTimeline(
      [
        { id: "2", author: "support", body: "later", createdAt: later },
        { id: "1", author: "user", body: "first", createdAt: at },
      ],
      [{ type: "opened", at, by: "user" }],
    );
    expect(timeline.map((i) => (i.kind === "message" ? i.message.body : i.event.type))).toEqual([
      "opened",
      "first",
      "later",
    ]);
  });
});
