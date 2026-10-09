/**
 * Links from data: the header's `link` tags, the URL Templates items they
 * pin by id, and the expansion — RFC 6570 level 1, https only, the host
 * fixed by the template.
 */
import { describe, expect, it } from "vitest";
import {
  expandTemplate,
  itemLinks,
  linkTags,
  parseLinkRefs,
  templateOf,
  templatePlaceholders,
  type UrlTemplate,
} from "./linkTemplates";

const TEMPLATE_ID = "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4";
const VINNEY = "2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331";
const DCOSL = "wss://dcosl.brainstorm.world";

// The template as published on dcosl, 2026-10-01.
const published = {
  id: TEMPLATE_ID,
  pubkey: VINNEY,
  tags: [
    ["z", `39998:${VINNEY}:url-templates`],
    ["name", "GitHub profile"],
    ["url-template", "https://github.com/{username}"],
    ["alt", "URL template: GitHub profile"],
  ],
};

describe("templatePlaceholders", () => {
  it("names the placeholders of a level-1 template", () => {
    expect(templatePlaceholders("https://github.com/{username}")).toEqual(["username"]);
    expect(templatePlaceholders("https://github.com/{user}/{repo}?tab={tab}")).toEqual(["user", "repo", "tab"]);
    expect(templatePlaceholders("https://example.com/")).toEqual([]);
  });

  it("refuses a placeholder in the host, a non-https start, and beyond level 1", () => {
    expect(templatePlaceholders("https://{host}/x")).toBeNull();
    expect(templatePlaceholders("https://{sub}.example.com/")).toBeNull();
    expect(templatePlaceholders("http://github.com/{u}")).toBeNull();
    expect(templatePlaceholders("javascript:alert({u})")).toBeNull();
    expect(templatePlaceholders("https://x.com/{+path}")).toBeNull();
    expect(templatePlaceholders("https://x.com/{a,b}")).toBeNull();
    expect(templatePlaceholders("https://x.com/{u")).toBeNull();
  });
});

describe("expandTemplate", () => {
  it("fills placeholders", () => {
    expect(expandTemplate("https://github.com/{username}", { username: "vcavallo" })).toBe(
      "https://github.com/vcavallo",
    );
  });

  it("percent-encodes a value, so it can't add a path, query or fragment", () => {
    expect(expandTemplate("https://github.com/{username}", { username: "../evil?x=1#y" })).toBe(
      "https://github.com/..%2Fevil%3Fx%3D1%23y",
    );
    expect(expandTemplate("https://x.com/{u}", { u: "it's (ok)*!" })).toBe("https://x.com/it%27s%20%28ok%29%2A%21");
  });

  it("no link when a placeholder has no value", () => {
    expect(expandTemplate("https://github.com/{username}", {})).toBeNull();
    expect(expandTemplate("https://github.com/{username}", { username: "  " })).toBeNull();
  });

  it("no link from a template that breaks the rules", () => {
    expect(expandTemplate("https://{host}/", { host: "evil.example" })).toBeNull();
  });
});

describe("parseLinkRefs", () => {
  it("reads id, relay hint and named pairs that bind declared fields", () => {
    const header = { tags: [["link", TEMPLATE_ID, DCOSL, "username", "github-username"]] };
    expect(parseLinkRefs(header, ["github-username"])).toEqual([
      { templateId: TEMPLATE_ID, relay: DCOSL, bindings: [["username", "github-username"]] },
    ]);
  });

  it("drops pairs naming undeclared fields or odd placeholders, and refs without an id", () => {
    const header = {
      tags: [
        ["link", TEMPLATE_ID, "", "username", "ghost", "bad name", "github-username"],
        ["link", "not-an-id", DCOSL, "username", "github-username"],
      ],
    };
    expect(parseLinkRefs(header, ["github-username"])).toEqual([{ templateId: TEMPLATE_ID, relay: "", bindings: [] }]);
  });

  it("round-trips through linkTags", () => {
    const refs = parseLinkRefs({ tags: [["link", TEMPLATE_ID, DCOSL, "username", "github-username"]] }, [
      "github-username",
    ]);
    expect(linkTags(refs)).toEqual([["link", TEMPLATE_ID, DCOSL, "username", "github-username"]]);
  });
});

describe("itemLinks", () => {
  const tpl = templateOf(published)!;
  const templates = new Map<string, UrlTemplate>([[TEMPLATE_ID, tpl]]);
  const refs = [
    { templateId: TEMPLATE_ID, relay: DCOSL, bindings: [["username", "github-username"]] as [string, string][] },
  ];

  it("reads the published template", () => {
    expect(tpl).toEqual({
      id: TEMPLATE_ID,
      pubkey: VINNEY,
      name: "GitHub profile",
      template: "https://github.com/{username}",
    });
  });

  it("builds an item's link from its fields", () => {
    expect(itemLinks({ tags: [["github-username", "vcavallo"]] }, refs, templates)).toEqual([
      { label: "GitHub profile", href: "https://github.com/vcavallo", host: "github.com" },
    ]);
  });

  it("no link for an item missing the field, or a template that wasn't found", () => {
    expect(itemLinks({ tags: [] }, refs, templates)).toEqual([]);
    expect(itemLinks({ tags: [["github-username", "v"]] }, refs, new Map())).toEqual([]);
  });
});

describe("duplicates", () => {
  it("a header naming the same link twice shows it once", () => {
    const tpl = templateOf(published)!;
    const ref = {
      templateId: TEMPLATE_ID,
      relay: DCOSL,
      bindings: [["username", "github-username"]] as [string, string][],
    };
    expect(itemLinks({ tags: [["github-username", "v"]] }, [ref, ref], new Map([[TEMPLATE_ID, tpl]]))).toHaveLength(1);
  });
});
