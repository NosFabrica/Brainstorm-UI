/**
 * Pasting a list into List Management: the shapes it reads, the draft it
 * makes, what it keeps, and what it drops with a reason.
 */
import { describe, expect, it } from "vitest";
import { listHeaderTemplate } from "./listDraft";
import { importIntoDraft, parseListImport } from "./listImport";

const ME = "1".repeat(64);
const GOODREADS = "8382b369db6f7d3dc96be27513609a61491f33c2afcc6f7c005c8bd7cc190c83";

const books = {
  d: "books",
  tags: [
    ["names", "Book", "Books"],
    ["description", "Books worth reading"],
    ["required", "title", "Title"],
    ["recommended", "author", "Author"],
    ["optional", "isbn", "ISBN"],
    ["display", "title", "title"],
    ["display", "summary", "author"],
    ["display", "fact", "isbn", "ISBN"],
    ["link", GOODREADS, "wss://dcosl.brainstorm.world", "isbn10", "isbn"],
    ["image", "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/1f4da.svg"],
    ["license", "CC0-1.0"],
  ],
  example: { title: "Dune", author: "Frank Herbert", isbn: "0441013597", year: 1965 },
  notes: ["No template for Open Library exists yet."],
};

describe("parseListImport", () => {
  it("reads the instructions' shape: d, tags, example, notes", () => {
    const parsed = parseListImport(JSON.stringify(books));
    expect(parsed).toMatchObject({
      ok: true,
      value: { d: "books", notes: ["No template for Open Library exists yet."] },
    });
    if (parsed.ok)
      expect(parsed.value.example).toEqual({
        title: "Dune",
        author: "Frank Herbert",
        isbn: "0441013597",
        year: "1965",
      });
  });

  it("reads a reply that wraps it in prose and a code fence", () => {
    const reply = `Here's your list:\n\n\`\`\`json\n${JSON.stringify(books, null, 2)}\n\`\`\`\n\nEnjoy!`;
    expect(parseListImport(reply)).toMatchObject({ ok: true, value: { d: "books" } });
  });

  it("reads a bare array of tags, or a whole event, its d from its tags", () => {
    expect(
      parseListImport(
        JSON.stringify([
          ["d", "zines"],
          ["names", "Zine", "Zines"],
        ]),
      ),
    ).toMatchObject({
      ok: true,
      value: { d: "zines", example: {}, notes: [] },
    });
    expect(
      parseListImport(
        JSON.stringify({
          kind: 39998,
          content: "",
          tags: [
            ["d", "zines"],
            ["names", "Zine", "Zines"],
          ],
        }),
      ),
    ).toMatchObject({ ok: true, value: { d: "zines" } });
  });

  it("says what's wrong when it can't read it", () => {
    expect(parseListImport("")).toMatchObject({ ok: false });
    expect(parseListImport("make me a list of books")).toEqual({ ok: false, error: "That isn't JSON." });
    expect(parseListImport('{"names": ["Book"]}')).toMatchObject({
      ok: false,
      error: expect.stringContaining('"tags"'),
    });
    expect(parseListImport('{"tags": [["names", 3]]}')).toEqual({ ok: false, error: "Tag 1 isn't a list of strings." });
  });
});

describe("importIntoDraft", () => {
  const parsed = parseListImport(JSON.stringify(books));
  if (!parsed.ok) throw new Error("fixture");
  const result = importIntoDraft(parsed.value, ME);

  it("fills the form as if by hand: names, fields with their levels, hints, facts, links, the list's image", () => {
    expect(result.draft).toMatchObject({ singular: "Book", plural: "Books", description: "Books worth reading" });
    expect(result.draft.fields.map((f) => [f.name, f.requirement, f.description])).toEqual([
      ["title", "required", "Title"],
      ["author", "recommended", "Author"],
      ["isbn", "optional", "ISBN"],
    ]);
    expect(result.draft.display).toMatchObject({
      title: "title",
      summary: "author",
      facts: [{ field: "isbn", label: "ISBN" }],
      listImage: books.tags[9][1],
    });
    expect(result.draft.links).toEqual([
      { templateId: GOODREADS, relay: "wss://dcosl.brainstorm.world", bindings: [["isbn10", "isbn"]] },
    ]);
    expect(result.ignored).toEqual([]);
  });

  it("keeps what the form can't set, so the header it publishes carries it", () => {
    expect(result.kept).toEqual([["license", "CC0-1.0"]]);
    const published = listHeaderTemplate(result.draft, {
      d: "books",
      author: ME,
      previous: { tags: result.kept },
    }).tags;
    expect(published).toContainEqual(["license", "CC0-1.0"]);
    expect(published.at(-1)).toEqual(["b", `39998:${ME}:books`, "pointer"]);
  });

  it("brings the example values for fields the list declares, and the notes", () => {
    expect(result.example).toEqual({ title: "Dune", author: "Frank Herbert", isbn: "0441013597" });
    expect(result.notes).toEqual(["No template for Open Library exists yet."]);
  });

  it("drops what a reader would ignore, and says why", () => {
    const sloppy = importIntoDraft(
      {
        d: "books",
        tags: [
          ["names", "Book", "Books"],
          ["required", "title"],
          ["allowed", "year"],
          ["display", "banner", "title"],
          ["display", "image", "cover"],
          ["field-type", "cover", "url"],
          ["field-type", "title", "text"],
          ["link", "goodreads", "wss://hub", "isbn", "isbn"],
          ["image", "a book emoji"],
          ["b", "39998:someone:books", "pointer"],
        ],
        example: {},
        notes: [],
      },
      ME,
    );
    expect(sloppy.ignored.map((i) => [i.tag[0], i.tag[1], i.why])).toEqual([
      ["allowed", "year", "read as optional"],
      ["display", "banner", '"banner" isn\'t a display role'],
      ["display", "image", '"cover" isn\'t a field the list declares'],
      ["field-type", "cover", '"cover" isn\'t a field the list declares'],
      ["link", "goodreads", "a link pins a URL template by its 64-hex event id"],
      ["image", "a book emoji", "the list's image must be an http(s) URL"],
    ]);
    // A text type given on purpose stays: it's carried as the previous version's.
    expect(
      listHeaderTemplate(sloppy.draft, { d: "books", author: ME, previous: { tags: sloppy.kept } }).tags,
    ).toContainEqual(["field-type", "title", "text"]);
  });
});
