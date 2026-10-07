/**
 * "Publish my own version": the draft the form starts from, and the event
 * it publishes — a copy that points at the community concept.
 */
import { describe, expect, it } from "vitest";
import { bLinksOf, definitionOf, pointsAt, type HeaderEvent } from "./conceptResolution";
import { copyTemplate, draftProblems, fieldsSeenOnItems, initialDraft, withdrawnTemplate } from "./conceptCopy";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const ME = "1".repeat(64);
const COMMUNITY = `39998:${AVI}:github-accounts`;

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ...tags],
});
const community = definitionOf(
  header(AVI, [
    ["names", "GitHub Account", "GitHub Accounts"],
    ["description", "A list of github handles/accounts"],
    ["required", "github-username"],
    ["field-type", "github-username", "text"],
  ]),
);
const items = [
  {
    tags: [
      ["github-username", "wds4"],
      ["description", "David Strayhorn"],
    ],
  },
  { tags: [["github-username", "vitorpamplona"]] },
  {
    tags: [
      ["github-username", "beep-boop"],
      ["description", "Some evil bot"],
      ["note", "x"],
    ],
  },
];

describe("fieldsSeenOnItems", () => {
  it("counts what items carry beyond the definition, most used first", () => {
    expect(fieldsSeenOnItems(items, community.fields)).toEqual([
      { name: "description", count: 2 },
      { name: "note", count: 1 },
    ]);
  });
});

describe("initialDraft", () => {
  it("starts from the community: its fields on, the items' fields off", () => {
    const draft = initialDraft(community, null, items);
    expect(draft).toMatchObject({ singular: "GitHub Account", plural: "GitHub Accounts" });
    expect(draft.fields).toEqual([
      { name: "github-username", enabled: true, required: true, origin: "definition", type: "text" },
      { name: "description", enabled: false, required: false, origin: "items", seenOn: 2, type: "text" },
      { name: "note", enabled: false, required: false, origin: "items", seenOn: 1, type: "text" },
    ]);
  });

  it("starts from the reader's current version when they have one", () => {
    const mine = definitionOf(
      header(ME, [
        ["names", "GitHub Account", "GitHub Accounts"],
        ["optional", "github-username"],
        ["required", "description"],
        ["optional", "avatar"],
        ["b", COMMUNITY, "pointer"],
      ]),
    );
    const draft = initialDraft(community, mine, items);
    expect(draft.fields).toEqual([
      { name: "github-username", enabled: true, required: false, origin: "definition", type: "text" },
      { name: "description", enabled: true, required: true, origin: "items", seenOn: 2, type: "text" },
      { name: "note", enabled: false, required: false, origin: "items", seenOn: 1, type: "text" },
      { name: "avatar", enabled: true, required: false, origin: "custom", type: "text" },
    ]);
    expect(draft.description).toBe("");
  });
});

describe("copyTemplate", () => {
  it("is a 39998 at the community's d, pointing back, with the chosen fields", () => {
    const draft = initialDraft(community, null, items);
    draft.fields[1] = { ...draft.fields[1], enabled: true, required: true };
    draft.fields.push({ name: "avatar", enabled: true, required: false, origin: "custom" });
    expect(copyTemplate(community, draft)).toEqual({
      kind: 39998,
      content: "",
      tags: [
        ["d", "github-accounts"],
        ["names", "GitHub Account", "GitHub Accounts"],
        ["description", "A list of github handles/accounts"],
        ["required", "github-username"],
        ["field-type", "github-username", "text"],
        ["required", "description"],
        ["optional", "avatar"],
        ["b", COMMUNITY, "pointer"],
      ],
    });
  });

  it("leaves out disabled fields, and the field-type of a field it dropped", () => {
    const draft = initialDraft(community, null, items);
    draft.fields[0] = { ...draft.fields[0], enabled: false };
    const tags = copyTemplate(community, draft).tags;
    expect(tags.some((t) => t[1] === "github-username")).toBe(false);
  });

  it("an empty description is no description tag", () => {
    const draft = { ...initialDraft(community, null, items), description: "  " };
    expect(copyTemplate(community, draft).tags.some((t) => t[0] === "description")).toBe(false);
  });
});

describe("draftProblems", () => {
  const draft = initialDraft(community, null, items);

  it("none for the community's own shape", () => {
    expect(draftProblems(draft)).toEqual([]);
  });

  it("catches unnamed, malformed, reserved and repeated fields", () => {
    const add = (name: string) => ({ name, enabled: true, required: false, origin: "custom" as const });
    expect(draftProblems({ ...draft, fields: [...draft.fields, add("")] })).toEqual(["Every field needs a name."]);
    expect(draftProblems({ ...draft, fields: [...draft.fields, add("two words"), add("z")] })[0]).toMatch(
      /two words, z/,
    );
    expect(draftProblems({ ...draft, fields: [...draft.fields, add("github-username")] })).toEqual([
      "Listed twice: github-username.",
    ]);
  });

  it("a disabled row can be anything", () => {
    const add = { name: "", enabled: false, required: false, origin: "custom" as const };
    expect(draftProblems({ ...draft, fields: [...draft.fields, add] })).toEqual([]);
  });

  it("needs both names", () => {
    expect(draftProblems({ ...draft, plural: " " })).toEqual(["Give the concept a singular and a plural name."]);
  });
});

describe("withdrawnTemplate", () => {
  it("keeps the coordinate and marks it b-tag-deferred: considered, a copy of nothing", () => {
    const mine = definitionOf(
      header(ME, [
        ["required", "x"],
        ["b", COMMUNITY, "pointer"],
      ]),
    );
    const t = withdrawnTemplate(mine);
    expect(t.kind).toBe(39998);
    expect(t.tags[0]).toEqual(["d", "github-accounts"]);
    expect(t.tags).toContainEqual(["b", "b-tag-deferred"]);
    expect(t.tags.some((x) => x[0] === "b" && x[1] === COMMUNITY)).toBe(false);
    // And resolution no longer counts it as a copy.
    const withdrawn = { ...mine.event, tags: t.tags };
    expect(pointsAt(withdrawn, COMMUNITY)).toBe(false);
    expect(bLinksOf(withdrawn)).toEqual([]);
  });
});

describe("display hints in the copy (provisional)", () => {
  it("publishes the chosen roles and the list image, before the b", () => {
    const draft = initialDraft(community, null, items);
    draft.fields[1] = { ...draft.fields[1], enabled: true };
    draft.display = { title: "description", summary: null, image: null, listImage: " https://x.example/gh.svg " };
    const tags = copyTemplate(community, draft).tags;
    expect(tags.slice(-3)).toEqual([
      ["display", "title", "description"],
      ["image", "https://x.example/gh.svg"],
      ["b", COMMUNITY, "pointer"],
    ]);
  });

  it("drops a role whose field this version doesn't include", () => {
    const draft = initialDraft(community, null, items);
    draft.display = { title: "description", summary: null, image: null, listImage: "" };
    expect(copyTemplate(community, draft).tags.some((t) => t[0] === "display")).toBe(false);
  });

  it("starts from the current version's hints", () => {
    const mine = definitionOf(
      header(ME, [
        ["names", "GitHub Account", "GitHub Accounts"],
        ["required", "github-username"],
        ["optional", "description"],
        ["display", "title", "description"],
        ["image", "https://x.example/gh.svg"],
        ["b", COMMUNITY, "pointer"],
      ]),
    );
    expect(initialDraft(community, mine, items).display).toEqual({
      title: "description",
      summary: null,
      image: null,
      link: null,
      media: null,
      location: null,
      listImage: "https://x.example/gh.svg",
    });
  });

  it("a list image that isn't a URL is a problem", () => {
    const draft = initialDraft(community, null, items);
    draft.display = { ...draft.display, listImage: "github logo" };
    expect(draftProblems(draft)).toEqual(["The list image must be an http(s) URL."]);
  });
});

describe("links in the copy (provisional)", () => {
  const TEMPLATE = "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4";
  const DCOSL = "wss://dcosl.brainstorm.world";

  it("publishes a fully bound link, before the b", () => {
    const draft = initialDraft(community, null, items);
    draft.links = [{ templateId: TEMPLATE, relay: DCOSL, bindings: [["username", "github-username"]] }];
    expect(copyTemplate(community, draft).tags.slice(-2)).toEqual([
      ["link", TEMPLATE, DCOSL, "username", "github-username"],
      ["b", COMMUNITY, "pointer"],
    ]);
  });

  it("an unbound placeholder is a problem, and the link isn't written", () => {
    const draft = initialDraft(community, null, items);
    draft.links = [{ templateId: TEMPLATE, relay: DCOSL, bindings: [["username", ""]] }];
    expect(draftProblems(draft)).toEqual(["Every link placeholder needs a field."]);
    expect(copyTemplate(community, draft).tags.some((t) => t[0] === "link")).toBe(false);
  });

  it("a link bound to a field this version leaves out is a problem", () => {
    const draft = initialDraft(community, null, items);
    draft.links = [{ templateId: TEMPLATE, relay: DCOSL, bindings: [["username", "description"]] }];
    expect(draftProblems(draft)).toEqual(["A link uses a field this version doesn’t include: description."]);
  });

  it("starts from the current version's links", () => {
    const mine = definitionOf(
      header(ME, [
        ["names", "GitHub Account", "GitHub Accounts"],
        ["required", "github-username"],
        ["link", TEMPLATE, DCOSL, "username", "github-username"],
        ["b", COMMUNITY, "pointer"],
      ]),
    );
    expect(initialDraft(community, mine, items).links).toEqual([
      { templateId: TEMPLATE, relay: DCOSL, bindings: [["username", "github-username"]] },
    ]);
  });
});

describe("the same link twice", () => {
  it("is written once", () => {
    const TEMPLATE = "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4";
    const draft = initialDraft(community, null, items);
    const link = {
      templateId: TEMPLATE,
      relay: "wss://dcosl.brainstorm.world",
      bindings: [["username", "github-username"]] as [string, string][],
    };
    draft.links = [link, { ...link }];
    expect(copyTemplate(community, draft).tags.filter((t) => t[0] === "link")).toHaveLength(1);
  });
});

describe("field types and the link and media roles", () => {
  it("a field set to url is published with its type; plain text needs no tag", () => {
    const draft = initialDraft(community, null, items);
    draft.fields.push({ name: "page", enabled: true, required: false, origin: "custom", type: "url" });
    draft.fields.push({ name: "note2", enabled: true, required: false, origin: "custom", type: "text" });
    const tags = copyTemplate(community, draft).tags;
    expect(tags).toContainEqual(["field-type", "page", "url"]);
    expect(tags.some((t) => t[0] === "field-type" && t[1] === "note2")).toBe(false);
    // The community's own explicit type stays.
    expect(tags).toContainEqual(["field-type", "github-username", "text"]);
  });

  it("publishes link and media roles for fields this version includes", () => {
    const draft = initialDraft(community, null, items);
    draft.fields.push({ name: "page", enabled: true, required: false, origin: "custom", type: "url" });
    draft.fields.push({ name: "clip", enabled: true, required: false, origin: "custom", type: "url" });
    draft.display = { ...draft.display, link: "page", media: "clip" };
    const tags = copyTemplate(community, draft).tags;
    expect(tags).toContainEqual(["display", "link", "page"]);
    expect(tags).toContainEqual(["display", "media", "clip"]);
  });
});
