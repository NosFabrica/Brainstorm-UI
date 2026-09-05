// @vitest-environment jsdom
/**
 * Benjamin: should Next work when someone plays one track? "Would be nice to
 * click next and hear that user's next audio." No queue to manage: when
 * nothing is lined up, Next means more from the same artist — their other
 * tracks on Nostr, or their other songs on Wavlake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const recentMock = vi.fn<(pk: string, kinds: number[], limit: number) => Promise<unknown[]>>(async () => []);
vi.mock("@/services/nostr", () => ({ fetchRecentByKinds: (pk: string, kinds: number[], limit: number) => recentMock(pk, kinds, limit) }));
const catalogueMock = vi.fn(async () => ({ artists: [], albums: [], songs: [] as unknown[] }));
vi.mock("@/lib/wavlake", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/wavlake")>()), searchWavlake: (term: string) => catalogueMock(term) }));

import { moreFromArtist } from "./upNext";

const NOVA = "d".repeat(64);
const track = (id: string, title: string) => ({ id, kind: 31337, pubkey: NOVA, created_at: 1, tags: [["d", id], ["title", title], ["artist", "NOVA"], ["media", `https://x/${id}.mp3`], ["image", `https://x/${id}.jpg`]], content: "" });

describe("moreFromArtist", () => {
  beforeEach(() => { recentMock.mockReset(); recentMock.mockResolvedValue([]); catalogueMock.mockReset(); catalogueMock.mockResolvedValue({ artists: [], albums: [], songs: [] }); });

  it("a native track: the author's other tracks, newest first, the current one left out", async () => {
    recentMock.mockResolvedValue([track("cur", "Old Carbon"), track("t2", "Duende"), { id: "junk", kind: 31337, pubkey: NOVA, created_at: 1, tags: [["d", "x"]], content: "{}" }, track("t3", "Easting")]);
    const next = await moreFromArtist({ id: "cur", artist: "NOVA", artistPubkey: NOVA });
    expect(recentMock).toHaveBeenCalledWith(NOVA, [31337], expect.any(Number));
    expect(next.map((t) => t.title)).toEqual(["Duende", "Easting"]);
    expect(next[0]).toMatchObject({ id: "t2", src: "https://x/t2.mp3", artist: "NOVA", cover: "https://x/t2.jpg", artistPubkey: NOVA });
    expect(next[0].href).toMatch(/^\/e\//);
    expect(next[0].artistHref).toMatch(/^\/p\/npub1/);
  });

  it("a Wavlake song: the same artist's other songs from the catalogue", async () => {
    catalogueMock.mockResolvedValue({
      artists: [],
      albums: [],
      songs: [
        { id: "wavlake:cur", title: "Two Ships", artist: "Ainsley Costello", audio: "https://cdn/2.mp3", url: "https://wavlake.com/track/cur", source: "wavlake", artistNpub: "" },
        { id: "wavlake:o1", title: "Old Song", artist: "Ainsley Costello", audio: "https://cdn/o.mp3", cover: "https://img/o.jpg", url: "https://wavlake.com/track/o1", source: "wavlake", artistNpub: "" },
        { id: "wavlake:x1", title: "Someone Else", artist: "Another Artist", audio: "https://cdn/x.mp3", url: "https://wavlake.com/track/x1", source: "wavlake", artistNpub: "" },
      ],
    });
    const next = await moreFromArtist({ id: "wavlake:cur", artist: "Ainsley Costello" });
    expect(catalogueMock).toHaveBeenCalledWith("Ainsley Costello");
    expect(next.map((t) => t.title)).toEqual(["Old Song"]);
    expect(next[0]).toMatchObject({ id: "wavlake:o1", src: "https://cdn/o.mp3", href: "https://wavlake.com/track/o1" });
  });

  it("nothing to go on, or a source that is down, is an empty list", async () => {
    expect(await moreFromArtist({ id: "lone" })).toEqual([]);
    recentMock.mockRejectedValue(new Error("offline"));
    expect(await moreFromArtist({ id: "cur", artist: "NOVA", artistPubkey: NOVA })).toEqual([]);
  });
});
