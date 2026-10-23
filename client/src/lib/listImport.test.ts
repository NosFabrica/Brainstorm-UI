/**
 * Pasting a list into List Management: the shapes it reads, the draft it
 * makes, what it keeps, and what it drops with a reason.
 */
import { describe, expect, it } from "vitest";
import { listHeaderTemplate } from "./listDraft";
import { importIntoDraft, parseListImport, withImported } from "./listImport";

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
    // Ticked, as the editor does for a new list.
    const published = listHeaderTemplate(result.draft, {
      selfPointer: true,
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
          ["b", "39998:9999999999999999999999999999999999999999999999999999999999999999:community-books", "pointer"],
        ],
        templates: [],
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
      ["link", "goodreads", '"goodreads" is neither a URL template\'s id nor the ref of one proposed in "templates"'],
      ["image", "a book emoji", "the list's image must be an http(s) URL"],
      [
        "b",
        `39998:${"9".repeat(64)}:community-books`,
        "a list here is your own: make your version of another list from its Dictionary entry",
      ],
    ]);
    expect(sloppy.selfPointer).toBeNull();
    // A text type given on purpose stays: it's carried as the previous version's.
    expect(
      listHeaderTemplate(sloppy.draft, { d: "books", author: ME, previous: { tags: sloppy.kept } }).tags,
    ).toContainEqual(["field-type", "title", "text"]);
  });
  it("takes a self-pointer — whoever wrote it, at the same d — as proposing the list as a community concept", () => {
    const pasted = (b: string[]) =>
      importIntoDraft(
        {
          d: "books",
          tags: [["names", "Book", "Books"], ["required", "title"], b],
          templates: [],
          example: {},
          notes: [],
        },
        ME,
      );
    const avis = pasted([
      "b",
      `39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:books`,
      "pointer",
    ]);
    expect(avis.selfPointer).toBe(true);
    expect(avis.ignored).toEqual([]);
    expect(pasted(["b", `39998:${ME}:other-books`, "pointer"]).selfPointer).toBeNull();
  });
});

describe("withImported — an import into a list that's published", () => {
  const own = [
    ["d", "books"],
    ["names", "Book", "Books"],
    ["field-type", "title", "text"],
    ["license", "CC0-1.0"],
    ["r", "https://openlibrary.org"],
    ["r", "https://openlibrary.org/developers/licensing"],
    ["item-kind", "39999"],
    ["b", "39998:abc:community-books", "pointer"],
    ["b", `39998:${ME}:books`, "pointer", "wss://hub"],
  ];

  it("puts the import's tags in place of the list's own of the same name: a license changes, an r goes", () => {
    const kept = [
      ["license", "CC-BY-4.0"],
      ["r", "https://openlibrary.org"],
    ];
    expect(withImported(own, kept)).toEqual([
      ["d", "books"],
      ["names", "Book", "Books"],
      ["field-type", "title", "text"],
      ["item-kind", "39999"],
      ["b", "39998:abc:community-books", "pointer"],
      ["b", `39998:${ME}:books`, "pointer", "wss://hub"],
      ["license", "CC-BY-4.0"],
      ["r", "https://openlibrary.org"],
    ]);
  });

  it("leaves a name the import doesn't carry as the list had it: an AI was never shown its license", () => {
    expect(withImported(own, [])).toEqual(own);
    expect(withImported(own, [["field-type", "isbn", "url"]])).toEqual([
      ...own.filter((t) => t[0] !== "field-type"),
      ["field-type", "isbn", "url"],
    ]);
  });

  it("pasting the header it has publishes it once, not twice", () => {
    const parsed = parseListImport(JSON.stringify(books));
    if (!parsed.ok) throw new Error("fixture");
    const result = importIntoDraft(parsed.value, ME);
    const header = listHeaderTemplate(result.draft, { d: "books", author: ME, previous: { tags: result.kept } });
    const again = importIntoDraft(parsed.value, ME);
    expect(
      listHeaderTemplate(again.draft, {
        d: "books",
        author: ME,
        previous: { tags: withImported(header.tags, again.kept) },
      }).tags,
    ).toEqual(header.tags);
  });
});

describe("importIntoDraft — URL templates the AI proposed", () => {
  const RELAY = "wss://dcosl.brainstorm.world";
  const BTCMAP = {
    id: "c".repeat(64),
    pubkey: "2".repeat(64),
    name: "BTC Map place",
    template: "https://btcmap.org/merchant/{id}",
  };
  const places = (templates: unknown[], links: string[][]) =>
    parseListImport(
      JSON.stringify({
        d: "places",
        tags: [
          ["names", "Place", "Places"],
          ["required", "name", "Name"],
          ["optional", "osm-node", "OpenStreetMap node"],
          ["optional", "btcmap-id", "BTC Map ID"],
          ...links,
        ],
        templates,
      }),
    );
  const imported = (templates: unknown[], links: string[][]) => {
    const parsed = places(templates, links);
    if (!parsed.ok) throw new Error(parsed.error);
    return importIntoDraft(parsed.value, ME, [BTCMAP]);
  };
  const OSM = { ref: "osm-node", name: "OpenStreetMap node", template: "https://www.openstreetmap.org/node/{node}" };

  it("drafts a new one, its link naming the draft's id with every placeholder bound", () => {
    const result = imported([OSM], [["link", "osm-node", RELAY, "node", "osm-node"]]);
    expect(result.draft.templates).toEqual([
      { id: expect.stringMatching(/^[0-9a-f]{64}$/), name: OSM.name, template: OSM.template },
    ]);
    expect(result.draft.links).toEqual([
      { templateId: result.draft.templates[0].id, relay: RELAY, bindings: [["node", "osm-node"]] },
    ]);
    expect(result.templates).toEqual([{ proposed: OSM, outcome: "new" }]);
    expect(result.ignored).toEqual([]);
  });

  it("uses an existing template that builds the same links, its placeholders renamed", () => {
    const proposed = { ref: "btc", name: "BTC Map", template: "https://BTCMap.org/merchant/{merchant}" };
    const result = imported([proposed], [["link", "btc", RELAY, "merchant", "btcmap-id"]]);
    expect(result.draft.templates).toEqual([]);
    expect(result.draft.links).toEqual([{ templateId: BTCMAP.id, relay: RELAY, bindings: [["id", "btcmap-id"]] }]);
    expect(result.templates).toEqual([{ proposed, outcome: "existing", existing: BTCMAP }]);
    expect(result.ignored).toEqual([]);
  });

  it("drops a malformed proposal, one no link names, and a ref no proposal has — and says why", () => {
    const bad = { ref: "bad", name: "Anywhere", template: "https://{host}/x" };
    const unused = { ...OSM, ref: "spare" };
    const result = imported(
      [bad, unused],
      [
        ["link", "bad", RELAY, "host", "name"],
        ["link", "missing", RELAY, "node", "osm-node"],
      ],
    );
    expect(result.draft.templates).toEqual([]);
    expect(result.draft.links).toEqual([]);
    expect(result.templates).toEqual([
      { proposed: bad, outcome: "dropped", why: expect.stringContaining("https:// and the site") },
      { proposed: unused, outcome: "dropped", why: "no link of the list's names it" },
    ]);
    expect(result.ignored.map((i) => i.why)).toEqual([
      '"bad" is neither a URL template\'s id nor the ref of one proposed in "templates"',
      '"missing" is neither a URL template\'s id nor the ref of one proposed in "templates"',
    ]);
  });

  it("a placeholder left unbound stays in the form, waiting for a field", () => {
    const result = imported([OSM], [["link", "osm-node", RELAY]]);
    expect(result.draft.links[0].bindings).toEqual([["node", ""]]);
  });

  it("drafts a template proposed twice once", () => {
    const again = { ...OSM, ref: "osm-again", name: "OSM" };
    const result = imported(
      [OSM, again],
      [
        ["link", "osm-node", RELAY, "node", "osm-node"],
        ["link", "osm-again", RELAY, "node", "osm-node"],
      ],
    );
    expect(result.draft.templates).toHaveLength(1);
    expect(result.templates[1]).toMatchObject({ outcome: "dropped" });
  });
});
