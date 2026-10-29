/**
 * Which listed account a profile's handle shows is its own: a domain is its
 * owner's, so a root handle on it (`_@riverdev.com`, or the name that is the
 * domain's, `riverdev@riverdev.com`) owns the account of that name. A name on
 * someone else's domain owns nothing — `sam@nostr.example` is one of many there.
 */
import { describe, expect, it } from "vitest";
import { accountOwnedBy } from "./ownedAccount";

const LISTED = ["riverdev", "beep-boop", "lakebuilder", "provider"];

describe("accountOwnedBy", () => {
  it("gives the account named for the domain a root handle stands on", () => {
    expect(accountOwnedBy("_@riverdev.com", LISTED)).toBe("riverdev");
    expect(accountOwnedBy("RiverDev@RiverDev.com", LISTED)).toBe("riverdev");
    // A provider's own root is the provider: its account, if listed.
    expect(accountOwnedBy("_@provider.net", LISTED)).toBe("provider");
  });

  it("gives nothing for a name on a domain that isn't the account's", () => {
    expect(accountOwnedBy("lakebuilder@lakebuilder-home.com", LISTED)).toBeNull();
    expect(accountOwnedBy("sam@nostr.example", ["sam", "nostr"])).toBeNull();
    expect(accountOwnedBy("jo@provider.net", LISTED)).toBeNull();
  });

  it("gives nothing without a handle, or for an account the list doesn't hold", () => {
    expect(accountOwnedBy(undefined, LISTED)).toBeNull();
    expect(accountOwnedBy("", LISTED)).toBeNull();
    expect(accountOwnedBy("_@someoneelse.com", LISTED)).toBeNull();
  });
});
