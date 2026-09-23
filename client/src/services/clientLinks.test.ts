/**
 * A Primal pretty URL to the Nostr entity it names: the NIP-05 name to a
 * pubkey, then the article by coordinate — or the person. Cached for the
 * session by the canonical ref, so the inline slot and the card gate that
 * both ask about one link agree, and ask once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";

const nip05Mock = vi.fn<(handle: string) => Promise<string | null>>();
vi.mock("@/lib/nip05", () => ({ resolveNip05: (h: string) => nip05Mock(h) }));
const addressableMock = vi.fn<(ptrs: { kind: number; pubkey: string; identifier: string }[]) => Promise<Map<string, NostrEvent>>>();
const profilesMock = vi.fn<(pks: string[]) => Promise<Map<string, { name?: string; display_name?: string }>>>();
vi.mock("@/services/nostr", () => ({
  fetchAddressableEvents: (ptrs: { kind: number; pubkey: string; identifier: string }[]) => addressableMock(ptrs),
  fetchProfileMap: (pks: string[]) => profilesMock(pks),
}));

import { __resetClientLinks, peekClientLink, resolveClientLink } from "./clientLinks";

const PK = "75d737c3472471029c44876b330d2284288a42779b591a2ed4daa1c6c07efaf7";
const ARTICLE = { id: "1".repeat(64), kind: 30023, pubkey: PK, tags: [["d", "were-back"], ["title", "We're back"]], content: "# We're back", created_at: 1, sig: "s" } as NostrEvent;
const ref = { kind: "article" as const, name: "whitenoise", identifier: "were-back" };

beforeEach(() => {
  vi.clearAllMocks();
  __resetClientLinks();
  nip05Mock.mockResolvedValue(PK);
  addressableMock.mockResolvedValue(new Map([[`30023:${PK}:were-back`, ARTICLE]]));
  profilesMock.mockResolvedValue(new Map([[PK, { name: "White Noise" }]]));
});

describe("resolveClientLink", () => {
  it("an article: the name to a pubkey, the article by coordinate, its author", async () => {
    const entity = await resolveClientLink(ref);
    expect(nip05Mock).toHaveBeenCalledWith("whitenoise@primal.net");
    expect(addressableMock).toHaveBeenCalledWith([{ kind: 30023, pubkey: PK, identifier: "were-back" }]);
    expect(entity).toEqual({ kind: "article", event: ARTICLE, author: { name: "White Noise" } });
  });

  it("null when the name does not resolve — and no relay is asked; null when the article is not there", async () => {
    nip05Mock.mockResolvedValueOnce(null);
    expect(await resolveClientLink(ref)).toBeNull();
    expect(addressableMock).not.toHaveBeenCalled();
    __resetClientLinks();
    addressableMock.mockResolvedValueOnce(new Map());
    expect(await resolveClientLink(ref)).toBeNull();
  });

  it("a person: the name to a pubkey, with their profile", async () => {
    expect(await resolveClientLink({ kind: "profile", name: "whitenoise" })).toEqual({ kind: "profile", pubkey: PK, npub: nip19.npubEncode(PK), profile: { name: "White Noise" } });
  });

  it("asks once per entity, and can be peeked once settled", async () => {
    expect(peekClientLink(ref)).toBeUndefined();
    const [a, b] = await Promise.all([resolveClientLink(ref), resolveClientLink({ ...ref })]);
    expect(b).toBe(a);
    expect(nip05Mock).toHaveBeenCalledTimes(1);
    expect(peekClientLink(ref)).toBe(a);
  });
});
