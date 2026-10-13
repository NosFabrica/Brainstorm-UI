/**
 * The list grammar, against the live GitHub Accounts list on
 * dcosl.brainstorm.world (header and items as published, 2026-09).
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import {
  addressOf,
  emailHref,
  coordinateOf,
  fieldCell,
  headerNames,
  headerReference,
  headerReferenceOf,
  isDListHeader,
  isDListItem,
  parseCoordinate,
  parseFieldDecls,
  telHref,
  undeclaredFields,
} from "./dlistFields";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const GITHUB_ACCOUNTS = `39998:${AVI}:github-accounts`;

const header = {
  id: "db25cec521257c27c8693a47a79ab62387f8736421e19568c309244947929674",
  pubkey: AVI,
  kind: 39998,
  tags: [
    ["d", "github-accounts"],
    ["names", "GitHub Account", "GitHub Accounts"],
    ["description", "A list of github handles/accounts"],
    ["required", "github-username"],
    ["field-type", "github-username", "text"],
  ],
};

const item = {
  id: "9f4be9d49d734495b740198cef2aedd996cbc3f88e79a7c1c2d8224743dd492e",
  pubkey: AVI,
  kind: 39999,
  tags: [
    ["d", "vcavallo-1i6dn0p"],
    ["z", GITHUB_ACCOUNTS],
    ["description", "Vinney Cavallo"],
    ["github-username", "vcavallo"],
  ],
};

describe("coordinates", () => {
  it("splits at the first two colons only — a d may hold colons", () => {
    expect(parseCoordinate(`39998:${AVI}:a:b:c`)).toEqual({ kind: 39998, pubkey: AVI, d: "a:b:c" });
    expect(parseCoordinate(GITHUB_ACCOUNTS)).toEqual({ kind: 39998, pubkey: AVI, d: "github-accounts" });
  });

  it("lowercases the pubkey, as relays index it", () => {
    expect(parseCoordinate(`39998:${AVI.toUpperCase()}:x`)?.pubkey).toBe(AVI);
  });

  it("refuses what isn't one", () => {
    expect(parseCoordinate("39998:nothex:x")).toBeNull();
    expect(parseCoordinate(`list:${AVI}:x`)).toBeNull();
    expect(parseCoordinate(`39998:${AVI}`)).toBeNull();
    expect(parseCoordinate(undefined)).toBeNull();
  });

  it("an empty d is still an address", () => {
    expect(parseCoordinate(`39998:${AVI}:`)).toEqual({ kind: 39998, pubkey: AVI, d: "" });
  });

  it("names an event by its coordinate, and an item its header by z", () => {
    expect(coordinateOf(header)).toBe(GITHUB_ACCOUNTS);
    expect(headerReference(header)).toBe(GITHUB_ACCOUNTS);
    expect(headerReferenceOf(item)).toBe(GITHUB_ACCOUNTS);
    expect(coordinateOf({ kind: 1, pubkey: AVI, tags: [] })).toBeNull();
  });

  it("a 9998 header is named by id, and its items join with e", () => {
    expect(headerReference({ ...header, kind: 9998 })).toBe(header.id);
    expect(headerReferenceOf({ tags: [["e", header.id]] })).toBe(header.id);
  });
});

describe("header or item", () => {
  it("39998 and 9998 are always headers", () => {
    expect(isDListHeader(header)).toBe(true);
    expect(isDListHeader({ kind: 9998, tags: [] })).toBe(true);
  });

  it("a 39999 is an item unless it declares itself a header", () => {
    expect(isDListItem(item)).toBe(true);
    expect(isDListHeader({ kind: 39999, tags: [["z", "list"]] })).toBe(true);
    expect(isDListHeader({ kind: 39999, tags: [["z", `39998:${AVI}:concept-header`]] })).toBe(true);
    expect(isDListItem({ kind: 39999, tags: [["z", "list"]] })).toBe(false);
  });

  it("other kinds are neither", () => {
    expect(isDListHeader({ kind: 1, tags: [] })).toBe(false);
    expect(isDListItem({ kind: 1, tags: [] })).toBe(false);
  });
});

describe("headerNames", () => {
  it("reads names, falling back to name and d", () => {
    expect(headerNames(header)).toEqual({
      singular: "GitHub Account",
      plural: "GitHub Accounts",
      description: "A list of github handles/accounts",
    });
    expect(headerNames({ tags: [["name", "Dogs"]] })).toMatchObject({ singular: "Dogs", plural: "Dogs" });
    expect(headerNames({ tags: [["d", "dogs"]] })).toMatchObject({ singular: "dogs", description: null });
  });
});

describe("parseFieldDecls", () => {
  it("reads GitHub Accounts' one field", () => {
    expect(parseFieldDecls(header)).toEqual([
      { name: "github-username", requirement: "required", description: null, type: "text" },
    ]);
  });

  it("orders required → recommended → optional, header order within each; allowed is optional", () => {
    const decls = parseFieldDecls({
      tags: [
        ["optional", "avatar"],
        ["allowed", "bio"],
        ["recommended", "url", "Their homepage"],
        ["required", "name"],
        ["field-type", "url", "url"],
      ],
    });
    expect(decls.map((d) => [d.name, d.requirement])).toEqual([
      ["name", "required"],
      ["url", "recommended"],
      ["avatar", "optional"],
      ["bio", "optional"],
    ]);
    expect(decls.find((d) => d.name === "url")).toMatchObject({ description: "Their homepage", type: "url" });
  });

  it("a field declared twice keeps its strongest requirement", () => {
    const decls = parseFieldDecls({
      tags: [
        ["optional", "x"],
        ["required", "x"],
      ],
    });
    expect(decls).toEqual([{ name: "x", requirement: "required", description: null, type: "text" }]);
  });

  it("field-type types a declared field and never adds one", () => {
    expect(parseFieldDecls({ tags: [["field-type", "ghost", "url"]] })).toEqual([]);
  });
});

describe("fieldCell", () => {
  const [username] = parseFieldDecls(header);

  it("reads the item's value for a declared field", () => {
    expect(fieldCell(item, username)).toEqual({
      value: "vcavallo",
      extra: 0,
      missing: false,
      href: null,
      address: null,
    });
  });

  it("flags a missing required field", () => {
    expect(fieldCell({ tags: [] }, username)).toMatchObject({ value: null, missing: true });
  });

  it("counts extra values, keeping the first", () => {
    const cell = fieldCell(
      {
        tags: [
          ["github-username", "a"],
          ["github-username", "b"],
        ],
      },
      username,
    );
    expect(cell).toMatchObject({ value: "a", extra: 1 });
  });

  it("links a url field only when the value is http(s)", () => {
    const url = { name: "url", requirement: "optional" as const, description: null, type: "url" };
    expect(fieldCell({ tags: [["url", " https://github.com/x "]] }, url).href).toBe("https://github.com/x");
    expect(fieldCell({ tags: [["url", "javascript:alert(1)"]] }, url).href).toBeNull();
    expect(fieldCell({ tags: [["url", "github.com/x"]] }, url).href).toBeNull();
  });
});

describe("undeclaredFields", () => {
  it("is what the item carries beyond its header's fields", () => {
    expect(undeclaredFields(item, parseFieldDecls(header))).toEqual([{ name: "description", value: "Vinney Cavallo" }]);
  });

  it("skips protocol tags, metadata and empty values", () => {
    const extra = undeclaredFields(
      {
        tags: [
          ["p", AVI],
          ["alt", "A GitHub account"],
          ["client", "Brainstorm"],
          ["note", ""],
        ],
      },
      [],
    );
    expect(extra).toEqual([]);
  });
});

describe("address fields (provisional)", () => {
  const coord = `39998:${AVI}:divine-videos`;

  it("reads a coordinate or an naddr as the address it names, and nothing else", () => {
    expect(addressOf(` ${coord} `)).toBe(coord);
    expect(addressOf(nip19.naddrEncode({ kind: 39998, pubkey: AVI, identifier: "divine-videos" }))).toBe(coord);
    expect(addressOf(`nostr:${nip19.naddrEncode({ kind: 30023, pubkey: AVI, identifier: "a:b" })}`)).toBe(
      `30023:${AVI}:a:b`,
    );
    expect(addressOf("divine-videos")).toBeNull();
    expect(addressOf("naddr1nonsense")).toBeNull();
  });

  it("gives an address field's cell the address its value names — and no other type's", () => {
    const item = { tags: [["list", coord]] };
    expect(fieldCell(item, { name: "list", requirement: "optional", description: null, type: "address" }).address).toBe(
      coord,
    );
    expect(
      fieldCell(item, { name: "list", requirement: "optional", description: null, type: "text" }).address,
    ).toBeNull();
  });
});

describe("tel and email fields (provisional)", () => {
  const field = (type: string) => ({ name: "contact", requirement: "optional" as const, description: null, type });
  const cell = (type: string, value: string) => fieldCell({ tags: [["contact", value]] }, field(type));

  it("a tel field calls: its digits and a leading +, the separators people write gone", () => {
    expect(telHref("+1-540-391-0134")).toBe("tel:+15403910134");
    expect(telHref("(020) 7946.0958")).toBe("tel:02079460958");
    expect(telHref(" 911 ")).toBe("tel:911");
    expect(cell("tel", "+1 346 493 2858")).toMatchObject({ value: "+1 346 493 2858", href: "tel:+13464932858" });
  });

  it("a tel value with anything else in it stays text", () => {
    expect(telHref("call us")).toBeNull();
    expect(telHref("555-1234 ext 2")).toBeNull();
    expect(telHref("1+2")).toBeNull();
    expect(telHref("")).toBeNull();
  });

  it("an email field mails one address, and nothing else", () => {
    expect(emailHref(" hello@ilsolefood.com ")).toBe("mailto:hello@ilsolefood.com");
    expect(cell("email", "hello@ilsolefood.com").href).toBe("mailto:hello@ilsolefood.com");
    expect(emailHref("hello at ilsolefood.com")).toBeNull();
    expect(emailHref("a@b")).toBeNull();
    expect(emailHref("a@b.com?bcc=c@d.com")).toBeNull();
    expect(emailHref("mailto:a@b.com")).toBeNull();
  });

  it("a value's look never types it: a phone or an email in a text field stays text", () => {
    expect(cell("text", "+1-540-391-0134").href).toBeNull();
    expect(cell("text", "hello@ilsolefood.com").href).toBeNull();
    // A type the reader doesn't know is text too, whatever it's called.
    expect(cell("toString", "+1-540-391-0134").href).toBeNull();
  });
});
