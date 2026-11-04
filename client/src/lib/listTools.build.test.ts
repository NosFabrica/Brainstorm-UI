// @vitest-environment node
/**
 * The list code built as one module (vite.lists.config.ts) answers as the
 * source does, in plain Node, with no browser: what a program outside this
 * repo, such as the Tapestry connector, runs.
 */
import { mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { nip19 } from "nostr-tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import * as source from "./listTools";
import dictionaryConfig from "@/config/dictionary.config.json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = mkdtempSync(path.join(tmpdir(), "lists-build-"));
let built: typeof source;

beforeAll(async () => {
  await build({ configFile: path.join(root, "vite.lists.config.ts"), logLevel: "silent", build: { outDir: out } });
  built = await import(/* @vite-ignore */ pathToFileURL(path.join(out, "lists.js")).href);
}, 60_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

const TPL = "a".repeat(64);
const openLibrary = {
  id: TPL,
  pubkey: "b".repeat(64),
  tags: [
    ["name", "Open Library"],
    ["url-template", "https://openlibrary.org/isbn/{isbn}"],
  ],
};
const books = [
  ["d", "books"],
  ["names", "Book", "Books"],
  ["description", "Books, for a test."],
  ["required", "title", "Title"],
  ["recommended", "author", "Author"],
  ["optional", "isbn", "ISBN"],
  ["optional", "cover", "Cover"],
  ["field-type", "cover", "url"],
  ["display", "title", "title"],
  ["display", "summary", "author"],
  ["display", "image", "cover"],
  ["link", "isbn", TPL],
];
const dune = [
  ["d", "dune-1a2b3c4d"],
  ["z", `39998:${"1".repeat(64)}:books`],
  ["title", "Dune"],
  ["author", "Frank Herbert"],
  ["isbn", "0441013597"],
  ["cover", "https://covers.example/dune.jpg"],
];

describe("the built list module", () => {
  it("is one file that imports nothing", () => {
    expect(readdirSync(out)).toEqual(["lists.js"]);
  });

  it("exports what listTools does", () => {
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort());
  });

  it.each([
    ["a header that would publish as it is", books],
    ["a header with no d", books.filter((t) => t[0] !== "d")],
    ["a field name the form won't take", [...books, ["optional", "Page Count"]]],
    ["a hint the import drops", [...books, ["display", "fact", "pages", "Pages"]]],
  ])("checks %s as the source does", (_name, header) => {
    expect(built.checkHeader(header)).toEqual(source.checkHeader(header));
  });

  it.each([
    ["an item that comes through whole", dune],
    ["an item with a blank title", [...dune.filter((t) => t[0] !== "title"), ["title", "  "]]],
    ["an item missing its required field", dune.filter((t) => t[0] !== "title")],
    ["an item with a field the header doesn't declare", [...dune, ["pages", "412"]]],
  ])("checks %s as the source does", (_name, item) => {
    expect(built.checkItem(books, item, [openLibrary])).toEqual(source.checkItem(books, item, [openLibrary]));
  });

  it("reads a URL Templates item as the source does", () => {
    const item = { ...openLibrary, tags: [["z", dictionaryConfig.roles["url-templates"]], ...openLibrary.tags] };
    expect(built.templateOf(item)).toEqual(source.templateOf(item));
    expect(built.templateOf(item)).toMatchObject({ id: TPL, name: "Open Library" });
    expect(built.templateOf({ ...item, tags: [["name", "No template"]] })).toBeNull();
  });

  it("imports against existing templates as the source does, linking to one that builds the same links", () => {
    const existing = [source.templateOf(openLibrary)!];
    const parsed = source.parseListImport(
      JSON.stringify({
        d: "books",
        tags: [
          ...books.filter((t) => t[0] !== "d" && t[0] !== "link"),
          ["link", "ol", "wss://dcosl.brainstorm.world", "code", "isbn"],
        ],
        templates: [{ ref: "ol", name: "Open Library by ISBN", template: "https://OpenLibrary.org/isbn/{code}" }],
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const imported = built.importIntoDraft(parsed.value, "c".repeat(64), existing);
    expect(imported).toEqual(source.importIntoDraft(parsed.value, "c".repeat(64), existing));
    expect(imported.templates.map((o) => o.outcome)).toEqual(["existing"]);
    expect(imported.draft.links.map((l) => [l.templateId, l.bindings])).toEqual([[TPL, [["isbn", "isbn"]]]]);
    expect(built.similarTemplates("https://openlibrary.org/isbn/{x}", existing).same?.id).toBe(TPL);
  });

  it("names the URL Templates list the app's config does", () => {
    expect(built.URL_TEMPLATES_LIST).toBe(dictionaryConfig.roles["url-templates"]);
    expect(built.URL_TEMPLATES_LIST).toMatch(/^39998:[0-9a-f]{64}:url-templates$/);
  });

  it("names the Dictionary's curator tag and role concepts as the app's config does", () => {
    expect(built.CURATOR_TAG).toBe(dictionaryConfig.curatorTag);
    expect(built.ROLE_CONCEPTS).toEqual(Object.values(dictionaryConfig.roles));
    expect(built.ROLE_CONCEPTS).toContain(built.URL_TEMPLATES_LIST);
  });

  it("resolves the Dictionary's curators and concepts as the source does", () => {
    const house = "4".repeat(64);
    const alice = "a".repeat(64);
    const event = (n: number, pubkey: string, kind: number, tags: string[][]) => ({
      id: n.toString(16).padStart(64, "0"),
      pubkey,
      kind,
      created_at: 100,
      tags,
    });
    const events = [
      event(1, house, 39999, [
        ["d", "curator-alice"],
        ["p", alice],
        ["a", dictionaryConfig.curatorTag],
      ]),
      event(2, alice, 39998, [
        ["d", "books"],
        ["names", "Book", "Books"],
        ["b", `39998:${alice}:books`, "pointer"],
      ]),
      event(3, alice, 39998, [
        ["d", "notes"],
        ["names", "Note", "Notes"],
      ]),
    ];
    const curators = built.curatorsOf(events, { house, curatorTag: built.CURATOR_TAG });
    expect(curators).toEqual(source.curatorsOf(events, { house, curatorTag: source.CURATOR_TAG }));
    expect(curators).toEqual([alice]);
    expect(built.conceptsOf(events, curators)).toEqual(source.conceptsOf(events, curators));
    expect(built.conceptsOf(events, curators)).toEqual([`39998:${alice}:books`]);
  });

  it("writes the same prompt for an AI", () => {
    const templates = [
      { id: TPL, name: "Open Library", template: "https://openlibrary.org/isbn/{isbn}", placeholders: ["isbn"] },
    ];
    const relay = "wss://dcosl.brainstorm.world/relay";
    expect(built.listAuthoringPrompt(templates as never, relay)).toEqual(
      source.listAuthoringPrompt(templates as never, relay),
    );
  });
});

// A6.13.a: the connector's brainstorm_search runs the box's own grammar from this bundle, so a
// Claude's query reaches the search relay as the box would send it.
describe("the built search grammar", () => {
  const AUTHOR = "7".repeat(64);
  const READER = "8".repeat(64);
  const author = nip19.npubEncode(AUTHOR);
  const reader = nip19.npubEncode(READER);
  const opts = (m: typeof source) => ({ limit: 20, searchString: (terms: string) => m.withObserver(terms, READER) });

  it.each([
    ["words alone", "bitcoin mining"],
    ["a person's own notes", `from:${author} lora`],
    ["a mention, a kind and a phrase with a word left out", `to:${author} kind:1 "lightning network" -scam`],
    ["a hashtag between two days", "#nostr since:2026-01-01 until:2026-02-01"],
    ["the relay's own ranking tokens", "relays sort:rank filter:rank:gte:10"],
  ])("parses and builds %s as the source does", (_name, query) => {
    expect(built.parseQuery(query)).toEqual(source.parseQuery(query));
    expect(built.buildFilters(query, opts(built))).toEqual(source.buildFilters(query, opts(source)));
  });

  it("keeps the box's prefixes out of the search text, as filter fields, and reads through the person asking", () => {
    const filters = built.buildFilters(`from:${author} since:2026-01-01 lora`, opts(built));
    expect(filters).toHaveLength(1);
    expect(filters[0].authors).toEqual([AUTHOR]);
    expect(filters[0].since).toBe(source.parseQuery("since:2026-01-01").since);
    expect(filters[0].search).toBe(`lora observer:${READER}`);
  });

  it("hands the relay an observer typed as an npub as the hex it reads", () => {
    const [filter] = built.buildFilters(`lora observer:${reader}`, opts(built));
    expect(filter.search).toBe(`lora observer:${READER}`);
  });

  it("waives the lens when there is no one to read through, rather than be refused", () => {
    expect(built.withObserver("lora", null)).toBe("lora include:spam");
    expect(built.withObserver("lora include:spam", READER)).toBe("lora include:spam");
    expect(built.withObserver(`lora observer:${AUTHOR}`, READER)).toBe(`lora observer:${AUTHOR}`);
  });
});
