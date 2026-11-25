import { describe, expect, it } from "vitest";
import { matchUsersByName } from "./matchUsersByName";

const users = [{ pubkey: "aa11" }, { pubkey: "bb22" }, { pubkey: "cc33" }];
const profiles = new Map([
  ["aa11", { name: "Alice" }],
  ["bb22", { name: "Bob", picture: "https://x/b.png" }],
]);

describe("matchUsersByName", () => {
  it("matches names case-folded, carrying the picture", () => {
    expect(matchUsersByName(users, profiles, " BOB ")).toEqual([
      { pubkey: "bb22", name: "Bob", picture: "https://x/b.png" },
    ]);
  });

  it("matches pubkeys only when asked", () => {
    expect(matchUsersByName(users, profiles, "cc3")).toEqual([]);
    expect(matchUsersByName(users, profiles, "cc3", { pubkeys: true })).toEqual([{ pubkey: "cc33" }]);
  });

  it("matches nothing for an empty query", () => {
    expect(matchUsersByName(users, profiles, "  ")).toEqual([]);
  });
});
