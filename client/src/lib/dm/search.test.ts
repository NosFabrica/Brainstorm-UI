// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fold, searchMessages } from "./search";
import type { DmMessage, DmRoom } from "./store";
import { CHAT_KIND, REACTION_KIND } from "./giftWrap";

const msg = (id: string, content: string, createdAt: number, kind = CHAT_KIND) =>
  ({ id, kind, createdAt, rumor: { content } }) as unknown as DmMessage;
const room = (key: string, messages: DmMessage[]) => ({ key, messages, participants: [] }) as unknown as DmRoom;

const rooms = [
  room("ana", [msg("1", "Lunch at the café tomorrow?", 100), msg("2", "+", 101, REACTION_KIND)]),
  room("jun", [msg("3", "The CAFE on 5th closed, sadly", 200), msg("4", "see you at lunch", 150)]),
];
const titleOf = (r: DmRoom) => ({ ana: "Ana Ribeiro", jun: "Jun Park" })[r.key]!;

describe("message search", () => {
  it("folds case and accents", () => {
    expect(fold("Café ÉTÉ")).toBe("cafe ete");
  });

  it("finds messages with every word, newest first, and marks the words", () => {
    const r = searchMessages(rooms, "cafe", { titleOf });
    expect(r.hits.map((h) => h.message.id)).toEqual(["3", "1"]);
    expect(r.searched).toBe(3);
    const h = r.hits[1];
    expect(h.marks.map(([a, b]) => h.snippet.slice(a, b))).toEqual(["café"]);
    expect(searchMessages(rooms, "lunch cafe", { titleOf }).hits.map((x) => x.message.id)).toEqual(["1"]);
  });

  it("matches chat names, and ignores reactions and empty queries", () => {
    expect(searchMessages(rooms, "jun", { titleOf }).rooms.map((x) => x.key)).toEqual(["jun"]);
    expect(searchMessages(rooms, "+", { titleOf }).hits).toEqual([]);
    expect(searchMessages(rooms, "  ", { titleOf }).hits).toEqual([]);
  });

  it("cuts the snippet in the right place where folding changes length", () => {
    // Hangul decomposes under NFD: folded positions run ahead of the text's.
    const long = "가".repeat(120) + " 안녕하세요 친구";
    const r = searchMessages([room("ko", [msg("k", long, 1)])], "친구", { titleOf: () => "" });
    const h = r.hits[0];
    expect(h.snippet).toContain("친구");
    expect(h.marks.map(([a, b]) => h.snippet.slice(a, b))).toEqual(["친구"]);
  });
});
