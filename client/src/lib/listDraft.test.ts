/**
 * A list of one's own: its header as the form makes it, an edit that keeps
 * what the form doesn't speak, and the preview's definition, example item and
 * spelled-out links.
 */
import { describe, expect, it } from "vitest";
import { definitionOf, type HeaderEvent } from "./conceptResolution";
import {
  exampleItem,
  linkReadouts,
  listDraftOf,
  listHeaderTemplate,
  listProblems,
  newListDraft,
  pointsAtItself,
  previewDefinition,
  slugOf,
} from "./listDraft";

const ME = "1".repeat(64);
const TEMPLATE = "8846baa4be1d8bc17529a4079525b8ecb019f52a0655bd20ae547903b72bd5ed";

const draft = () => {
  const d = newListDraft();
  d.singular = "Food Truck";
  d.plural = "Food Trucks";
  d.description = "Trucks that take bitcoin";
  d.fields = [
    { name: "name", enabled: true, requirement: "required", origin: "custom" },
    {
      name: "website",
      enabled: true,
      requirement: "recommended",
      origin: "custom",
      type: "url",
      description: "Website",
    },
    { name: "btcmap-id", enabled: true, requirement: "optional", origin: "custom" },
  ];
  d.display = { ...d.display, title: "name", link: "website" };
  d.links = [{ templateId: TEMPLATE, relay: "wss://hub", bindings: [["id", "btcmap-id"]] }];
  return d;
};

describe("slugOf", () => {
  it("makes a d from a name", () => {
    expect(slugOf("Food & Drink Places")).toBe("food-drink-places");
    expect(slugOf("  Café Menus! ")).toBe("cafe-menus");
  });
});

describe("listHeaderTemplate", () => {
  it("is a 39998 at its d: the definition, then — proposed as a community concept — a b pointing at itself", () => {
    const t = listHeaderTemplate(draft(), { d: "food-trucks", author: ME, selfPointer: true });
    expect(t.kind).toBe(39998);
    expect(t.tags).toEqual([
      ["d", "food-trucks"],
      ["names", "Food Truck", "Food Trucks"],
      ["description", "Trucks that take bitcoin"],
      ["required", "name"],
      ["recommended", "website", "Website"],
      ["field-type", "website", "url"],
      ["optional", "btcmap-id"],
      ["display", "title", "name"],
      ["display", "link", "website"],
      ["link", TEMPLATE, "wss://hub", "id", "btcmap-id"],
      ["b", `39998:${ME}:food-trucks`, "pointer"],
    ]);
  });

  it("editing keeps every tag the form doesn't speak, and an existing b, but not an old client", () => {
    const previous = {
      tags: [
        ["d", "food-trucks"],
        ["names", "Old", "Olds"],
        ["optional", "gone"],
        ["license", "ODbL-1.0"],
        ["r", "https://btcmap.org"],
        ["item-kind", "39999"],
        ["client", "curate"],
        ["b", "39998:abc:community-trucks", "pointer"],
      ],
    };
    const t = listHeaderTemplate(draft(), { d: "food-trucks", author: ME, previous });
    expect(t.tags).toContainEqual(["license", "ODbL-1.0"]);
    expect(t.tags).toContainEqual(["r", "https://btcmap.org"]);
    expect(t.tags).toContainEqual(["item-kind", "39999"]);
    expect(t.tags).not.toContainEqual(["optional", "gone"]);
    expect(t.tags).not.toContainEqual(["client", "curate"]);
    expect(t.tags.filter((x) => x[0] === "b")).toEqual([["b", "39998:abc:community-trucks", "pointer"]]);
    expect(t.tags.at(-1)).toEqual(["b", "39998:abc:community-trucks", "pointer"]);
  });

  it("keeps a tag the previous version carried twice once, first place first: a save comes out clean", () => {
    const previous = {
      tags: [
        ["d", "food-trucks"],
        ["license", "ODbL-1.0"],
        ["r", "https://www.openstreetmap.org/copyright"],
        ["r", "https://btcmap.org"],
        ["license", "ODbL-1.0"],
        ["r", "https://www.openstreetmap.org/copyright"],
        ["r", "https://btcmap.org"],
        // Not the same tag: it says more.
        ["r", "https://btcmap.org", "source"],
        ["b", "39998:abc:community-trucks", "pointer"],
        ["b", "39998:abc:community-trucks", "pointer"],
      ],
    };
    const t = listHeaderTemplate(draft(), { d: "food-trucks", author: ME, previous });
    expect(t.tags.slice(-5)).toEqual([
      ["license", "ODbL-1.0"],
      ["r", "https://www.openstreetmap.org/copyright"],
      ["r", "https://btcmap.org"],
      ["r", "https://btcmap.org", "source"],
      ["b", "39998:abc:community-trucks", "pointer"],
    ]);
    expect(t.tags.filter((x) => x[0] === "license")).toHaveLength(1);
  });

  it("keeps a type the previous version gave, even plain text", () => {
    const t = listHeaderTemplate(draft(), {
      d: "food-trucks",
      author: ME,
      previous: { tags: [["field-type", "name", "text"]] },
    });
    expect(t.tags).toContainEqual(["field-type", "name", "text"]);
  });

  it("points at itself only when its author says so — an edit never adds or drops it on its own", () => {
    const self = ["b", `39998:${ME}:food-trucks`, "pointer"];
    expect(listHeaderTemplate(draft(), { d: "food-trucks", author: ME }).tags).not.toContainEqual(self);
    // A list without one, edited, stays without one unless it's ticked.
    const plain = {
      tags: [
        ["d", "food-trucks"],
        ["names", "Food Truck", "Food Trucks"],
      ],
    };
    expect(
      listHeaderTemplate(draft(), { d: "food-trucks", author: ME, previous: plain }).tags.some((t) => t[0] === "b"),
    ).toBe(false);
    // Its own earlier self-pointer is kept exactly, relay hint and all; unticked, it goes.
    const hinted = ["b", `39998:${ME}:food-trucks`, "pointer", "wss://hub"];
    const withHint = { tags: [["d", "food-trucks"], hinted] };
    expect(
      listHeaderTemplate(draft(), { d: "food-trucks", author: ME, previous: withHint, selfPointer: true }).tags,
    ).toContainEqual(hinted);
    expect(
      listHeaderTemplate(draft(), { d: "food-trucks", author: ME, previous: withHint, selfPointer: false }).tags,
    ).not.toContainEqual(hinted);
  });

  it("keeps a b pointing at another list, ticked or not", () => {
    const elsewhere = ["b", "39998:abc:community-trucks", "pointer"];
    for (const selfPointer of [true, false])
      expect(
        listHeaderTemplate(draft(), { d: "food-trucks", author: ME, previous: { tags: [elsewhere] }, selfPointer })
          .tags,
      ).toContainEqual(elsewhere);
  });

  it("needs a d", () => {
    expect(listProblems("  ")).toHaveLength(1);
    expect(listProblems("food-trucks")).toEqual([]);
  });
});

describe("listDraftOf", () => {
  it("round-trips a published list, every field its own to rename or drop", () => {
    const header: HeaderEvent = {
      id: "h".repeat(64),
      pubkey: ME,
      kind: 39998,
      created_at: 1,
      tags: listHeaderTemplate(draft(), { d: "food-trucks", author: ME, selfPointer: true }).tags,
    };
    const again = listDraftOf(definitionOf(header));
    expect(again.fields.every((f) => f.origin === "custom")).toBe(true);
    expect(pointsAtItself(header)).toBe(true);
    expect(
      listHeaderTemplate(again, { d: "food-trucks", author: ME, previous: header, selfPointer: pointsAtItself(header) })
        .tags,
    ).toEqual(header.tags);
  });
});

describe("the preview", () => {
  const resolved = previewDefinition(listHeaderTemplate(draft(), { d: "food-trucks", author: ME }), ME);

  it("reads the draft as a definition, filed under the list's own coordinate", () => {
    expect(resolved.governing.plural).toBe("Food Trucks");
    expect(resolved.governing.coordinate).toBe(`39998:${ME}:food-trucks`);
    expect(resolved.governing.fields.map((f) => f.name)).toEqual(["name", "website", "btcmap-id"]);
  });

  it("makes an item of the example values for the fields it declares, skipping empty ones and leftovers", () => {
    const item = exampleItem(resolved.governing, { name: "Wolf's", website: " ", renamed: "x" }, ME);
    expect(item.tags).toEqual([
      ["d", "example"],
      ["z", `39998:${ME}:food-trucks`],
      ["name", "Wolf's"],
    ]);
  });

  it("spells out each link: the template, its bindings, and the URL — or why there's none", () => {
    const templates = new Map([
      [TEMPLATE, { id: TEMPLATE, pubkey: ME, name: "BTC Map place", template: "https://btcmap.org/merchant/{id}" }],
    ]);
    const without = exampleItem(resolved.governing, { name: "Wolf's" }, ME);
    expect(linkReadouts(resolved.governing, without, templates)[0]).toMatchObject({
      name: "BTC Map place",
      href: null,
      problem: "missing",
      bindings: [{ placeholder: "id", field: "btcmap-id", value: null }],
    });
    const withId = exampleItem(resolved.governing, { name: "Wolf's", "btcmap-id": "28718" }, ME);
    expect(linkReadouts(resolved.governing, withId, templates)[0]).toMatchObject({
      href: "https://btcmap.org/merchant/28718",
      problem: null,
    });
    expect(linkReadouts(resolved.governing, withId, new Map())[0].problem).toBe("loading");
  });
});
