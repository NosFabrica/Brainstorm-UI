import { describe, expect, it } from "vitest";
import type { SearchHit } from "@/services/search";
import { isPersonCard, personRowSteppedAside } from "./TabResultCard";

const A = "a".repeat(64);
const B = "b".repeat(64);
const profile = (pubkey: string, withAuthor = true): SearchHit => ({
  event: { id: pubkey.slice(0, 63) + "0", pubkey, created_at: 1, kind: 0, tags: [], content: "{}", sig: "" },
  author: withAuthor ? { pubkey, npub: "", wotRank: null, wotFollowers: null } : null,
  rank: null,
});

describe("a person's row", () => {
  it("is a person card when it is a profile with its author", () => {
    const none = { newAccountOf: new Map<string, string>(), peopleOnPage: [A] };
    expect(isPersonCard(profile(A), none)).toBe(true);
    expect(isPersonCard(profile(A, false), none)).toBe(false);
    expect(isPersonCard({ ...profile(A), event: { ...profile(A).event, kind: 1 } }, none)).toBe(false);
  });

  it("steps aside when it is the new account of a compromised one on the page", () => {
    // B's account was compromised; A is its new one, already shown above B's row.
    const ctx = { newAccountOf: new Map([[A, B]]), peopleOnPage: [A, B] };
    expect(personRowSteppedAside(A, ctx)).toBe(true);
    expect(isPersonCard(profile(A), ctx)).toBe(false);
    expect(personRowSteppedAside(A, { ...ctx, peopleOnPage: [A] })).toBe(false);
  });
});
