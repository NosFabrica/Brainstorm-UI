import { describe, it, expect, vi, beforeEach } from "vitest";
import { findWavlakeArtist, searchWavlakeTracks, __resetWavlakeCatalogue } from "./wavlake";

// Wavlake's public API as probed 2026-09-04: search names artists and albums,
// an artist lists albums, an album lists tracks with the mp3.
const ARTIST = "3dac722c-4375-458c-80f6-3b4040574ee7";
const ALBUM_NEW = "e5c8aedd-13a1-449c-aaa8-13cfbfbbac97";
const ALBUM_OLD = "703f1497-9b75-4984-8398-23a395f01493";
const catalogue: Record<string, unknown> = {
  "search?term=ainsley%20costello": {
    success: true,
    data: [
      { id: ARTIST, type: "artist", name: "Ainsley Costello", url: "ainsley-costello", avatarUrl: "https://img/ainsley.jpg" },
      { id: "9dc4", type: "album", name: "Two Ships JSTR REMIX", avatarUrl: "https://img/ainsley.jpg" },
    ],
  },
  "search?term=ainsley": { success: true, data: [{ id: ARTIST, type: "artist", name: "Ainsley Costello", url: "ainsley-costello" }] },
  "search?term=nova": { success: true, data: [{ id: "n0va", type: "artist", name: "NOVA Sound System", url: "nova-sound-system" }] },
  [`content/artist/${ARTIST}`]: {
    id: ARTIST,
    name: "Ainsley Costello",
    artistNpub: "",
    url: "https://wavlake.com/ainsley-costello",
    albums: [
      { id: ALBUM_OLD, title: "Old Times", releaseDate: "2023-08-01T00:00:00.000Z" },
      { id: ALBUM_NEW, title: "Two Ships", releaseDate: "2025-03-01T00:00:00.000Z" },
    ],
  },
  [`content/album/${ALBUM_NEW}`]: {
    id: ALBUM_NEW,
    title: "Two Ships",
    albumArtUrl: "https://img/two-ships.jpg",
    tracks: [{ id: "04cead49", title: "Two Ships", artist: "Ainsley Costello", albumTitle: "Two Ships", duration: 217, mediaUrl: "https://cdn/two-ships.mp3", msatTotal: "519508000", artistNpub: "" }],
  },
  [`content/album/${ALBUM_OLD}`]: {
    id: ALBUM_OLD,
    title: "Old Times",
    albumArtUrl: "https://img/old-times.jpg",
    tracks: [{ id: "0ld1", title: "Old Song", artist: "Ainsley Costello", albumTitle: "Old Times", duration: 180, mediaUrl: "https://cdn/old.mp3", msatTotal: "1000" }],
  },
};

beforeEach(() => {
  __resetWavlakeCatalogue();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      const key = Object.keys(catalogue).find((k) => url.endsWith(k) || url.includes(`/${k}`));
      if (!key) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(catalogue[key]), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

describe("Wavlake as a second music source", () => {
  it("turns the words into playable tracks: the matching artist's newest album first", async () => {
    const tracks = await searchWavlakeTracks("ainsley costello");
    expect(tracks[0]).toMatchObject({
      id: "wavlake:04cead49",
      title: "Two Ships",
      artist: "Ainsley Costello",
      audio: "https://cdn/two-ships.mp3",
      cover: "https://img/two-ships.jpg",
      durationSec: 217,
      url: "https://wavlake.com/track/04cead49",
      source: "wavlake",
    });
    // Newest release leads; the back catalogue follows.
    expect(tracks.map((t) => t.title)).toEqual(["Two Ships", "Old Song"]);
  });

  it("finds an artist by exact name, never by a loose contains", async () => {
    expect((await findWavlakeArtist({ name: "Ainsley Costello" }))?.id).toBe(ARTIST);
    expect((await findWavlakeArtist({ name: "ainsley" }))).toBeNull();
    expect((await findWavlakeArtist({ name: "NOVA" }))).toBeNull();
  });

  it("answers nothing, quietly, when Wavlake is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await searchWavlakeTracks("ainsley costello")).toEqual([]);
    expect(await findWavlakeArtist({ name: "Ainsley Costello" })).toBeNull();
  });
});
