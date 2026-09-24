import { describe, it, expect } from "vitest";
import { htmlToText, looksLikeHtml, normalizeMarkup, stripStrayHtml } from "@/lib/htmlText";

describe("htmlToText", () => {
  // Shape of a real kind-30402 listing description (a mod shared as HTML).
  const html = `<p>I decided to take a break.</p><p>Wyll uses <a href="https://example.com/x">this hair</a>.</p><pre><code>&lt;node id="ModOrder"&gt;
&lt;/node&gt;</code></pre><p>Finally, <strong>thanks</strong>.</p>`;

  it("detects HTML, not prose that mentions a tag", () => {
    expect(looksLikeHtml(html)).toBe(true);
    // Markdown about tags, in code spans: not HTML.
    expect(looksLikeHtml("Fix layout\n\n- wrap the list in a `<div>`\n- close the `</div>` properly\n- use `<span>` for icons")).toBe(false);
    expect(looksLikeHtml("Use a <p> tag for paragraphs.")).toBe(false);
  });

  it("keeps paragraphs, links, code and emphasis as light markdown text", () => {
    expect(htmlToText(html)).toBe(
      'I decided to take a break.\n\nWyll uses [this hair](https://example.com/x).\n\n```\n<node id="ModOrder">\n</node>\n```\n\nFinally, **thanks**.',
    );
  });

  it("numbers ordered lists, quotes blockquotes, indents nested lists", () => {
    expect(htmlToText("<ol><li>Install</li><li>Enable<ul><li>on boot</li></ul></li></ol><blockquote><p>Works.</p></blockquote>")).toBe(
      "1. Install\n2. Enable\n  - on boot\n\n> Works.",
    );
  });

  it("drops scripts and non-web links", () => {
    expect(htmlToText('<p>Hi<script>alert(1)</script> <a href="javascript:alert(1)">there</a></p>')).toBe("Hi there");
  });
});

describe("markdown with stray HTML (a bridged GitHub comment)", () => {
  const comment = "**@bot** (2026-03-26):\n\n<!-- auto-generated comment -->\n\n> [!WARNING]\n> ## Rate limit exceeded\n\n<details>\n<summary>⏳ How to resolve this issue?</summary>\n\n- wait\n- then push `<details>` again\n\n</details>";

  it("stays markdown: comments go, wrappers unwrap, a summary is a bold line, code is untouched", () => {
    expect(looksLikeHtml(comment)).toBe(false);
    const out = normalizeMarkup(comment);
    expect(out.replace(/`[^`]*`/g, "")).not.toMatch(/<!--|<\/?details>|<summary>/);
    expect(out).toContain("**⏳ How to resolve this issue?**");
    expect(out).toContain("- wait\n- then push `<details>` again");
  });

  it("keeps pictures as their URLs and links as markdown links", () => {
    expect(stripStrayHtml('See <a href="https://x.y/a">docs</a><br><img src="https://i.x/p.png" width=40>')).toBe("See [docs](https://x.y/a)\n\nhttps://i.x/p.png\n");
  });

  it("leaves text with no tags exactly as it is", () => {
    const t = "a < b and c > d, <3";
    expect(normalizeMarkup(t)).toBe(t);
  });
});
