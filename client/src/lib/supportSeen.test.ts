// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isUnread, markSeen, unreadCount } from "./supportSeen";
import type { SupportTicket } from "@/services/support";

function ticket(over: Partial<SupportTicket>): SupportTicket {
  return {
    id: "t1",
    subject: "s",
    category: "other",
    status: "answered",
    createdAt: "2026-09-01T10:00:00.000Z",
    lastMessageAt: "2026-09-01T12:00:00.000Z",
    lastMessageAuthor: "support",
    closedAt: null,
    ...over,
  };
}

describe("support unread tracking (per device, per viewpoint)", () => {
  beforeEach(() => localStorage.clear());

  it("a support reply the user hasn't seen is unread — until they open it", () => {
    const t = ticket({});
    expect(isUnread("user", t)).toBe(true);

    markSeen("user", t.id);
    expect(isUnread("user", t)).toBe(false);
  });

  it("your own words are never 'unread' to you", () => {
    // User spoke last → nothing pending for the user…
    expect(isUnread("user", ticket({ lastMessageAuthor: "user" }))).toBe(false);
    // …but that same ticket is exactly what's pending for the admin.
    expect(isUnread("admin", ticket({ lastMessageAuthor: "user" }))).toBe(true);
    expect(isUnread("admin", ticket({ lastMessageAuthor: "support" }))).toBe(false);
  });

  it("a newer reply makes a seen ticket unread again", () => {
    const t = ticket({});
    markSeen("user", t.id);
    const newer = ticket({ lastMessageAt: new Date(Date.now() + 60_000).toISOString() });
    expect(isUnread("user", newer)).toBe(true);
  });

  it("counts what's pending across the list", () => {
    const a = ticket({ id: "a" });
    const b = ticket({ id: "b", lastMessageAuthor: "user" });
    expect(unreadCount("user", [a, b])).toBe(1);
    expect(unreadCount("admin", [a, b])).toBe(1);
  });
});
