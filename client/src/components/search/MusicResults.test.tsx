// @vitest-environment jsdom
/**
 * The Music tab with its third source: the team's V4V Songs and V4V
 * Musicians lists from Podcast Index (2026-09-24), beside native tracks and
 * Wavlake, under the Music icon. Songs are rows that play and join the
 * queue; musicians are faces that open their music here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PodcastMusician, PodcastSong } from "@/lib/dlists";
import type { SearchHit } from "@/services/search";
import { nip19 } from "nostr-tools";

const trendingMock = vi.fn(async () => [] as unknown[]);
vi.mock("@/lib/wavlake", async (original) => ({ ...(await original<Record<string, unknown>>()), fetchWavlakeTrending: () => trendingMock() }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));

import { MusicResults } from "./MusicResults";
import { peekNext, playerSnapshot, setPlaylist } from "@/lib/audioPlayer";

const song = (n: number, title: string): PodcastSong => ({
  id: `podcastindex:${String(n).padEnd(64, "0")}`, eventId: String(n).padEnd(64, "0"), title, artist: "Torcon 7",
  audio: `https://mp3s.podcastindex.org/${n}.mp3`, cover: "https://feeds.podcastindex.org/torcon7cover.jpg", durationSec: 316,
  url: "https://podcastindex.org/podcast/4148683#4", source: "podcastindex",
});
const torcon: PodcastMusician = { id: `podcastindex:${"9".repeat(64)}`, name: "Torcon 7", artwork: "https://feeds.podcastindex.org/torcon7cover.jpg", url: "https://podcastindex.org/podcast/4148683", source: "podcastindex" };
const NOVA = "d".repeat(64);
const nativeHit: SearchHit = {
  event: { id: "t1".padEnd(64, "0"), kind: 31337, pubkey: NOVA, created_at: 1_727_000_000, sig: "", content: "", tags: [["d", "old-carbon"], ["title", "Old Carbon"], ["artist", "NOVA"], ["media", "https://renaissancemachine.ai/music/old-carbon.mp3"], ["duration", "214"]] },
  author: null,
  rank: null,
};
const noWavlake = { artists: [], albums: [], songs: [], loading: false };
const open = (props: Partial<Parameters<typeof MusicResults>[0]> = {}) =>
  render(<MusicResults hits={[]} query="" wavlake={noWavlake} podcastIndex={{ songs: [], musicians: [], loading: false }} tagged={{ people: [], loading: false }} scoreOf={() => null} onOpenProfile={vi.fn()} {...props} />);

beforeEach(() => {
  trendingMock.mockResolvedValue([]);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  setPlaylist([]);
});
afterEach(() => vi.restoreAllMocks());

describe("MusicResults — the V4V lists while browsing", () => {
  it("lists the V4V songs as cover tiles that play; Show all lays them out as rows that name Podcast Index as their source", () => {
    open({ podcastIndex: { songs: [song(1, "Step Into the Light")], musicians: [], loading: false } });
    const section = screen.getByTestId("music-podcastindex-songs");
    expect(section).toHaveTextContent("Value-for-value songs");
    expect(section).toHaveTextContent("from Podcast Index");
    const tile = within(section).getByTestId(`music-tile-${song(1, "").id}`);
    expect(tile).toHaveTextContent("Step Into the Light");
    expect(tile).toHaveTextContent("Torcon 7");
    expect(within(tile).getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("shows the V4V musicians as faces that open their music here", () => {
    open({ podcastIndex: { songs: [], musicians: [torcon], loading: false } });
    const section = screen.getByTestId("music-podcastindex-musicians");
    expect(section).toHaveTextContent("Value-for-value musicians");
    const face = within(section).getByTestId(`music-artist-podcastindex-${torcon.id}`);
    expect(face).toHaveTextContent("Torcon 7");
    expect(face).toHaveTextContent("Podcast Index");
    expect(face).toHaveAttribute("href", "/?q=Torcon%207&t=music");
  });

  it("wears the Music icon on its sections", () => {
    open({ podcastIndex: { songs: [song(1, "Step Into the Light")], musicians: [torcon], loading: false } });
    expect(screen.getByTestId("music-podcastindex-songs").querySelector("svg.lucide-music")).not.toBeNull();
    expect(screen.getByTestId("music-podcastindex-musicians").querySelector("svg.lucide-music")).not.toBeNull();
  });

  it("the songs join the play queue after the native tracks, and Play starts one", () => {
    const [a, b] = [song(1, "Step Into the Light"), song(2, "Kingsfall")];
    open({ hits: [nativeHit], podcastIndex: { songs: [a, b], musicians: [], loading: false } });
    expect(peekNext(nativeHit.event.id)?.id).toBe(a.id);
    expect(peekNext(a.id)?.id).toBe(b.id);
    fireEvent.click(within(screen.getByTestId(`music-tile-${a.id}`)).getByRole("button", { name: "Play" }));
    expect(playerSnapshot().currentId).toBe(a.id);
  });

  it("browsing shows a shelf of one song per musician, says how many there are, and Show all brings the rest in list order", () => {
    // Live (2026-09-24): the list holds 436 songs and the top of it was one artist's album — a shelf, one per musician, not a wall.
    const songs = Array.from({ length: 30 }, (_, i) => ({ ...song(i + 1, `Song ${i + 1}`), artist: ["Torcon 7", "Able Kirby", "Stereon"][i % 3] }));
    open({ podcastIndex: { songs, musicians: [], loading: false } });
    const section = screen.getByTestId("music-podcastindex-songs");
    const shelf = [...section.querySelectorAll('[data-testid^="music-tile-"]')].map((el) => el.textContent);
    expect(shelf).toHaveLength(3);
    expect(shelf[0]).toContain("Song 1");
    expect(shelf[1]).toContain("Song 2");
    expect(shelf[2]).toContain("Song 3");
    expect(section).toHaveTextContent("30");
    fireEvent.click(within(section).getByTestId("music-podcastindex-more"));
    expect(section.querySelectorAll('[data-testid^="podcastindex-song-"]')).toHaveLength(30);
    expect(within(section).queryByTestId("music-podcastindex-more")).toBeNull();
  });

  it("says in one sentence why the shelves exist, behind an info mark", () => {
    open({ podcastIndex: { songs: [song(1, "Step Into the Light")], musicians: [torcon], loading: false } });
    const marks = screen.getAllByTestId("music-v4v-why");
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveAttribute("aria-label", "Value-for-value: listeners pay these artists directly, no label and no platform between them.");
  });

  it("the front runs trust first: the network's musicians, then value-for-value songs and musicians, then Wavlake's chart, then New on Nostr", () => {
    // Benjamin (2026-09-24): a music home like Spotify's — rails, and Brainstorm's own signal above a third-party chart.
    const JOE = "1".repeat(64);
    open({ hits: [nativeHit], podcastIndex: { songs: [song(1, "Step Into the Light")], musicians: [torcon], loading: false }, tagged: { people: [{ pubkey: JOE, npub: nip19.npubEncode(JOE), name: "Joe Martin" }], loading: false } });
    const order = [...screen.getByTestId("music-results").querySelectorAll("section[data-testid]")].map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["music-tagged-musicians", "music-podcastindex-songs", "music-podcastindex-musicians", "music-trending", "music-new"]);
  });

  it("value-for-value songs are a rail of cover tiles that play, one per musician; Show all lays the whole list out as rows", () => {
    const songs = Array.from({ length: 6 }, (_, i) => ({ ...song(i + 1, `Song ${i + 1}`), artist: ["Torcon 7", "Able Kirby"][i % 2] }));
    open({ podcastIndex: { songs, musicians: [], loading: false } });
    const section = screen.getByTestId("music-podcastindex-songs");
    const rail = within(section).getByTestId("music-podcastindex-songs-rail");
    const tiles = rail.querySelectorAll('[data-testid^="music-tile-podcastindex:"]');
    expect(tiles).toHaveLength(2);
    expect(section.querySelectorAll('[data-testid^="podcastindex-song-"]')).toHaveLength(0);
    fireEvent.click(within(tiles[0] as HTMLElement).getByRole("button", { name: "Play" }));
    expect(playerSnapshot().currentId).toBe(songs[0].id);
    fireEvent.click(within(section).getByTestId("music-podcastindex-more"));
    expect(section.querySelectorAll('[data-testid^="podcastindex-song-"]')).toHaveLength(6);
  });

  it("the genre chips belong to Wavlake's chart, inside its shelf, and the chart is one row with one tile per artist", async () => {
    trendingMock.mockResolvedValue([
      { id: "wavlake:a", title: "A", artist: "DJ Lexo", audio: "https://w/a.mp3", source: "wavlake" },
      { id: "wavlake:b", title: "B", artist: "DJ Lexo", audio: "https://w/b.mp3", source: "wavlake" },
      { id: "wavlake:c", title: "C", artist: "HYDRA", audio: "https://w/c.mp3", source: "wavlake" },
    ]);
    open();
    const trending = await screen.findByTestId("music-trending");
    await within(trending).findByTestId("music-tile-wavlake:a");
    expect(within(trending).getByTestId("music-genres")).toBeInTheDocument();
    expect(screen.getAllByTestId("music-genres")).toHaveLength(1);
    const tiles = [...trending.querySelectorAll('[data-testid^="music-tile-"]')].map((el) => el.getAttribute("data-testid"));
    expect(tiles).toEqual(["music-tile-wavlake:a", "music-tile-wavlake:c"]);
    expect(within(trending).getByTestId("music-trending-rail")).toBeInTheDocument();
  });

  it("keeps the promise visible: Support the artist on a song's row and on a musician's face, opening their Podcast Index page", () => {
    open({ podcastIndex: { songs: [song(1, "Step Into the Light"), song(2, "Kingsfall")], musicians: [torcon], loading: false } });
    fireEvent.click(screen.getByTestId("music-podcastindex-more"));
    const row = screen.getByTestId(`podcastindex-song-${song(1, "").id}`);
    const support = within(row).getByRole("link", { name: "Support the artist" });
    expect(support).toHaveAttribute("href", "https://podcastindex.org/podcast/4148683#4");
    expect(support).toHaveAttribute("target", "_blank");
    const face = screen.getByTestId(`music-podcastindex-support-${torcon.id}`);
    expect(face).toHaveTextContent("Support the artist");
    expect(face).toHaveAttribute("href", "https://podcastindex.org/podcast/4148683");
  });

  it("nothing from the lists is nothing on the page", () => {
    open();
    expect(screen.queryByTestId("music-podcastindex-songs")).toBeNull();
    expect(screen.queryByTestId("music-podcastindex-musicians")).toBeNull();
  });
});

describe("MusicResults — the V4V lists with words", () => {
  it("the matching songs sit in Songs after Wavlake's, the musicians in Artists", () => {
    const wavlakeSong = { id: "wavlake:w1", title: "Gold", artist: "Torcon 7", audio: "https://wavlake.example/w1.mp3", source: "wavlake" as const };
    open({ query: "torcon", wavlake: { ...noWavlake, songs: [wavlakeSong as never] }, podcastIndex: { songs: [song(1, "Step Into the Light")], musicians: [torcon], loading: false } });
    const songs = screen.getByTestId("music-songs");
    const order = [...songs.querySelectorAll('[data-testid^="wavlake-song-"], [data-testid^="podcastindex-song-"]')].map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["wavlake-song-wavlake:w1", `podcastindex-song-${song(1, "").id}`]);
    expect(songs).toHaveTextContent("2");
    expect(within(screen.getByTestId("music-artists")).getByTestId(`music-artist-podcastindex-${torcon.id}`)).toBeInTheDocument();
    expect(screen.getByTestId("music-songs").querySelector("svg.lucide-music")).not.toBeNull();
  });

  it("a musician who is also on Nostr is one face — the Nostr one, noting Podcast Index — and their songs point at that person", () => {
    const TORCON_PK = "7".repeat(64);
    const torconNostr = { pubkey: TORCON_PK, npub: nip19.npubEncode(TORCON_PK), name: "Torcon 7", display_name: "Torcon 7", picture: "" };
    const hit: SearchHit = {
      event: { id: "t7".padEnd(64, "0"), kind: 31337, pubkey: TORCON_PK, created_at: 1_727_000_000, sig: "", content: "", tags: [["d", "gold"], ["title", "Gold"], ["media", "https://example/gold.mp3"]] },
      author: torconNostr as never,
      rank: null,
    };
    open({ query: "torcon", hits: [hit], podcastIndex: { songs: [song(1, "Step Into the Light")], musicians: [torcon], loading: false } });
    const artists = screen.getByTestId("music-artists");
    expect(artists.querySelectorAll('[data-testid^="music-artist-podcastindex-"]')).toHaveLength(0);
    const face = within(artists).getByTestId(`music-artist-${TORCON_PK.slice(0, 8)}`);
    expect(face).toHaveTextContent("also on Podcast Index");
    const row = screen.getByTestId(`podcastindex-song-${song(1, "").id}`);
    expect(within(row).getByRole("link", { name: /Torcon 7/ })).toHaveAttribute("href", `/p/${torconNostr.npub}`);
  });
});

describe("MusicResults — the musicians the network tagged", () => {
  // The team (2026-09-24): search finds music through the tagging lists too —
  // the people the network tagged Musician, most of whom publish no tracks.
  const JOE = "1".repeat(64);
  const joe = { pubkey: JOE, npub: nip19.npubEncode(JOE), name: "joemartin", displayName: "Joe Martin", picture: "https://img/joe.jpg" };
  const nova = { pubkey: "2".repeat(64), npub: nip19.npubEncode("2".repeat(64)), name: "NOVA" };

  it("browsing shows them as a shelf of faces with their trust rings, under the Music icon, each opening that person's music here", () => {
    // Benjamin (2026-09-24): a face in a music context is an artist page, not a bio — the listener stays in the music.
    open({ tagged: { people: [joe, nova], loading: false }, scoreOf: () => 0.4 });
    const shelf = screen.getByTestId("music-tagged-musicians");
    expect(shelf).toHaveTextContent("Musicians on Nostr");
    expect(shelf.querySelector("svg.lucide-music")).not.toBeNull();
    expect(within(shelf).getByTestId(`music-artist-${JOE.slice(0, 8)}`)).toHaveAttribute("href", `/?q=from%3A${joe.npub}&t=music`);
    expect(within(shelf).getByTestId(`music-artist-${"2".repeat(8)}`)).toHaveTextContent("NOVA");
  });

  it("a track author's face opens their music here too, and a Wavlake artist with a Nostr key likewise", () => {
    const hit: SearchHit = {
      event: { id: "j1".padEnd(64, "0"), kind: 31337, pubkey: JOE, created_at: 1_727_000_000, sig: "", content: "", tags: [["d", "hmdh"], ["title", "Hand Me Down Heart"], ["media", "https://example/hmdh.mp3"]] },
      author: joe as never,
      rank: null,
    };
    const wavlakeArtist = { id: "wl-1", name: "Ainsley Costello", artistNpub: nip19.npubEncode("3".repeat(64)) };
    open({ query: "joe martin", hits: [hit], wavlake: { ...noWavlake, artists: [wavlakeArtist as never] } });
    const artists = screen.getByTestId("music-artists");
    expect(within(artists).getByTestId(`music-artist-${JOE.slice(0, 8)}`)).toHaveAttribute("href", `/?q=from%3A${joe.npub}&t=music`);
    expect(within(artists).getByTestId("music-artist-wavlake-wl-1")).toHaveAttribute("href", `/?q=from%3A${wavlakeArtist.artistNpub}&t=music`);
  });

  it("with words, the tagged musicians whose name answers join Artists — once, even when they also have tracks here", () => {
    const hit: SearchHit = {
      event: { id: "j1".padEnd(64, "0"), kind: 31337, pubkey: JOE, created_at: 1_727_000_000, sig: "", content: "", tags: [["d", "hmdh"], ["title", "Hand Me Down Heart"], ["media", "https://example/hmdh.mp3"]] },
      author: joe as never,
      rank: null,
    };
    open({ query: "joe martin", hits: [hit], tagged: { people: [joe, nova], loading: false } });
    const artists = screen.getByTestId("music-artists");
    expect(artists.querySelectorAll(`[data-testid="music-artist-${JOE.slice(0, 8)}"]`)).toHaveLength(1);
    expect(within(artists).queryByTestId(`music-artist-${"2".repeat(8)}`)).toBeNull();
    expect(screen.queryByTestId("music-tagged-musicians")).toBeNull();
  });

  it("the word \"musician\" lists everyone the network tagged", () => {
    open({ query: "musician", tagged: { people: [joe, nova], loading: false } });
    const artists = screen.getByTestId("music-artists");
    expect(within(artists).getByTestId(`music-artist-${JOE.slice(0, 8)}`)).toBeInTheDocument();
    expect(within(artists).getByTestId(`music-artist-${"2".repeat(8)}`)).toBeInTheDocument();
  });
});

describe("MusicResults — a person's music view with what they linked on Fountain", () => {
  // Live (2026-09-24): Matt Finlay's four Fountain links are podcast episodes he
  // was on, not songs — the top result said "4 songs". It says what they are.
  const MATT = "4".repeat(64);
  const matt = { pubkey: MATT, npub: nip19.npubEncode(MATT), name: "Matt Finlay" };
  const episode = (id: string, title: string) => ({ kind: "episode" as const, id, show: "Homegrown Hits", title, description: null, image: null, audio: `https://cdn/${id}.mp3`, url: `https://fountain.fm/episode/${id}` });
  const track = (id: string, title: string) => ({ kind: "track" as const, id, show: "Matt Finlay", title, description: null, image: null, audio: `https://cdn/${id}.mp3`, url: `https://fountain.fm/track/${id}` });

  it("counts episodes as episodes and songs as songs in the top result", () => {
    open({ query: `from:${matt.npub}`, person: matt, fountain: { items: [episode("e1", "Episode 151"), episode("e2", "Episode 152")], loading: false } });
    expect(screen.getByTestId("music-top-result")).toHaveTextContent("Artist · 2 episodes");
    open({ query: `from:${matt.npub}`, person: matt, fountain: { items: [track("t1", "Homegrown Blues"), episode("e1", "Episode 151")], loading: false } });
    expect(screen.getAllByTestId("music-top-result").at(-1)).toHaveTextContent("Artist · 1 song · 1 episode");
  });

  it("the list is called what it holds: Episodes when that is all, Songs & episodes when mixed", () => {
    open({ query: `from:${matt.npub}`, person: matt, fountain: { items: [episode("e1", "Episode 151"), episode("e2", "Episode 152")], loading: false } });
    expect(screen.getByTestId("music-songs").querySelector("h2")).toHaveTextContent("Episodes");
    open({ query: `from:${matt.npub}`, person: matt, fountain: { items: [track("t1", "Homegrown Blues"), episode("e1", "Episode 151")], loading: false } });
    expect(screen.getAllByTestId("music-songs").at(-1)!.querySelector("h2")).toHaveTextContent("Songs & episodes");
  });
});
