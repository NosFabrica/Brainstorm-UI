import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { markdownExcerpt, summarizeResult } from "./resultSummary";
import { kindFamily, kindTone } from "./kindFamily";
import { kindTypeLabel } from "./kindLabel";

const PK = "4".repeat(64);
const ev = (kind: number, tags: string[][] = [], content = "") => ({
  id: "e".repeat(64),
  pubkey: PK,
  kind,
  created_at: 1_790_000_000,
  tags,
  content,
});

describe("summarizeResult — any kind as the All tab's row", () => {
  // The question that started the All tab: a kind-39999 place has no content and no picture.
  it("a D-list place reads its name, and its own short fields as facts", () => {
    const s = summarizeResult(
      ev(39999, [
        ["d", "osm-way-995734197"],
        ["z", "39998:b83a:food-and-drink-places"],
        ["name", "La Tarantella - Recoleta"],
        ["category", "restaurant"],
        ["country", "PY"],
        ["cuisine", "pizza"],
        ["osm-id", "way:995734197"],
        ["lat", "-25.3064685"],
        ["opening-hours", "Tu-Su 19:00-22:00"],
        ["btcmap-id", "28718"],
      ]),
    );
    expect(s.title).toBe("La Tarantella - Recoleta");
    expect(s.facts).toEqual(["restaurant", "PY", "pizza", "Tu-Su 19:00-22:00"]);
    expect(s.image).toBeNull();
    expect(s.href).toMatch(/^\/e\//);
  });

  it("a profile is the person: name, about, a round face, and their profile page", () => {
    const s = summarizeResult(
      ev(0, [], JSON.stringify({ name: "nova", display_name: "NOVA", about: "Music", picture: "https://img/n.jpg" })),
    );
    expect(s).toMatchObject({ title: "NOVA", body: "Music", image: "https://img/n.jpg", round: true });
    expect(s.href).toBe(`/p/${nip19.npubEncode(PK)}`);
  });

  it("a listing says its price, place and status", () => {
    const s = summarizeResult(
      ev(30402, [
        ["d", "x"],
        ["title", "Coat"],
        ["price", "300", "USD"],
        ["location", "Gubbio, Italy"],
        ["status", "sold"],
        ["image", "https://img/c.jpg"],
      ]),
    );
    expect(s.title).toBe("Coat");
    expect(s.image).toBe("https://img/c.jpg");
    expect(s.facts.at(-1)).toBe("Sold");
    expect(s.facts.length).toBe(3);
  });

  it("an article is its summary, else its markdown as prose", () => {
    const s = summarizeResult(
      ev(
        30023,
        [
          ["d", "a"],
          ["title", "T"],
        ],
        "# Head\n\nSome **bold** [link](https://x).\n\n![](https://i/p.png)",
      ),
    );
    expect(s.body).toBe("Head Some bold link.");
    const withSummary = summarizeResult(
      ev(
        30023,
        [
          ["d", "a"],
          ["title", "T"],
          ["summary", "Short"],
        ],
        "long",
      ),
    );
    expect(withSummary.body).toBe("Short");
  });

  it("content that is not words says what it is instead", () => {
    expect(summarizeResult(ev(30078, [["d", "app"]], "A".repeat(80))).shape).toBe("encrypted");
    expect(summarizeResult(ev(12345, [], '{"a":1}')).shape).toBe("json");
    // The author's NIP-31 alt line, when there is one, is the words.
    expect(summarizeResult(ev(12345, [["alt", "A thing"]], '{"a":1}')).body).toBe("A thing");
  });

  it("an opaque d is never a title; a readable one is", () => {
    expect(summarizeResult(ev(30001, [["d", "a3f1c2d4e5f60718"]])).title).toBeNull();
    expect(summarizeResult(ev(30001, [["d", "reading-list"]])).title).toBe("reading-list");
  });

  it("a D-list header is named by its plural", () => {
    expect(
      summarizeResult(
        ev(39998, [
          ["d", "x"],
          ["names", "place", "places"],
        ]),
      ).title,
    ).toBe("places");
  });
});

describe("kind names and families", () => {
  it("names the kinds this app had no word for, and keeps its own words", () => {
    expect(kindTypeLabel(39999)).toBe("List item");
    expect(kindTypeLabel(1301)).toBe("Workout");
    expect(kindTypeLabel(30023)).toBe("Article");
    expect(kindTypeLabel(987_654)).toBe("Kind 987654");
  });

  it("tints a pill by family; an unnamed kind is slate", () => {
    expect(kindFamily(30023)).toBe("article");
    expect(kindTone(30023)).toBe("amber");
    expect(kindTone(30402)).toBe(kindTone(30018));
    expect(kindTone(987_654)).toBe("slate");
  });
});

describe("markdownExcerpt", () => {
  it("drops code, images and markup, keeping the words", () => {
    expect(markdownExcerpt("```js\nx()\n```\n- one\n- two\n> quoted\n---\n| a | b |\n|---|---|")).toBe(
      "one two quoted | a | b |",
    );
  });
});

describe("the title is not said twice", () => {
  it("drops a heading the words open with, even behind a byline", () => {
    const s = summarizeResult(
      ev(
        30023,
        [
          ["d", "a"],
          ["title", "Senate Opens Markup"],
        ],
        "Bitcoin Magazine\n\n# Senate Opens Markup\n\nThe committee met.",
      ),
    );
    expect(s.body).toBe("The committee met.");
    // A title that only turns up deep in the words leaves them alone.
    const deep = summarizeResult(ev(1, [["subject", "goats"]], `${"x ".repeat(40)}goats are great`));
    expect(deep.body).toContain("goats are great");
  });
});

describe("a note's markdown", () => {
  it("keeps a link's words, not its brackets", () => {
    const s = summarizeResult(ev(1, [], "Joined by [Fiatjaf](https://x.com/f) and **Vitor**."));
    expect(s.body).toBe("Joined by Fiatjaf and Vitor.");
  });
});
