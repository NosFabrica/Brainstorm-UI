// @vitest-environment node
import { describe, expect, it } from "vitest";
import { highlightTerms } from "./highlight";

const joined = (segs: { text: string; hit: boolean }[]) =>
  segs.map((s) => (s.hit ? `**${s.text}**` : s.text)).join("");

describe("highlightTerms — Google-style query bolding in snippets", () => {
  it("bolds each query word where it appears, case-insensitively", () => {
    expect(joined(highlightTerms("Liverpool agree £120m deal", "liverpool deal"))).toBe(
      "**Liverpool** agree £120m **deal**",
    );
  });

  it("matches word prefixes so plurals and inflections still light up", () => {
    expect(joined(highlightTerms("Liverpool's defenders defended", "defend"))).toBe(
      "Liverpool's **defend**ers **defend**ed",
    );
  });

  it("never highlights syntax tokens — only the text words of the query", () => {
    expect(
      joined(highlightTerms("sort of recent news from liverpool", "liverpool sort:recent from:npub1x")),
    ).toBe("sort of recent news from **liverpool**");
  });

  it("returns the whole text unhighlighted when the query has no text words", () => {
    expect(joined(highlightTerms("hello world", "sort:recent"))).toBe("hello world");
  });
});
