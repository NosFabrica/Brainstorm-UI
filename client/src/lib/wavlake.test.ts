import { describe, it, expect, vi, beforeEach } from "vitest";
import { findWavlakeArtist, searchWavlakeTracks, searchWavlake, fetchWavlakeTrending, wavlakeTrackId, __resetWavlakeCatalogue } from "./wavlake";

// Wavlake's public API as probed 2026-09-04: search names artists and albums,
// an artist lists albums, an album lists tracks with the mp3.
const ARTIST = "3dac722c-4375-458c-80f6-3b4040574ee7";
const ALBUM_NEW = "e5c8aedd-13a1-449c-aaa8-13cfbfbbac97";
const ALBUM_OLD = "703f1497-9b75-4984-8398-23a395f01493";
const ranked = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    title: `${prefix} song ${i}`,
    artist: `Artist ${i}`,
    albumArtUrl: `https://img/${prefix}${i}.jpg`,
    artistArtUrl: `https://img/a${i}.jpg`,
    albumId: `alb${i}`,
    albumTitle: `Album ${i}`,
    mediaUrl: `https://cdn/${prefix}${i}.mp3`,
    url: `https://wavlake.com/track/${prefix}${i}`,
    msatTotal: String((10 - i) * 1_000_000),
    duration: 200 + i,
  }));
const catalogue: Record<string, unknown> = {
  // Wavlake's public rankings (probed 2026-09-04): top tracks by sats over a
  // window, optionally by genre; a week can be thin, a month rarely is.
  "content/rankings?sort=sats&days=7&limit=12": ranked(8, "wk"),
  "content/rankings?sort=sats&days=7&limit=12&genre=rock": ranked(2, "rk"),
  "content/rankings?sort=sats&days=30&limit=12&genre=rock": ranked(7, "rm"),
  "search?term=ainsley%20costello": {
    success: true,
    data: [
      { id: ARTIST, type: "artist", name: "Ainsley Costello", url: "ainsley-costello", avatarUrl: "https://img/ainsley.jpg" },
      { id: "9dc4", type: "album", name: "Two Ships JSTR REMIX", avatarUrl: "https://img/ainsley.jpg" },
    ],
  },
  "search?term=ainsley": { success: true, data: [{ id: ARTIST, type: "artist", name: "Ainsley Costello", url: "ainsley-costello" }] },
  // Live: Wavlake leads "nova" with Freddy Donovan — the letters inside a word.
  "search?term=nova": {
    success: true,
    data: [
      { id: "fr3d", type: "artist", name: "Freddy Donovan", url: "freddy-donovan" },
      { id: "n0va", type: "artist", name: "NOVA Sound System", url: "nova-sound-system" },
      { id: "1van", type: "artist", name: "Ivan Nova", url: "ivan-nova" },
    ],
  },
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
      // The most specific route wins: "…&limit=12" is a prefix of "…&limit=12&genre=rock".
      const key = Object.keys(catalogue)
        .filter((k) => url.endsWith(k) || url.includes(`/${k}`))
        .sort((a, b) => b.length - a.length)[0];
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

describe("Wavlake's trending — top tracks by sats, a week at a time", () => {
  it("reads the week's ranking into playable songs with their sats", async () => {
    const songs = await fetchWavlakeTrending();
    expect(songs).toHaveLength(8);
    expect(songs[0]).toMatchObject({
      id: "wavlake:wk0",
      title: "wk song 0",
      artist: "Artist 0",
      cover: "https://img/wk0.jpg",
      audio: "https://cdn/wk0.mp3",
      durationSec: 200,
      url: "https://wavlake.com/track/wk0",
      source: "wavlake",
      sats: 10_000,
    });
  });

  it("asks by genre, and widens a thin week to a month", async () => {
    const rock = await fetchWavlakeTrending({ genre: "rock" });
    expect(rock.map((s) => s.id.slice(8, 10))).toEqual(Array(7).fill("rm"));
  });

  it("is empty, not an error, when Wavlake is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchWavlakeTrending()).toEqual([]);
  });
});

// Spotify's anatomy needs the catalogue's three shapes, not only songs: the
// artists and albums Wavlake names for the words, as tiles of their own.
describe("searchWavlake — artists, albums and songs for the words", () => {
  it("returns the matching artists and albums beside the songs", async () => {
    const found = await searchWavlake("ainsley costello");
    expect(found.artists).toEqual([
      { id: ARTIST, name: "Ainsley Costello", url: "https://wavlake.com/ainsley-costello", artworkUrl: "https://img/ainsley.jpg", artistNpub: "" },
    ]);
    expect(found.albums).toEqual([{ id: "9dc4", title: "Two Ships JSTR REMIX", artist: "", artworkUrl: "https://img/ainsley.jpg", url: "https://wavlake.com/album/9dc4" }]);
    expect(found.songs.map((t) => t.title)).toEqual(["Two Ships", "Old Song"]);
  });

  it("puts the artists whose name answers to the words first", async () => {
    const found = await searchWavlake("nova");
    expect(found.artists.map((a) => a.name)).toEqual(["NOVA Sound System", "Ivan Nova", "Freddy Donovan"]);
  });

  it("answers three empty lists when Wavlake is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await searchWavlake("ainsley costello")).toEqual({ artists: [], albums: [], songs: [] });
  });
});

// Benjamin, over a Latest row linking stablekraft.app: "this should be able to
// play audio in brainstorm". Probed 2026-09-05: StableKraft is a storefront on
// Wavlake's catalogue — its artwork is on Wavlake's CDN and the UUID at the end
// of its `track` parameter answers at catalog.wavlake.com/v1/tracks/<id>.
describe("wavlakeTrackId — StableKraft links carry Wavlake track ids", () => {
  it("reads the track id from a stablekraft.app album link", () => {
    expect(wavlakeTrackId("https://stablekraft.app/album/empty-passenger-seat-1768077672996?track=empty-passenger-seat-1768077672996-d2e8e9cc-6f5d-44e6-8144-b7500545fb2d")).toBe("d2e8e9cc-6f5d-44e6-8144-b7500545fb2d");
    expect(wavlakeTrackId("https://www.stablekraft.app/album/x?track=x-d2e8e9cc-6f5d-44e6-8144-b7500545fb2d&ref=1")).toBe("d2e8e9cc-6f5d-44e6-8144-b7500545fb2d");
  });
  it("leaves a StableKraft album page without a track, and other sites, alone", () => {
    expect(wavlakeTrackId("https://stablekraft.app/album/empty-passenger-seat-1768077672996")).toBeUndefined();
    expect(wavlakeTrackId("https://example.com/album/x?track=x-d2e8e9cc-6f5d-44e6-8144-b7500545fb2d")).toBeUndefined();
    expect(wavlakeTrackId("https://wavlake.com/track/81c98053-ce9b-4824-b689-fe0934fe7b00")).toBe("81c98053-ce9b-4824-b689-fe0934fe7b00");
  });
});
