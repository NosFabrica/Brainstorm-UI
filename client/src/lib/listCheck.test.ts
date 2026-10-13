/**
 * The checks a script runs on a list it wrote: a header as the import reads
 * it, and an item as the renderers draw it, with what doesn't come through.
 */
import { describe, expect, it } from "vitest";
import { definitionOf } from "./conceptResolution";
import { templateOf } from "./linkTemplates";
import { checkHeader, checkItem, checkItemUnder, type Problem } from "./listCheck";

const TPL = "a".repeat(64);
const SAGA = `39998:${"3".repeat(64)}:dune-saga`;

const books = [
  ["d", "books"],
  ["names", "Book", "Books"],
  ["required", "title", "Title"],
  ["recommended", "author", "Author"],
  ["optional", "isbn", "ISBN"],
  ["optional", "cover", "Cover"],
  ["optional", "website", "Website"],
  ["optional", "trailer", "Trailer"],
  ["optional", "g", "Where"],
  ["optional", "series", "Series"],
  ["field-type", "cover", "url"],
  ["field-type", "website", "url"],
  ["field-type", "trailer", "url"],
  ["field-type", "series", "address"],
  ["display", "title", "title"],
  ["display", "summary", "author"],
  ["display", "image", "cover"],
  ["display", "link", "website"],
  ["display", "media", "trailer"],
  ["display", "location", "g"],
  ["link", TPL, "wss://relay.example", "isbn", "isbn"],
];

const openLibrary = {
  id: TPL,
  pubkey: "2".repeat(64),
  tags: [
    ["name", "Open Library"],
    ["url-template", "https://openlibrary.org/isbn/{isbn}"],
  ],
};

const dune = [
  ["d", "dune-1a2b3c4d"],
  ["z", `39998:${"1".repeat(64)}:books`],
  ["title", "Dune"],
  ["author", "Frank Herbert"],
  ["isbn", "0441013597"],
  ["cover", "https://covers.example/dune.jpg"],
  ["website", "https://example.com/dune"],
  ["trailer", "https://example.com/dune.mp4"],
  ["g", "9q8"],
  ["g", "9q8yy"],
  ["series", SAGA],
  ["alt", "Book: Dune"],
  ["client", "Brainstorm"],
];

/** Dune with its tags of these names swapped for these. */
const duneWith = (...tags: string[][]) => [
  ...dune.filter((t) => !tags.some((x) => x[0] === t[0])),
  ...tags.filter((t) => t.length > 1),
];

const codes = (problems: Problem[]) => problems.map((p) => p.code);

describe("checkHeader", () => {
  it("passes a header the form would publish as it is, and names the templates its links pin", () => {
    expect(checkHeader(books)).toEqual({ problems: [], templateIds: [TPL] });
  });

  it("blocks a header with no d", () => {
    const { problems } = checkHeader(books.filter((t) => t[0] !== "d"));
    expect(problems).toEqual([
      { code: "unpublishable", field: null, message: "Give the list an identifier (its d tag).", blocking: true },
    ]);
  });

  it("blocks a field name the form won't take", () => {
    const { problems } = checkHeader([...books, ["optional", "Page Count"]]);
    expect(problems).toContainEqual(
      expect.objectContaining({
        code: "unpublishable",
        blocking: true,
        message: expect.stringContaining("Page Count"),
      }),
    );
  });

  it("names a tag the import drops, and why, without blocking", () => {
    const { problems } = checkHeader([...books, ["display", "fact", "pages", "Pages"]]);
    expect(problems).toEqual([
      {
        code: "dropped-tag",
        field: null,
        message: '["display","fact","pages","Pages"] is dropped: "pages" isn\'t a field the list declares.',
        blocking: false,
      },
    ]);
  });
});

describe("checkItem", () => {
  it("resolves an item that comes through whole, links and all", () => {
    const { problems, resolved } = checkItem(books, dune, [openLibrary]);
    expect(problems).toEqual([]);
    expect(resolved).toMatchObject({
      title: "Dune",
      summary: "Frank Herbert",
      image: "https://covers.example/dune.jpg",
      link: { href: "https://example.com/dune", label: "Website" },
      media: { url: "https://example.com/dune.mp4", kind: "video" },
      location: { geohash: "9q8yy" },
    });
    expect(resolved.links).toMatchObject([
      { templateId: TPL, name: "Open Library", href: "https://openlibrary.org/isbn/0441013597", problem: null },
    ]);
  });

  it("blocks a required field left empty, and doesn't call the item untitled as well", () => {
    const { problems } = checkItem(books, duneWith(["title", "  "]), [openLibrary]);
    expect(problems).toEqual([
      { code: "required-missing", field: "title", message: 'Books require "title".', blocking: true },
    ]);
  });

  it("says an item has no title when its title field is optional and empty", () => {
    const header = books.map((t) => (t[0] === "display" && t[1] === "title" ? ["display", "title", "isbn"] : t));
    const { problems } = checkItem(header, duneWith(["isbn"]), [openLibrary]);
    expect(problems).toContainEqual(expect.objectContaining({ code: "untitled", field: "isbn", blocking: false }));
  });

  it("says what a role lost, once per field", () => {
    const { problems } = checkItem(
      books,
      duneWith(
        ["cover", "dune.jpg"],
        ["website", "example.com"],
        ["trailer", "https://youtu.be/xyz"],
        ["g", "Arrakis"],
      ),
      [openLibrary],
    );
    expect(problems).toEqual([
      expect.objectContaining({
        code: "image-unusable",
        field: "cover",
        message: expect.stringContaining("no picture"),
      }),
      expect.objectContaining({ code: "link-unusable", field: "website" }),
      expect.objectContaining({
        code: "media-unusable",
        field: "trailer",
        message: expect.stringContaining("audio or video extension"),
      }),
      expect.objectContaining({ code: "location-unusable", field: "g" }),
    ]);
  });

  it("says a url field that no role reads isn't a URL", () => {
    const header = books.filter((t) => !(t[0] === "display" && t[1] === "link"));
    const { problems } = checkItem(header, duneWith(["website", "example.com"]), [openLibrary]);
    expect(codes(problems)).toEqual(["not-a-url"]);
  });

  it("says a tel or email field that holds no phone number or address, and passes one that does", () => {
    const header = [
      ...books,
      ["optional", "phone"],
      ["field-type", "phone", "tel"],
      ["optional", "contact"],
      ["field-type", "contact", "email"],
    ];
    const bad = checkItem(header, duneWith(["phone", "call the shop"], ["contact", "ask at the till"]), [openLibrary]);
    expect(codes(bad.problems)).toEqual(["not-a-phone", "not-an-email"]);
    const good = checkItem(header, duneWith(["phone", "+1 555 123 4567"], ["contact", "a@b.com"]), [openLibrary]);
    expect(good.problems).toEqual([]);
  });

  it("says an address field that names nothing", () => {
    const { problems } = checkItem(books, duneWith(["series", "dune-saga"]), [openLibrary]);
    expect(codes(problems)).toEqual(["not-an-address"]);
  });

  it("says a field given twice shows once, but not a location's precisions", () => {
    const { problems } = checkItem(books, [...dune, ["author", "Brian Herbert"]], [openLibrary]);
    expect(problems).toEqual([expect.objectContaining({ code: "repeated", field: "author" })]);
  });

  it("names tags the list doesn't declare, leaving out the protocol's and metadata", () => {
    const { problems } = checkItem(
      books,
      [...dune, ["pages", "412"], ["pages", "896"], ["e", "f".repeat(64)]],
      [openLibrary],
    );
    expect(problems).toEqual([expect.objectContaining({ code: "undeclared", field: "pages" })]);
  });

  it("says a link builds nothing without its template, or without a value", () => {
    expect(codes(checkItem(books, dune).problems)).toEqual(["template-not-given"]);
    expect(checkItem(books, duneWith(["isbn"]), [openLibrary]).problems).toEqual([
      expect.objectContaining({
        code: "template-unfilled",
        message: 'The Open Library link builds nothing: "isbn" is empty.',
      }),
    ]);
  });
});

describe("checkItemUnder", () => {
  it("gives what checkItem gives, from a definition and a template map", () => {
    const item = [
      ["d", "dune"],
      ["title", "Dune"],
      ["isbn", "9780441172719"],
      ["website", "not a url"],
    ];
    const def = definitionOf({ id: "0".repeat(64), pubkey: "0".repeat(64), kind: 39998, created_at: 0, tags: books });
    const templates = new Map([[TPL, templateOf(openLibrary)!]]);
    expect(checkItemUnder(def, item, templates)).toEqual(checkItem(books, item, [openLibrary]));
  });
});
