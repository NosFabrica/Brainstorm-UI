// @vitest-environment node
/**
 * NKBIP-01 publications, read off the tags as Alexandria publishes them: the
 * United States Constitution and the Bill of Rights, a 30040 whose contents
 * are other 30040s, down to the 30041 sections.
 */
import { describe, expect, it } from "vitest";
import {
  entryFallbackTitle,
  humanizeIdentifier,
  isBookIndex,
  publicationMeta,
  publicationSections,
  publicationTitle,
  sectionBookAddress,
  sectionMarkdown,
  sectionPlainText,
} from "./publication";

const PK = "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319";
const BOOK = "the-united-states-constitution-and-the-bill-of-rights";

const index = {
  kind: 30040,
  pubkey: PK,
  content: "",
  tags: [
    ["title", "The United States Constitution and The Bill of Rights"],
    ["d", BOOK],
    ["author", "United States"],
    ["published_on", "15.12.1791"],
    ["published_by", "United States"],
    ["summary", "Constitution of the United States\n\nBill of Rights"],
    ["image", "https://www.gutenberg.org/cache/epub/5/pg5.cover.medium.jpg"],
    ["type", "document"],
    ["T", BOOK],
    ["version", "1st version"],
    ["t", "constitution"],
    ["t", "law"],
    [
      "a",
      `30040:${PK}:${BOOK}-the-constitution-of-the-united-states-of-america-1787`,
      "",
      "c1293a7afcbabb25b883c91cfe342a580fb4815a20ec85de004a487a84411223",
    ],
    [
      "a",
      `30040:${PK}:${BOOK}-the-united-states-bill-of-rights`,
      "",
      "61566d63ea4f858e5f2e475dd6c897a180a4264177e0cc9d6fa3038a6ed41ab3",
    ],
    ["client", "Alexandria"],
  ],
};

describe("publicationMeta", () => {
  it("reads what the index says of the work", () => {
    expect(publicationMeta(index)).toEqual({
      title: "The United States Constitution and The Bill of Rights",
      author: "United States",
      summary: "Constitution of the United States\n\nBill of Rights",
      image: "https://www.gutenberg.org/cache/epub/5/pg5.cover.medium.jpg",
      type: "document",
      version: "1st version",
      publishedOn: "15.12.1791",
      publishedBy: "United States",
      topics: ["constitution", "law"],
    });
  });

  it("a book by default, its slug as its title when it has none", () => {
    const meta = publicationMeta({ tags: [["d", "wuthering-heights"]] });
    expect(meta.type).toBe("book");
    expect(meta.title).toBe("Wuthering Heights");
  });
});

describe("publicationSections", () => {
  it("the contents in tag order, each pinned to the revision slot 3 names", () => {
    const refs = publicationSections(index);
    expect(refs.map((r) => [r.address?.identifier, r.eventId, r.level, r.title])).toEqual([
      [
        `${BOOK}-the-constitution-of-the-united-states-of-america-1787`,
        "c1293a7afcbabb25b883c91cfe342a580fb4815a20ec85de004a487a84411223",
        1,
        undefined,
      ],
      [
        `${BOOK}-the-united-states-bill-of-rights`,
        "61566d63ea4f858e5f2e475dd6c897a180a4264177e0cc9d6fa3038a6ed41ab3",
        1,
        undefined,
      ],
    ]);
  });

  it("reads `e` entries, titles and levels, and a relay is not a title", () => {
    const id = "a".repeat(64);
    const refs = publicationSections({
      tags: [
        ["a", `30041:${PK}:intro`, "Introduction", "2"],
        ["a", `30041:${PK}:ch1`, "wss://relay.example.com"],
        ["a", `30041:${PK}:ch2`, "relay.example.com"],
        ["e", id, "Chapter One", "3"],
        ["A", `30040:${PK}:original`],
        ["a", `30041:${PK}:intro`],
        ["a", "not-a-coordinate"],
      ],
    });
    expect(refs.map((r) => [r.key, r.title, r.level])).toEqual([
      [`30041:${PK}:intro`, "Introduction", 2],
      [`30041:${PK}:ch1`, undefined, 1],
      [`30041:${PK}:ch2`, undefined, 1],
      [id, "Chapter One", 3],
    ]);
    expect(refs[1].address?.relays).toEqual(["wss://relay.example.com"]);
  });
});

describe("titles", () => {
  it("a slug reads as words", () => {
    expect(humanizeIdentifier("the-united-states-bill-of-rights")).toBe("The United States Bill Of Rights");
  });

  it("before a section arrives, its name under its book is what's left of its slug", () => {
    expect(entryFallbackTitle(`${BOOK}-article-four-section-3`, `${BOOK}-article-four`)).toBe("Section 3");
    expect(entryFallbackTitle("chapter-1", "another-book")).toBe("Chapter 1");
  });

  it("a section's title, else its slug", () => {
    expect(publicationTitle({ tags: [["title", "Section 3"]] })).toBe("Section 3");
    expect(publicationTitle({ tags: [["d", "section-3"]] })).toBe("Section 3");
  });
});

describe("sections", () => {
  const section = {
    kind: 30041,
    pubkey: PK,
    tags: [
      ["title", "Section 3"],
      ["d", `${BOOK}-the-constitution-of-the-united-states-of-america-1787-article-four-section-3`],
      ["m", "text/asciidoc"],
    ],
    content:
      "New States may be admitted by the Congress into this Union;\nbut no new States shall be formed or erected within the Jurisdiction\nof any other State.",
  };

  it("names its book only when it carries `T` (or `c`)", () => {
    expect(sectionBookAddress(section)).toBeNull();
    expect(sectionBookAddress({ ...section, tags: [...section.tags, ["T", BOOK]] })).toEqual({
      kind: 30040,
      pubkey: PK,
      identifier: BOOK,
    });
  });

  it("reads as markdown, and as one line on a card", () => {
    expect(sectionMarkdown(section)).toBe(section.content);
    expect(sectionPlainText({ tags: [], content: "== Heading\n*Bold* text\n* item" })).toBe("Bold text item");
  });

  it("a wikilink goes to the wiki page its tag names, else searches the topic here", () => {
    const md = sectionMarkdown({
      tags: [["wikilink", "the-farmer", PK]],
      content: "the [[the Farmer]] and [[Fox]]",
    });
    expect(md).toMatch(/^the \[the Farmer\]\(\/e\/naddr1[a-z0-9]+\) and \[Fox\]\(\/\?q=Fox&t=articles\)$/);
  });
});

describe("isBookIndex", () => {
  it("a book says what the work is; a part only lists its contents", () => {
    expect(isBookIndex(index)).toBe(true);
    expect(
      isBookIndex({
        kind: 30040,
        tags: [
          ["title", "Article 1"],
          ["d", "a1"],
          ["a", `30041:${PK}:s1`],
        ],
      }),
    ).toBe(false);
    expect(isBookIndex({ kind: 30041, tags: [["author", "x"]] })).toBe(false);
  });
});
