/**
 * A person's Wavlake catalogue — the artist who IS them (by linked Nostr key,
 * else exact name) and their songs. Joe Martin publishes one track to relays
 * and six to Wavlake; his profile's Audio block and a search scoped to him
 * should know all of them (Benjamin, 2026-09-05).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const findArtistMock = vi.fn(async (_q: { name?: string | null; pubkey?: string | null }) => null as null | { id: string; name: string; url: string; artistNpub: string });
const artistTracksMock = vi.fn(async (_id: string, _limit?: number) => [] as { id: string; title: string; artist: string; audio: string; url: string; source: "wavlake"; artistNpub: string }[]);
vi.mock("@/lib/wavlake", () => ({
  findWavlakeArtist: (q: { name?: string | null; pubkey?: string | null }) => findArtistMock(q),
  wavlakeArtistTracks: (id: string, limit?: number) => artistTracksMock(id, limit),
}));
const profileMapMock = vi.fn(async (_pks: string[]) => new Map<string, { name?: string; display_name?: string }>());
vi.mock("@/services/nostr", () => ({ fetchProfileMap: (pks: string[]) => profileMapMock(pks) }));

import { useArtistCatalogue } from "./useArtistCatalogue";

const JOE = "e".repeat(64);
const artist = { id: "art-1", name: "Joe Martin", url: "https://wavlake.com/joe-martin", artistNpub: "" };
const song = (id: string, title: string) => ({ id: `wavlake:${id}`, title, artist: "Joe Martin", audio: `https://cdn/${id}.mp3`, url: `https://wavlake.com/track/${id}`, source: "wavlake" as const, artistNpub: "" });

describe("useArtistCatalogue", () => {
  beforeEach(() => {
    findArtistMock.mockReset();
    artistTracksMock.mockReset();
    profileMapMock.mockReset();
    profileMapMock.mockResolvedValue(new Map());
  });

  it("with the name in hand, finds the artist by key and name and lists their songs", async () => {
    findArtistMock.mockResolvedValue(artist);
    artistTracksMock.mockResolvedValue([song("1", "Hand Me Down Heart"), song("2", "Checkmate")]);
    const { result } = renderHook(() => useArtistCatalogue(JOE, { name: "Joe Martin", limit: 6 }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(findArtistMock).toHaveBeenCalledWith({ name: "Joe Martin", pubkey: JOE });
    expect(artistTracksMock).toHaveBeenCalledWith("art-1", 6);
    expect(result.current.artist?.name).toBe("Joe Martin");
    expect(result.current.songs.map((s) => s.title)).toEqual(["Hand Me Down Heart", "Checkmate"]);
    expect(profileMapMock).not.toHaveBeenCalled();
  });

  it("without a name, reads it from the profile first", async () => {
    profileMapMock.mockResolvedValue(new Map([[JOE, { name: "joemartin", display_name: "Joe Martin" }]]));
    findArtistMock.mockResolvedValue(artist);
    artistTracksMock.mockResolvedValue([song("1", "Hand Me Down Heart")]);
    const { result } = renderHook(() => useArtistCatalogue(JOE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(profileMapMock).toHaveBeenCalledWith([JOE]);
    expect(findArtistMock).toHaveBeenCalledWith({ name: "Joe Martin", pubkey: JOE });
    expect(result.current.songs).toHaveLength(1);
  });

  it("nobody on Wavlake is an empty catalogue, not an error", async () => {
    findArtistMock.mockResolvedValue(null);
    const { result } = renderHook(() => useArtistCatalogue(JOE, { name: "Nobody" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.artist).toBeNull();
    expect(result.current.songs).toEqual([]);
    expect(artistTracksMock).not.toHaveBeenCalled();
  });

  it("no person, no questions asked", () => {
    const { result } = renderHook(() => useArtistCatalogue(null));
    expect(result.current).toEqual({ artist: null, songs: [], loading: false });
    expect(findArtistMock).not.toHaveBeenCalled();
    expect(profileMapMock).not.toHaveBeenCalled();
  });
});
