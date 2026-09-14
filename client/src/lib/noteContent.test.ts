/**
 * The note-content tokenizer — the one seam every note body renders through.
 * Born from a live bug: a note whose content is a data:image/gif;base64 URI
 * rendered as a wall of base64 text on the event page's More-from strip.
 */
import { describe, expect, it } from "vitest";
import { parseNoteContent, plainTextPreview, primaryLink, unwrapMarkdownLinks } from "./noteContent";

describe("parseNoteContent", () => {
  it("renders an inline data:image URI as an image, never as base64 text", () => {
    const gif = "data:image/gif;base64,R0lGODlhPQBEAPeoAJosM//AwO/AwHVYZ/z595kzAP/s7P+goOXMv8+fhw==";
    const tokens = parseNoteContent(`look at this ${gif} masterpiece`);
    expect(tokens).toEqual([
      { type: "text", value: "look at this " },
      { type: "image", value: gif },
      { type: "text", value: " masterpiece" },
    ]);
  });

  it("ordinary text and web images keep their shapes", () => {
    const tokens = parseNoteContent("gm https://img.example/sunset.jpg");
    expect(tokens).toEqual([
      { type: "text", value: "gm " },
      { type: "image", value: "https://img.example/sunset.jpg" },
    ]);
  });
});

describe("primaryLink", () => {
  const link = (s: string) => primaryLink(parseNoteContent(s));

  it("is the last plain web link, so feeds and search rows card the same one", () => {
    expect(link("see https://a.test/one and https://b.test/two")).toBe("https://b.test/two");
  });

  it("skips media, which is the thumbnail's business", () => {
    expect(link("https://a.test/page https://cdn.test/pic.jpg")).toBe("https://a.test/page");
  });

  it("is null without a web link", () => {
    expect(link("no links #here")).toBeNull();
  });

  it("sheds prose punctuation", () => {
    expect(link("read this (https://a.test/post)!")).toBe("https://a.test/post");
    expect(link("https://a.test/post, then")).toBe("https://a.test/post");
  });

  it("keeps a closing paren the URL opened", () => {
    expect(link("https://en.wikipedia.org/wiki/Mercury_(planet)")).toBe("https://en.wikipedia.org/wiki/Mercury_(planet)");
  });
});

// Crossposters (Stacker News, blogs) put markdown in kind-1 notes. The wrappers
// must not leak as text, and the URL inside must not swallow the closing paren.
describe("inline markdown in notes", () => {
  it("an image in markdown is an image, even with no file extension", () => {
    expect(parseNoteContent("![](https://m.stacker.news/19886)")).toEqual([
      { type: "image", value: "https://m.stacker.news/19886" },
    ]);
  });

  it("keeps a real media type when the markdown image is a video", () => {
    expect(parseNoteContent("![clip](https://cdn.test/a.mp4)")).toEqual([
      { type: "video", value: "https://cdn.test/a.mp4" },
    ]);
  });

  it("a markdown link keeps its words and becomes a normal link", () => {
    expect(parseNoteContent("see [my post](https://stacker.news/items/1) now")).toEqual([
      { type: "text", value: "see " },
      { type: "text", value: "my post " },
      { type: "url", value: "https://stacker.news/items/1" },
      { type: "text", value: " now" },
    ]);
  });

  it("does not repeat a label that is just the address", () => {
    expect(parseNoteContent("[https://a.test/x](https://a.test/x)")).toEqual([{ type: "url", value: "https://a.test/x" }]);
  });

  it("keeps parens that belong to the URL", () => {
    expect(parseNoteContent("[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet))")).toEqual([
      { type: "text", value: "Mercury " },
      { type: "url", value: "https://en.wikipedia.org/wiki/Mercury_(planet)" },
    ]);
  });

  it("leaves plain brackets and bare links alone", () => {
    expect(parseNoteContent("[not a link] https://a.test/x")).toEqual([
      { type: "text", value: "[not a link] " },
      { type: "url", value: "https://a.test/x" },
    ]);
  });

  it("unwraps for plain-text surfaces too", () => {
    expect(unwrapMarkdownLinks("a ![](https://m.test/1) b [c](https://d.test/e)")).toBe("a https://m.test/1 b c https://d.test/e");
  });

  it("a text preview carries no markdown debris", () => {
    expect(plainTextPreview("Big news ![](https://m.test/1) read [here](https://a.test/x)")).toBe("Big news read here");
  });
});
