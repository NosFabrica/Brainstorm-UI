// @vitest-environment node
/**
 * A tag's carriers as people for search — the same trust-filtered read the
 * profile chip and the tag page use, under the house observer unless the
 * viewer asked for their own perspective. Once per tag per session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TagSummary } from "@/services/tags";

const TAG_AUTHOR = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const SHAWN = "1".repeat(64),
  AVI = "2".repeat(64);
const detailMock = vi.fn(async (_author: string, _slug: string, _viewer?: string, _observer?: string) => ({
  carriers: [
    {
      pubkey: SHAWN,
      applications: 3,
      disputes: 0,
      asserters: [],
      selfDeclared: false,
      subjectDisagreed: false,
      addedAt: 1700,
    },
    {
      pubkey: AVI,
      applications: 1,
      disputes: 0,
      asserters: [],
      selfDeclared: false,
      subjectDisagreed: false,
      addedAt: 1800,
    },
  ],
}));
const profilesMock = vi.fn(
  async (pks: string[]) =>
    new Map(
      pks.map((pk) => [
        pk,
        pk === SHAWN
          ? { name: "shawn", display_name: "Shawn", picture: "https://img/shawn.jpg", nip05: "_@shawnyeager.com" }
          : { name: "avi" },
      ]),
    ),
);
vi.mock("@/services/tags", () => ({
  fetchTagDetail: (a: string, s: string, v?: string, o?: string) => detailMock(a, s, v, o),
}));
vi.mock("@/services/nostr", () => ({ fetchProfileMap: (pks: string[]) => profilesMock(pks) }));

import { __resetTagCarriers, fetchTagCarrierPeople } from "./tagCarriers";

const human: TagSummary = {
  key: `39999:${TAG_AUTHOR}:verified-human`,
  authorPubkey: TAG_AUTHOR,
  slug: "verified-human",
  name: "Verified Human",
  people: 2,
  vouches: 2,
  sharesName: 0,
  unverified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetTagCarriers();
});

describe("fetchTagCarrierPeople", () => {
  it("reads the tag's carriers under the given observer and names them from their profiles", async () => {
    const people = await fetchTagCarrierPeople(human, "house");
    expect(detailMock).toHaveBeenCalledWith(TAG_AUTHOR, "verified-human", undefined, "house");
    expect(people.map((p) => p.pubkey)).toEqual([SHAWN, AVI]);
    expect(people[0]).toMatchObject({
      name: "shawn",
      displayName: "Shawn",
      picture: "https://img/shawn.jpg",
      nip05: "_@shawnyeager.com",
      applications: 3,
      addedAt: 1700,
    });
    expect(people[0].npub.startsWith("npub1")).toBe(true);
  });

  it("asks once per tag and observer for the session", async () => {
    await Promise.all([fetchTagCarrierPeople(human, "house"), fetchTagCarrierPeople(human, "house")]);
    await fetchTagCarrierPeople(human, "house");
    expect(detailMock).toHaveBeenCalledTimes(1);
    await fetchTagCarrierPeople(human, "3".repeat(64));
    expect(detailMock).toHaveBeenCalledTimes(2);
  });

  it("answers nobody when the hub fails, and asks again next time", async () => {
    detailMock.mockRejectedValueOnce(new Error("relay down"));
    expect(await fetchTagCarrierPeople(human, "house")).toEqual([]);
    expect(await fetchTagCarrierPeople(human, "house")).toHaveLength(2);
  });
});
