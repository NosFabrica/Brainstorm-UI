// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { listCanned, removeCanned, saveCanned, updateCanned } from "./cannedReplies";

describe("canned replies — the admin's saved answers, per device", () => {
  beforeEach(() => localStorage.clear());

  it("saves, lists newest-first, and removes", () => {
    const a = saveCanned("NWC budget", "Check your wallet connection's spending budget…");
    const b = saveCanned("Score cadence", "Scores recalculate on your plan's schedule…");

    expect(listCanned().slice(0, 2).map((c) => c.title)).toEqual(["Score cadence", "NWC budget"]);
    expect(listCanned()[1].body).toContain("spending budget");

    removeCanned(a.id);
    expect(listCanned().map((c) => c.id)).toContain(b.id);
    expect(listCanned().map((c) => c.id)).not.toContain(a.id);
  });

  // A new device doesn't start from a blank dropdown: the common moves —
  // acknowledge, ask for detail, status update, fix shipped, feedback thanks —
  // ship as ordinary replies the admin can edit before sending or delete.
  it("seeds starter replies for the common support moves on first use", () => {
    const titles = listCanned().map((c) => c.title);
    expect(titles).toEqual([
      "Acknowledge — on it",
      "Need more info",
      "Status update",
      "Fix shipped — please confirm",
      "Feedback — thank you",
    ]);
    expect(listCanned()[0].body).toContain("We'll follow up right here");
  });

  it("never resurrects a deleted starter", () => {
    const ack = listCanned()[0];
    removeCanned(ack.id);
    expect(listCanned().map((c) => c.title)).not.toContain("Acknowledge — on it");

    // Later saves and reads still don't bring it back.
    saveCanned("Mine", "My own snippet.");
    expect(listCanned().map((c) => c.title)).not.toContain("Acknowledge — on it");
  });

  // Editing is first-class: refine the wording, save it back to the SAME
  // snippet — no save-new-then-delete-old dance, no duplicate entries.
  it("updates a reply's body in place, keeping its title and position", () => {
    const before = listCanned();
    const ack = before[0];

    updateCanned(ack.id, "Thanks for reaching out — we're on it. Watch this thread.");

    const after = listCanned();
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
    expect(after[0].title).toBe(ack.title);
    expect(after[0].body).toBe("Thanks for reaching out — we're on it. Watch this thread.");
  });

  it("derives a title from the body when none is given", () => {
    const c = saveCanned("", "Thanks for the report! We're on it and will follow up here.");
    expect(c.title).toBe("Thanks for the report! We're on…");
  });
});
