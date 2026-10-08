import { describe, expect, it } from "vitest";
import { parseHighlight, tailOf } from "./nip84";

const hl = (content: string, tags: string[][] = []) => ({ kind: 9802, tags, content });
const PK = "a".repeat(64);

describe("parseHighlight — a NIP-84 highlight read for showing", () => {
  it("finds the passage in its context and keeps what sits either side", () => {
    const h = parseHighlight(
      hl("A body does not get infected by contagion.", [
        ["context", "In this sense, germs are built. A body does not get infected by contagion. Diseases heal."],
        ["r", "https://northerntracey.wordpress.com/2021/06/30/the-amino-age/"],
      ]),
    );
    expect(h?.context).toEqual({ before: "In this sense, germs are built.", after: "Diseases heal." });
    expect(h?.source).toMatchObject({ url: "https://northerntracey.wordpress.com/2021/06/30/the-amino-age/" });
    expect(h?.source.host).toBe("northerntracey.wordpress.com");
  });

  // 15 of 500 on the relay: the context is re-wrapped across lines.
  it("finds a passage whose context wraps it across lines", () => {
    const h = parseHighlight(
      hl("it might turn itself into the global address book", [
        ["context", "If nostr catches on, it might turn itself into the global\naddress book for these things."],
      ]),
    );
    expect(h?.context).toEqual({ before: "If nostr catches on,", after: "for these things." });
  });

  it("has no context when the context does not hold the passage, or is only the passage", () => {
    expect(parseHighlight(hl("words", [["context", "other text entirely"]]))?.context).toBeNull();
    expect(parseHighlight(hl("words", [["context", "words"]]))?.context).toBeNull();
  });

  it("an article by its address ahead of its version's id; a web page by its source `r`, not a mention", () => {
    const h = parseHighlight(
      hl("x", [
        ["a", `30023:${PK}:v2idea`, "wss://relay.example"],
        ["e", "b".repeat(64)],
      ]),
    );
    expect(h?.source.ref).toEqual({ addr: `30023:${PK}:v2idea`, relay: "wss://relay.example" });
    const web = parseHighlight(
      hl("x", [
        ["r", "https://mentioned.example", "mention"],
        ["r", "https://www.source.example/page", "source"],
      ]),
    );
    expect(web?.source).toMatchObject({ ref: null, url: "https://www.source.example/page", host: "source.example" });
    expect(parseHighlight(hl("x", [["i", "https://sheets.works/x"]]))?.source.url).toBe("https://sheets.works/x");
  });

  it("a book is its title and author; a page's title tag is not taken for its name", () => {
    expect(
      parseHighlight(
        hl("x", [
          ["i", "isbn:9781648373190"],
          ["title", "The Universal One"],
          ["author", "Walter Russell"],
        ]),
      )?.source,
    ).toMatchObject({ title: "The Universal One", author: "Walter Russell", url: null });
    expect(
      parseHighlight(
        hl("x", [
          ["r", "https://bible.example"],
          ["title", "Like snow in"],
        ]),
      )?.source.title,
    ).toBeNull();
  });

  it("reads the highlighter's comment and the passage's authors, not the people the comment mentions", () => {
    const h = parseHighlight(
      hl("x", [
        ["comment", "So true"],
        ["p", PK, "", "author"],
        ["p", "c".repeat(64), "", "mention"],
        ["p", "d".repeat(64)],
      ]),
    );
    expect(h?.comment).toBe("So true");
    expect(h?.authors).toEqual([PK, "d".repeat(64)]);
  });

  it("is nothing for another kind or an empty passage", () => {
    expect(parseHighlight({ kind: 1, tags: [], content: "x" })).toBeNull();
    expect(parseHighlight(hl("  "))).toBeNull();
  });
});

describe("tailOf", () => {
  it("keeps the end of the text, cut at a word and said to be cut", () => {
    expect(tailOf("short", 10)).toBe("short");
    expect(tailOf("one two three four five", 10)).toBe("…four five");
  });
});
