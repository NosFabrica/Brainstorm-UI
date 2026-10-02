// @vitest-environment node
import { describe, expect, it } from "vitest";
import { notifiable, notificationText, type NotifyContext } from "./notify";
import type { DmMessage } from "./store";
import { CHAT_KIND, FILE_KIND, REACTION_KIND } from "./giftWrap";

const ME = "m".repeat(64);
const ANA = "a".repeat(64);
const ROOM = [ANA, ME].sort().join(",");
const NOW = 1_800_000_000;

const msg = (over: Partial<DmMessage> = {}): DmMessage =>
  ({
    id: "x",
    author: ANA,
    room: ROOM,
    kind: CHAT_KIND,
    createdAt: NOW,
    rumor: { content: "lunch tomorrow?", kind: CHAT_KIND, tags: [], pubkey: ANA, created_at: NOW, id: "x" },
    ...over,
  }) as DmMessage;

const ctx = (over: Partial<NotifyContext> = {}): NotifyContext => ({
  me: ME,
  since: NOW - 10,
  shelfOf: () => "chat",
  mutedRooms: new Set(),
  viewing: null,
  ...over,
});

describe("message notifications", () => {
  it("nudges for a new chat message or request", () => {
    expect(notifiable(msg(), ctx())).toBe(true);
    expect(notifiable(msg(), ctx({ shelfOf: () => "request" }))).toBe(true);
  });

  it("stays quiet for history, own messages, reactions, muted, open, low-trust and hidden rooms", () => {
    expect(notifiable(msg({ createdAt: NOW - 3600 }), ctx())).toBe(false);
    expect(notifiable(msg({ author: ME }), ctx())).toBe(false);
    expect(notifiable(msg({ kind: REACTION_KIND }), ctx())).toBe(false);
    expect(notifiable(msg(), ctx({ mutedRooms: new Set([ROOM]) }))).toBe(false);
    expect(notifiable(msg(), ctx({ viewing: ROOM }))).toBe(false);
    expect(notifiable(msg(), ctx({ shelfOf: () => "low" }))).toBe(false);
    expect(notifiable(msg(), ctx({ shelfOf: () => "flagged" }))).toBe(false);
    expect(notifiable(msg(), ctx({ shelfOf: () => undefined }))).toBe(false);
  });

  it("shows the text only for chats, and only when asked", () => {
    expect(notificationText(msg(), { sender: "Ana", request: false, preview: true })).toEqual({
      title: "Ana",
      body: "lunch tomorrow?",
    });
    expect(notificationText(msg(), { sender: "Ana", request: false, preview: false }).body).toBe("New private message");
    expect(notificationText(msg(), { sender: "Ana", request: true, preview: true })).toEqual({
      title: "Message request from Ana",
      body: "New private message",
    });
    expect(notificationText(msg({ kind: FILE_KIND }), { sender: "Ana", request: false, preview: true }).body).toBe(
      "File",
    );
  });
});
