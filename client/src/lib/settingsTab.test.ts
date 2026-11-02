import { describe, expect, it } from "vitest";
import { assistantViewsFor, settingsTabFor, settingsTabsFor, settingsTargetFor } from "@/lib/settingsTab";

describe("settingsTabFor — which Settings tab a link opens", () => {
  const all = ["profile", "trust", "messages", "billing", "about"] as const;

  it("opens Messages by its own name", () => {
    expect(settingsTabFor("messages", null, all)).toBe("messages");
  });

  it("sends the old Trust & search link for messages to the Messages tab", () => {
    expect(settingsTabFor("trust", "messages", all)).toBe("messages");
  });

  it("leaves other links alone, and falls back to Profile", () => {
    expect(settingsTabFor("trust", "tag-relays", all)).toBe("trust");
    expect(settingsTabFor("nope", null, all)).toBe("profile");
    expect(settingsTabFor(null, null, all)).toBe("profile");
  });
});

// One Assistants tab (2026-11-02) with three views — yours, all, map — in place
// of three tabs. Old links keep landing where they pointed; a view only admins
// see falls back to "yours" for anyone else.
describe("settingsTargetFor — the Assistants tab and its views", () => {
  const all = ["profile", "trust", "assistants", "messages", "billing", "about"] as const;

  it("opens the Assistants tab on a view, 'yours' by default", () => {
    expect(settingsTargetFor({ tab: "assistants", view: null, focus: null }, all, { admin: true })).toEqual({
      tab: "assistants",
      view: "yours",
    });
    expect(settingsTargetFor({ tab: "assistants", view: "map", focus: null }, all, { admin: true })).toEqual({
      tab: "assistants",
      view: "map",
    });
  });

  it("sends the three old tabs to their views", () => {
    expect(settingsTargetFor({ tab: "brainstorm-assistant", view: null, focus: null }, all, { admin: true })).toEqual({
      tab: "assistants",
      view: "yours",
    });
    expect(settingsTargetFor({ tab: "treasure-map", view: null, focus: null }, all, { admin: true })).toEqual({
      tab: "assistants",
      view: "map",
    });
    // The old Assistants & Duties tab was the cross-site list, with its duties view.
    expect(settingsTargetFor({ tab: "assistants", view: "all", focus: null }, all, { admin: true })).toEqual({
      tab: "assistants",
      view: "all",
    });
    expect(settingsTargetFor({ tab: "assistants", view: "duties", focus: null }, all, { admin: true })).toEqual({
      tab: "assistants",
      view: "duties",
    });
  });

  it("keeps the admin-only views from everyone else — they land on 'yours'", () => {
    expect(settingsTargetFor({ tab: "treasure-map", view: null, focus: null }, all, { admin: false })).toEqual({
      tab: "assistants",
      view: "yours",
    });
    expect(settingsTargetFor({ tab: "assistants", view: "all", focus: null }, all, { admin: false })).toEqual({
      tab: "assistants",
      view: "yours",
    });
  });

  it("still sends the old Trust link for messages to Messages, and the unknown to Profile", () => {
    expect(settingsTargetFor({ tab: "trust", view: null, focus: "messages" }, all, { admin: false })).toEqual({
      tab: "messages",
      view: null,
    });
    expect(settingsTargetFor({ tab: "nope", view: null, focus: null }, all, { admin: false })).toEqual({
      tab: "profile",
      view: null,
    });
  });
});

// The bar an admin sees and the one everyone else sees: the internal pages
// (the Dictionary; the Assistants tab's list, duties and map) are admins' only,
// marked so an admin knows what regular users don't see.
describe("settingsTabsFor / assistantViewsFor", () => {
  it("gives everyone five tabs and admins the Dictionary too, marked internal", () => {
    const everyone = settingsTabsFor({ admin: false });
    expect(everyone.map((t) => t.key)).toEqual(["profile", "trust", "assistants", "messages", "billing"]);
    expect(everyone.some((t) => t.internal)).toBe(false);
    const admin = settingsTabsFor({ admin: true });
    expect(admin.map((t) => t.key)).toEqual(["profile", "trust", "assistants", "messages", "dictionary", "billing"]);
    expect(admin.find((t) => t.key === "dictionary")?.internal).toBe(true);
    expect(admin.find((t) => t.key === "assistants")?.internal).toBe(false);
  });

  it("gives everyone the 'yours' view of Assistants, and admins the list, duties and map, marked internal", () => {
    expect(assistantViewsFor({ admin: false }).map((v) => v.key)).toEqual(["yours"]);
    const admin = assistantViewsFor({ admin: true });
    expect(admin.map((v) => v.key)).toEqual(["yours", "all", "duties", "map"]);
    expect(admin.filter((v) => v.internal).map((v) => v.key)).toEqual(["all", "duties", "map"]);
  });
});
