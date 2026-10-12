/**
 * A book, read from its list item (ADR 0007, tier three): the fields the
 * governing definition declares, or — while the community header declares
 * none — the names every Open Library item carries. How its author is said,
 * and how it reads among many: cover, title, author.
 */
import { describe, expect, it } from "vitest";
import { definitionOf, type HeaderEvent } from "./conceptResolution";
import { presentItem } from "./itemPresentation";
import { authorName, bookOf, bookPresentation, cleanSubjects, languageName } from "./books";

const LIBRARIAN = "6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b";
const BOOKS = `39998:${LIBRARIAN}:books`;

/** The community header as it is on the relay (2026-10-12): a name and nothing declared. */
const bare = definitionOf({
  id: "1".repeat(64),
  pubkey: LIBRARIAN,
  kind: 39998,
  created_at: 1_780_000_000,
  tags: [["d", "books"]],
});
/** The drafted house copy (docs/dictionary/house-copies.md), which declares the fields. */
const declared = definitionOf({
  id: "2".repeat(64),
  pubkey: "3".repeat(64),
  kind: 39998,
  created_at: 1_790_000_000,
  tags: [
    ["d", "books"],
    ["names", "Book", "Books"],
    ["required", "title"],
    ["recommended", "author"],
    ["recommended", "cover", "Cover image"],
    ["recommended", "isbn", "ISBN-13"],
    ["optional", "isbn10"],
    ["optional", "open-library-id"],
    ["optional", "year"],
    ["optional", "pages"],
    ["optional", "lang"],
    ["optional", "subject"],
    ["field-type", "cover", "url"],
    ["display", "title", "title"],
    ["display", "summary", "author"],
    ["display", "image", "cover"],
    ["b", BOOKS, "pointer"],
  ],
} as HeaderEvent);

const storm = {
  id: "86d5762bf1feb9172308a4871398498fe232c6eec02ea0a5ab91cc24baff7adf",
  pubkey: LIBRARIAN,
  kind: 39999,
  created_at: 1_780_000_000,
  content: "",
  tags: [
    ["d", "ol-ol19722168w"],
    ["z", BOOKS],
    ["title", "The storm before the storm"],
    ["author", "Duncan, Michael (Podcaster)"],
    ["isbn", "9781610397216"],
    ["isbn10", "1549167774"],
    ["open-library-id", "OL19722168W"],
    ["lang", "eng"],
    ["year", "2017"],
    ["pages", "327"],
    ["cover", "https://covers.openlibrary.org/b/id/10092515-L.jpg"],
    ["subject", "History"],
    ["subject", "Rome, history, republic, 510-30 b.c."],
    ["subject", "nyt:combined-print-and-e-book-nonfiction=2017-11-12"],
    ["subject", "New York Times bestseller"],
    ["subject", "Roman Empire"],
    ["format", "reference"],
    ["source", "openlibrary"],
  ],
};

describe("bookOf", () => {
  it("reads the book through a definition that declares its fields", () => {
    const book = bookOf(storm, declared);
    expect(book).toMatchObject({
      title: "The storm before the storm",
      author: "Michael Duncan",
      isbn: "9781610397216",
      isbn10: "1549167774",
      workId: "OL19722168W",
      cover: "https://covers.openlibrary.org/b/id/10092515-L.jpg",
      year: "2017",
      pages: 327,
      language: "English",
    });
    expect(book?.subjects).toEqual([
      "History",
      "Rome, history, republic, 510-30 b.c.",
      "New York Times bestseller",
      "Roman Empire",
    ]);
  });

  it("while the community header declares nothing, reads the names every Open Library item carries", () => {
    expect(bookOf(storm, bare)?.title).toBe("The storm before the storm");
    expect(bookOf(storm, bare)?.cover).toBe("https://covers.openlibrary.org/b/id/10092515-L.jpg");
  });

  it("is no book without a title", () => {
    expect(bookOf({ tags: [["author", "Anon"]] }, declared)).toBeNull();
    expect(bookOf({ tags: [["author", "Anon"]] }, bare)).toBeNull();
  });
});

describe("authorName", () => {
  it("turns Open Library's 'Last, First (role)' into the name on the cover", () => {
    expect(authorName("Duncan, Michael (Podcaster)")).toBe("Michael Duncan");
    expect(authorName("Kennedy, X. & Gioia, D.")).toBe("X. Kennedy & D. Gioia");
    expect(authorName("Michael Morpurgo")).toBe("Michael Morpurgo");
    expect(authorName("  ")).toBe("");
  });
});

describe("cleanSubjects and languageName", () => {
  it("drops machine subjects and repeats; names a language from its ISO 639-2 code", () => {
    expect(cleanSubjects(["History", "nyt:combined=2017-11-12", "history", "Roman Empire"])).toEqual([
      "History",
      "Roman Empire",
    ]);
    expect(languageName("eng")).toBe("English");
    expect(languageName("fre")).toBe("French");
    expect(languageName("xx-nonsense")).toBeNull();
  });
});

describe("bookPresentation", () => {
  it("among many, a book is its cover, its title and its author — from the item alone", () => {
    const shown = bookPresentation(storm, bare, presentItem(storm, bare));
    expect(shown.title).toBe("The storm before the storm");
    expect(shown.summary).toBe("Michael Duncan");
    expect(shown.image).toBe("https://covers.openlibrary.org/b/id/10092515-L.jpg");
    expect(shown.imageShape).toBe("portrait");
  });
});
