// @vitest-environment node
/**
 * NKBIP-01 sections (kind 30041) are AsciiDoc; the reader speaks markdown.
 * What prose uses is translated, and nothing it does not know is mangled.
 */
import { describe, expect, it } from "vitest";
import { asciiDocToMarkdown } from "./asciidoc";

describe("asciiDocToMarkdown", () => {
  it("plain prose passes through: its wrapped lines are one paragraph in both languages", () => {
    const prose = "New States may be admitted by the Congress into this Union;\nbut no new States shall be formed";
    expect(asciiDocToMarkdown(prose)).toBe(prose);
  });

  it("headings, bullets, numbered items and admonitions", () => {
    expect(asciiDocToMarkdown("= Title\n== Part\n* one\n** nested\n. first\nNOTE: careful")).toBe(
      "# Title\n## Part\n- one\n    - nested\n1. first\n> **NOTE:** careful",
    );
  });

  it("nested numbered items nest: four columns in, past `1. `", () => {
    expect(asciiDocToMarkdown(". Prepare\n.. Wash\n... Dry\n. Serve")).toBe(
      "1. Prepare\n    1. Wash\n        1. Dry\n1. Serve",
    );
  });

  it("an admonition block is a labelled quote, not a heading underline", () => {
    expect(asciiDocToMarkdown("[NOTE]\n====\nKeep the receipt.\nIt matters later.\n====\nAfter.")).toBe(
      "> **NOTE:** Keep the receipt.\n> It matters later.\n\nAfter.",
    );
  });

  it("example, sidebar and open blocks keep their lines and drop their fences", () => {
    expect(asciiDocToMarkdown("Intro\n--\nInside\n--\n\n****\nAside\n****")).toBe("Intro\n\nInside\n\nAside");
  });

  it("a block comment hides its text", () => {
    expect(asciiDocToMarkdown("Shown\n////\nhidden *draft*\n////\nAlso shown")).toBe("Shown\nAlso shown");
  });

  it("` +` is a hard break, and leaves no plus behind", () => {
    expect(asciiDocToMarkdown("Roses are red, +\nViolets are blue.")).toBe("Roses are red,  \nViolets are blue.");
  });

  it("emphasis stays out of URLs and code", () => {
    expect(asciiDocToMarkdown("see https://example.com/_draft_/index and `a_b_c` and _this_")).toBe(
      "see https://example.com/_draft_/index and `a_b_c` and *this*",
    );
    expect(asciiDocToMarkdown("*read link:https://a.b/x_y_z[the _spec_] now*")).toBe(
      "**read [the *spec*](https://a.b/x_y_z) now**",
    );
  });

  it("bold and italic, and a line's bullet is not bold", () => {
    expect(asciiDocToMarkdown("*The unanimous Declaration* of _thirteen_ states")).toBe(
      "**The unanimous Declaration** of *thirteen* states",
    );
  });

  it("links and images", () => {
    expect(asciiDocToMarkdown("see https://example.com[the site] and link:https://a.b/c[here]")).toBe(
      "see [the site](https://example.com) and [here](https://a.b/c)",
    );
    expect(asciiDocToMarkdown("image::https://x.y/a.png[A map, 300]")).toBe("![A map](https://x.y/a.png)");
  });

  it("a literal block is copied verbatim, with its language", () => {
    expect(asciiDocToMarkdown("[source,kotlin]\n----\nval x = *y* + [[z]]\n----\nafter *it*")).toBe(
      "```kotlin\nval x = *y* + [[z]]\n```\nafter **it**",
    );
  });

  it("an unterminated literal block still closes", () => {
    expect(asciiDocToMarkdown("----\ncode")).toBe("```\ncode\n```");
  });

  it("attributes and comments are metadata, and hardbreaks keep each line", () => {
    expect(asciiDocToMarkdown(":toc:\n// a note\n[%hardbreaks]\nWe the People\nof the United States\n\nnext")).toBe(
      "We the People  \nof the United States\n\nnext",
    );
  });

  it("a quote block is a blockquote", () => {
    expect(asciiDocToMarkdown("[quote]\n____\nThe die is cast.\n____")).toBe("> The die is cast.");
  });

  it("wikilinks go where the resolver says, or read as their label", () => {
    expect(asciiDocToMarkdown("a [[Farmer|farmer]] and [[Fox]]", (t) => (t === "Farmer" ? "/e/x" : null))).toBe(
      "a [farmer](/e/x) and Fox",
    );
  });
});
