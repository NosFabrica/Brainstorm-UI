/**
 * When profiles a people search matched use a handle that belongs to another
 * account, that account is who the search is about: copies of a person keep
 * their handle, an old profile keeps it after a rename, an alt shares it. The
 * worked example is a search for a full name that the person's own profile
 * never carries, answered only by copies that kept their handle.
 */
import { describe, expect, it } from "vitest";
import { accountsHandlesPointTo } from "./handlePointers";

const REAL = "f".repeat(64);
const OTHER = "e".repeat(64);
const copy = (i: number, name = "Jo Rivers", nip05 = "rivers@music.example") => ({
  pubkey: String(i).repeat(64).slice(0, 64),
  display_name: name,
  nip05,
});

/** Who each claimed handle belongs to, as its server answered: the real account for the copies' handle. */
const owners: Record<string, string> = { "rivers@music.example": REAL, "band@label.example": OTHER };
const ownerOf = (nip05: string | undefined, pubkey: string) => {
  const owner = nip05 ? owners[nip05] : undefined;
  return owner && owner !== pubkey ? owner : null;
};

describe("accountsHandlesPointTo", () => {
  it("names the account the matched profiles' handle belongs to, with the names that pointed at it", () => {
    const matched = [1, 2, 3, 4, 5, 6].map((i) => copy(i));
    expect(accountsHandlesPointTo(matched, ownerOf)).toEqual([{ pubkey: REAL, names: ["Jo Rivers"], count: 6 }]);
  });

  it("adds nobody already in the results, and nothing for profiles whose handle is their own or unchecked", () => {
    const matched = [
      copy(1),
      { pubkey: REAL, name: "rivers", nip05: "rivers@music.example" },
      { pubkey: "9".repeat(64), name: "Sam" },
    ];
    expect(accountsHandlesPointTo(matched, ownerOf)).toEqual([]);
  });

  it("puts the account more profiles point at first, and says each name once", () => {
    const matched = [copy(1, "The Band", "band@label.example"), copy(2), copy(3, "jo rivers"), copy(4, "Jo Rivers")];
    expect(accountsHandlesPointTo(matched, ownerOf)).toEqual([
      { pubkey: REAL, names: ["Jo Rivers"], count: 3 },
      { pubkey: OTHER, names: ["The Band"], count: 1 },
    ]);
  });
});
