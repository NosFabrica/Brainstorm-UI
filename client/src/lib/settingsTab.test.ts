import { describe, expect, it } from "vitest";
import { settingsTabFor } from "@/lib/settingsTab";

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
