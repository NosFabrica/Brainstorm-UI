/**
 * The provisional presentation hints: roles on declared fields, the list's
 * image, and how an item reads with and without them.
 */
import { describe, expect, it } from "vitest";
import { displayHintTags, parseDisplayHints, NO_HINTS } from "./displayHints";
import { parseFieldDecls } from "./dlistFields";
import { definitionOf, differencesBetween, type HeaderEvent } from "./conceptResolution";
import { presentItem } from "./itemPresentation";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const header = (tags: string[][]): HeaderEvent => ({
  id: "h".padEnd(64, "0"),
  pubkey: AVI,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const fields = [
  ["required", "github-username"],
  ["optional", "description"],
  ["optional", "avatar"],
];
const item = {
  tags: [
    ["github-username", "vcavallo"],
    ["description", "Vinney Cavallo"],
    ["avatar", "https://avatars.example/v.png"],
  ],
};

describe("parseDisplayHints", () => {
  it("reads roles that name declared fields, and the list's image", () => {
    const h = header([
      ...fields,
      ["display", "title", "description"],
      ["display", "summary", "github-username"],
      ["display", "image", "avatar"],
      ["image", "https://github.githubassets.com/favicons/favicon.svg"],
    ]);
    expect(parseDisplayHints(h, parseFieldDecls(h))).toEqual({
      title: "description",
      summary: "github-username",
      image: "avatar",
      listImage: "https://github.githubassets.com/favicons/favicon.svg",
    });
  });

  it("ignores undeclared fields, unknown roles, later duplicates and non-http images", () => {
    const h = header([
      ...fields,
      ["display", "title", "ghost"],
      ["display", "banner", "description"],
      ["display", "summary", "description"],
      ["display", "summary", "github-username"],
      ["image", "javascript:alert(1)"],
    ]);
    expect(parseDisplayHints(h, parseFieldDecls(h))).toEqual({ ...NO_HINTS, summary: "description" });
  });

  it("writes roles in a fixed order, the image only when it's a URL", () => {
    expect(displayHintTags({ title: "a", summary: null, image: "b", listImage: "nope" })).toEqual([
      ["display", "title", "a"],
      ["display", "image", "b"],
    ]);
  });
});

describe("presentItem", () => {
  const plain = definitionOf(header(fields));
  const hinted = definitionOf(
    header([
      ...fields,
      ["display", "title", "description"],
      ["display", "image", "avatar"],
      ["image", "https://x.example/i.svg"],
    ]),
  );

  it("with no hints: the first required field is the title, a description the summary", () => {
    expect(presentItem(item, plain, true)).toMatchObject({
      title: "vcavallo",
      titleField: "github-username",
      summary: "Vinney Cavallo",
      image: null,
      listImage: null,
    });
  });

  it("a hint decides: the header's author has the say", () => {
    expect(presentItem(item, hinted, true)).toMatchObject({
      title: "Vinney Cavallo",
      image: "https://avatars.example/v.png",
      listImage: "https://x.example/i.svg",
    });
  });

  it("the summary is never the title again", () => {
    expect(presentItem(item, hinted, true).summary).toBeNull();
  });

  it("hints switched off: the defaults stand", () => {
    expect(presentItem(item, hinted, false)).toMatchObject({
      title: "vcavallo",
      image: null,
      listImage: null,
    });
  });
});

describe("a copy that changes the hints", () => {
  it("differs from the community in how its items read", () => {
    const community = definitionOf(header(fields));
    const copy = definitionOf(header([...fields, ["display", "title", "description"]]));
    expect(differencesBetween(copy, community)).toEqual(["display"]);
  });
});
