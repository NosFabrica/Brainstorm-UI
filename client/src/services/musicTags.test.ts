// @vitest-environment node
/**
 * The musicians the network has tagged — the tagging list behind the
 * "Musician" chip on a profile — as people for the Music tab. The team
 * (2026-09-24): search should find music through the tagging lists too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const TAG_AUTHOR = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const JOE = "1".repeat(64), NOVA = "2".repeat(64);
const detailMock = vi.fn(async (_author: string, _slug: string, _viewer?: string, _observer?: string) => ({
  carriers: [{ pubkey: JOE, applications: 3, disputes: 0, asserters: [], selfDeclared: false, subjectDisagreed: false }, { pubkey: NOVA, applications: 1, disputes: 0, asserters: [], selfDeclared: false, subjectDisagreed: false }],
}));
const profilesMock = vi.fn(async (pks: string[]) => new Map(pks.map((pk) => [pk, pk === JOE ? { name: "joemartin", display_name: "Joe Martin", picture: "https://img/joe.jpg" } : { name: "NOVA" }])));
vi.mock("@/services/tags", () => ({ fetchTagDetail: (a: string, s: string, v?: string, o?: string) => detailMock(a, s, v, o) }));
vi.mock("@/services/nostr", () => ({ fetchProfileMap: (pks: string[]) => profilesMock(pks) }));

import { __resetTaggedMusicians, fetchTaggedMusicians } from "./musicTags";

beforeEach(() => {
  vi.clearAllMocks();
  __resetTaggedMusicians();
});

describe("fetchTaggedMusicians", () => {
  it("asks for the Musician tag's trusted carriers, under the house observer, and returns them as people with their names", async () => {
    const people = await fetchTaggedMusicians();
    expect(detailMock).toHaveBeenCalledWith(TAG_AUTHOR, "musician", undefined, "house");
    expect(people.map((p) => [p.pubkey, p.displayName ?? p.name, p.picture])).toEqual([[JOE, "Joe Martin", "https://img/joe.jpg"], [NOVA, "NOVA", undefined]]);
    expect(people[0].npub).toMatch(/^npub1/);
  });

  it("a tag read that fails is nobody, not an error — and the next visit asks again", async () => {
    detailMock.mockRejectedValueOnce(new Error("hub down"));
    expect(await fetchTaggedMusicians()).toEqual([]);
    expect((await fetchTaggedMusicians()).length).toBe(2);
  });

  it("asks once per session", async () => {
    await fetchTaggedMusicians();
    await fetchTaggedMusicians();
    expect(detailMock).toHaveBeenCalledTimes(1);
  });
});
