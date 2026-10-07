import { describe, expect, it } from "vitest";
import { customEmoji, hasCustomEmoji, reactionEmoji, splitCustomEmoji } from "./customEmoji";
import { parseNoteContent } from "./noteContent";
import { reactionAuthors, reactionEmojis, reactionLabel } from "./dm/rooms";

const SOAPBOX = "https://gleasonator.dev/emoji/soapbox.png";
const TAGS = [
  ["emoji", "soapbox", SOAPBOX],
  ["emoji", "ditto", "https://example.com/ditto.gif"],
];

describe("NIP-30 custom emoji", () => {
  it("cuts text into runs and the emoji its tags name", () => {
    expect(splitCustomEmoji("Hello :soapbox: and :ditto:!", TAGS)).toEqual([
      { type: "text", value: "Hello " },
      { type: "emoji", value: ":soapbox:", code: "soapbox", url: SOAPBOX },
      { type: "text", value: " and " },
      { type: "emoji", value: ":ditto:", code: "ditto", url: "https://example.com/ditto.gif" },
      { type: "text", value: "!" },
    ]);
  });

  it("leaves a shortcode the event has no tag for as the words typed", () => {
    expect(splitCustomEmoji("a :nope: b", TAGS)).toEqual([{ type: "text", value: "a :nope: b" }]);
  });

  it("does nothing for an event without emoji tags", () => {
    expect(hasCustomEmoji([["t", "nostr"]])).toBe(false);
    expect(splitCustomEmoji("Hi :soapbox:", [])).toEqual([{ type: "text", value: "Hi :soapbox:" }]);
    expect(splitCustomEmoji("", TAGS)).toEqual([]);
  });

  it("only draws pictures served over http(s)", () => {
    const tags = [["emoji", "x", "javascript:alert(1)"]];
    expect(hasCustomEmoji(tags)).toBe(false);
    expect(customEmoji(tags, "x")).toBeNull();
    expect(splitCustomEmoji(":x:", tags)).toEqual([{ type: "text", value: ":x:" }]);
  });

  it("matches a shortcode whatever its case, the way applesauce does", () => {
    expect(customEmoji(TAGS, ":SoapBox:")).toEqual({ code: "soapbox", url: SOAPBOX });
  });

  it("reads a kind-7 reaction's emoji", () => {
    expect(reactionEmoji({ content: ":soapbox:", tags: TAGS })).toEqual({ code: "soapbox", url: SOAPBOX });
    expect(reactionEmoji({ content: "+", tags: TAGS })).toBeNull();
    expect(reactionEmoji({ content: ":soapbox:", tags: [] })).toBeNull();
  });
});

describe("parseNoteContent with emoji tags", () => {
  it("turns a shortcode into an emoji token", () => {
    expect(parseNoteContent("gm :soapbox:", TAGS)).toEqual([
      { type: "text", value: "gm " },
      { type: "emoji", value: ":soapbox:", code: "soapbox", url: SOAPBOX },
    ]);
  });

  it("never reaches inside a link", () => {
    const tokens = parseNoteContent("see https://example.com/:soapbox:/x", TAGS);
    expect(tokens.some((t) => t.type === "emoji")).toBe(false);
  });

  it("is the old tokenizer without tags", () => {
    expect(parseNoteContent("gm :soapbox:")).toEqual([{ type: "text", value: "gm :soapbox:" }]);
  });
});

describe("DM reactions with a custom emoji", () => {
  const r = (author: string, content: string, tags: string[][] = []) => ({ author, rumor: { content, tags } });

  it("reads as the whole shortcode, not cut at eight characters", () => {
    const tags = [["emoji", "party_parrot", "https://example.com/pp.gif"]];
    expect(reactionLabel(":party_parrot:", tags)).toBe(":party_parrot:");
    expect(reactionLabel(":party_parrot:")).toBe(":party_p");
  });

  it("groups by shortcode and keeps the picture to draw", () => {
    const reactions = [r("a", ":soapbox:", TAGS), r("b", ":soapbox:", TAGS), r("a", "+")];
    expect([...reactionAuthors(reactions).get(":soapbox:")!]).toEqual(["a", "b"]);
    expect(reactionEmojis(reactions).get(":soapbox:")).toEqual({ code: "soapbox", url: SOAPBOX });
  });
});
