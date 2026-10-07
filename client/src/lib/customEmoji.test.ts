import { describe, expect, it } from "vitest";
import { customEmoji, hasCustomEmoji, reactionEmoji, splitCustomEmoji } from "./customEmoji";
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

describe("shortcodes beside other colons", () => {
  it("finds a tagged shortcode right after an untagged one", () => {
    const tags = [["emoji", "wave", "https://example.com/wave.png"]];
    expect(splitCustomEmoji("meet at 10:00:wave:", tags).map((p) => p.type)).toEqual(["text", "emoji"]);
    expect(splitCustomEmoji("ratio:nope:wave: ok", tags)[1]).toMatchObject({ type: "emoji", code: "wave" });
  });

  it("keeps the first tag for a shortcode", () => {
    const tags = [
      ["emoji", "x", "https://example.com/first.png"],
      ["emoji", "X", "https://example.com/second.png"],
    ];
    expect(customEmoji(tags, "x")?.url).toBe("https://example.com/first.png");
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
