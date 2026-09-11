// @vitest-environment node
/**
 * NIP-54 wiki articles (kind 30818) link to one another with [[wikilinks]].
 * GitCitadel Publishing mirrors Wikipedia this way: "*Isis* was a major
 * [[ancient Egyptian deities|goddess]]". Read on Brainstorm, a wikilink is a
 * search for that topic's articles here — people stay, and any author's page
 * on the topic can answer, not just one.
 */
import { describe, expect, it } from "vitest";
import { wikiPlainText, wikiToMarkdown } from "./wiki";

describe("wikiToMarkdown", () => {
  it("a labelled wikilink reads as its label and searches the topic's articles here", () => {
    expect(wikiToMarkdown("a [[ancient Egyptian deities|goddess]] of magic")).toBe("a [goddess](/?q=ancient%20Egyptian%20deities&t=articles) of magic");
  });
  it("a bare wikilink reads as the topic itself", () => {
    expect(wikiToMarkdown("see [[Osiris]] and [[Horus]]")).toBe("see [Osiris](/?q=Osiris&t=articles) and [Horus](/?q=Horus&t=articles)");
  });
  // GitCitadel's mirrors are AsciiDoc (census 2026-09-07, 120 pages: 40 with
  // "==" headings, 44 with *bold*, 27 with "* " lists) — shown as-is they read
  // as raw markup. The reader speaks markdown, so the page is translated.
  it("AsciiDoc headings and bold read as markdown; list bullets stay bullets", () => {
    const page = "*_Comedians_* is a play by [[Trevor Griffiths]].\n\n== Plot\n=== Act 1\nThe play opens.\n\n== Cast\n* Gethin Price\n* Eddie Waters";
    expect(wikiToMarkdown(page)).toBe(
      "**_Comedians_** is a play by [Trevor Griffiths](/?q=Trevor%20Griffiths&t=articles).\n\n## Plot\n### Act 1\nThe play opens.\n\n## Cast\n* Gethin Price\n* Eddie Waters",
    );
  });
  it("AsciiDoc links and images read as markdown links and images; a bare URL stays bare", () => {
    const page = "== References\n* Lavalie, John. link:http://epguides.com/CC[_Comedians' Comedians_]. EpGuides.\n* https://example.org/a[Example] and https://example.org/bare\n\nimage::https://img.example/isis.jpg[Isis, seated]";
    expect(wikiToMarkdown(page)).toBe(
      "## References\n* Lavalie, John. [_Comedians' Comedians_](http://epguides.com/CC). EpGuides.\n* [Example](https://example.org/a) and https://example.org/bare\n\n![Isis, seated](https://img.example/isis.jpg)",
    );
  });
  it("the mirror's source note reads as a quote; footnotes, nested brackets and all, leave the body", () => {
    const page =
      "*Isis* is the Greek name.footnote:[http://ancient.example/isis#[A Biography of Isis] at Ancient Egypt Online] She is wise.footnote:[Plutarch, _Moralia_, 9.]\n\n" +
      "[NOTE]\n====\nSource: \"Isis\" on Wikipedia (https://en.wikipedia.org/wiki/Isis), by Wikipedia contributors\nLicense: CC BY-SA 4.0\n====";
    expect(wikiToMarkdown(page)).toBe(
      "**Isis** is the Greek name. She is wise.\n\n" +
      "> Source: \"Isis\" on Wikipedia (https://en.wikipedia.org/wiki/Isis), by Wikipedia contributors\n> License: CC BY-SA 4.0",
    );
  });
  it("everything else passes through untouched", () => {
    const md = "*Isis* was a **goddess** — see [Wikipedia](https://en.wikipedia.org/wiki/Isis).";
    expect(wikiToMarkdown(md)).toBe(md);
  });
});

// A search row shows a page's words, not its markup: "A comedian is one who
// entertains through comedy" — never "[[comedian]]" and "== Comedians".
describe("wikiPlainText", () => {
  it("an AsciiDoc page reads as its words — links as their labels, headings and the source note gone", () => {
    const page =
      "A [[comedian]] is one who entertains through [[comedy]].footnote:[Oxford, _Comedian_.]\n\n== Comedians\n=== A\n* [[Celya AB]] (born 1995), *NBC News* said link:https://nbc.example/x[so].\n\n" +
      "image::https://img.example/a.jpg[Ace]\n\n[NOTE]\n====\nSource: Wikipedia\n====";
    expect(wikiPlainText(page)).toBe("A comedian is one who entertains through comedy. Celya AB (born 1995), NBC News said so.");
  });
  it("a markdown page reads as its words too — links, emphasis, headings and bullets stripped", () => {
    const page = "# Bitcoin\n\n**Bitcoin** is a _peer-to-peer_ [currency](https://bitcoin.org) with `snake_case` names.\n\n- one\n- two\n\n![cover](https://img.example/b.png)";
    expect(wikiPlainText(page)).toBe("Bitcoin is a peer-to-peer currency with `snake_case` names. one two");
  });
});
