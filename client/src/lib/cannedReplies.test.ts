// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { listCanned, removeCanned, saveCanned } from "./cannedReplies";

describe("canned replies — the admin's saved answers, per device", () => {
  beforeEach(() => localStorage.clear());

  it("saves, lists newest-first, and removes", () => {
    const a = saveCanned("NWC budget", "Check your wallet connection's spending budget…");
    const b = saveCanned("Score cadence", "Scores recalculate on your plan's schedule…");

    expect(listCanned().map((c) => c.title)).toEqual(["Score cadence", "NWC budget"]);
    expect(listCanned()[1].body).toContain("spending budget");

    removeCanned(a.id);
    expect(listCanned().map((c) => c.id)).toEqual([b.id]);
  });

  it("derives a title from the body when none is given", () => {
    const c = saveCanned("", "Thanks for the report! We're on it and will follow up here.");
    expect(c.title).toBe("Thanks for the report! We're on…");
  });
});
