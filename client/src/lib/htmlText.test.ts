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

describe("HTML tables become markdown tables", () => {
  it("keeps rows and header, drops footnote marks and broken citations", () => {
    const md = "Intro.\n\n<table>\n<caption>Sample albedos</caption>\n<thead><tr><th><p>Surface</p></th><th><p>Typical<br />albedo</p></th></tr></thead>\n<tbody>\n<tr><td><p>Fresh asphalt</p></td><td><p>0.04<ref name=\"x\">{{cite web</p></td></tr>\n<tr><td><p>Open ocean</p></td><td><p>0.06<a href=\"#fn1\" class=\"footnote-ref\"><sup>1</sup></a></p></td></tr>\n</tbody></table>\n\n## Next";
    expect(normalizeMarkup(md)).toContain("**Sample albedos**\n\n| Surface | Typical albedo |\n| --- | --- |\n| Fresh asphalt | 0.04 |\n| Open ocean | 0.06 |");
  });
});

describe("HTML that opens with a block element", () => {
  it("is HTML even when escaped code makes most of its lines", () => {
    const d = "<p>Here is an example:</p><pre><code> &lt;node id=\"A\"&gt;\n  &lt;x/&gt;\n  &lt;y/&gt;\n  &lt;z/&gt;\n &lt;/node&gt;</code></pre><p>Finally, thanks.</p>";
    expect(looksLikeHtml(d)).toBe(true);
    expect(normalizeMarkup(d)).toContain('```\n <node id="A">');
  });
});

describe("markdown with a few tags is markdown", () => {
  it("an article with a centered image and a heading keeps its paragraphs", () => {
    const md = 'Intro one.\n\nSecond.\n\n## Heading\n\n<p align="center"><img src="https://a/1.png"></p>\n\n<img src="https://a/2.png">\n\n```\ncode  line\n```';
    expect(looksLikeHtml(md)).toBe(false);
    const out = normalizeMarkup(md);
    expect(out).toContain("Intro one.\n\nSecond.\n\n## Heading");
    expect(out).toContain("https://a/1.png");
    expect(out).toContain("```\ncode  line\n```");
  });

  it("cleans the stray tags GitHub comments use", () => {
    const out = stripStrayHtml('<p align="center">Hi</p><h3>Title</h3> press <kbd>Ctrl</kbd>, <strong class="x">bold</strong>, <a href=https://x.y>link</a>, <img src="/local.png"> <table><tr><td>a</td><td>b</td></tr></table>');
    expect(out).not.toMatch(/<[a-z/]/i);
    expect(out).toContain("## Title");
    expect(out).toContain("`Ctrl`");
    expect(out).toContain("**bold**");
    expect(out).toContain("[link](https://x.y)");
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
