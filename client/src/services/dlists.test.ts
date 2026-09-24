// @vitest-environment node
/**
 * The lookup behind the Music tab's third source: the V4V lists' items,
 * asked of the tag hub once per session, read as songs and musicians. A
 * hub that fails is two empty lists — the tab looks as it did before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTHOR = "77599c5c4a7ba08456679d812a414037f4b01c975fb4f577187df11d189f80d3";
const SONGS = `39998:${AUTHOR}:b504f5a8-949f-4d31-ad14-8afcebde2b34`;
const MUSICIANS = `39998:${AUTHOR}:c7e2e5f1-2258-4d9d-92ed-d29b9837a82a`;
const song = (id: string, title: string, created_at: number, url = "https://mp3s.podcastindex.org/Step_Into_The_Light.mp3") => ({
  id: id.padEnd(64, "0"), pubkey: AUTHOR, kind: 9999, created_at, content: "",
  tags: [["z", SONGS], ["t", "https://podcastindex.org/podcast/4148683#4"], ["title", title], ["artist", "Torcon 7"], ["url", url], ["duration", "316"], ["artwork", "https://feeds.podcastindex.org/torcon7cover.jpg"]],
});
const musician = (id: string, name: string, created_at: number) => ({
  id: id.padEnd(64, "0"), pubkey: AUTHOR, kind: 9999, created_at, content: "",
  tags: [["z", MUSICIANS], ["t", "a94f5cc9"], ["name", name], ["feedId", "4148683"], ["feedGuid", "a94f5cc9"], ["artwork", "https://feeds.podcastindex.org/torcon7cover.jpg"]],
});

const fetchMock = vi.fn(async (_filter: unknown, _relays: string[]) => [] as unknown[]);
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: (f: unknown, r: string[]) => fetchMock(f, r) }));
vi.mock("@/config/tagging", async (original) => ({ ...(await original<Record<string, unknown>>()), tagRelays: () => ["wss://hub.example"] }));

import { __resetPodcastIndexCache, fetchPodcastIndexMusic } from "./dlists";

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue([]);
  __resetPodcastIndexCache();
});

describe("fetchPodcastIndexMusic", () => {
  it("asks the tag hub for both lists' items in one query", async () => {
    await fetchPodcastIndexMusic();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ kinds: [9999], "#z": [SONGS, MUSICIANS] }), ["wss://hub.example"]);
  });

  it("sorts each item into its list, newest first, and drops what it cannot read", async () => {
    fetchMock.mockResolvedValue([song("s1", "Step Into the Light", 10), musician("m1", "Torcon 7", 10), song("s2", "Kingsfall", 20, "https://mp3s.podcastindex.org/Kingsfall.mp3"), { ...song("s3", "Broken", 30), tags: [["z", SONGS]] }]);
    const r = await fetchPodcastIndexMusic();
    expect(r.songs.map((s) => s.title)).toEqual(["Kingsfall", "Step Into the Light"]);
    expect(r.musicians.map((m) => m.name)).toEqual(["Torcon 7"]);
  });

  it("a republished item counts once, the newest version winning", async () => {
    fetchMock.mockResolvedValue([song("s1", "Step Into the Light", 10), song("s2", "Step Into The Light (remaster)", 20), musician("m1", "Torcon 7", 10), musician("m2", "Torcon VII", 20)]);
    const r = await fetchPodcastIndexMusic();
    expect(r.songs.map((s) => s.title)).toEqual(["Step Into The Light (remaster)"]);
    expect(r.musicians.map((m) => m.name)).toEqual(["Torcon VII"]);
  });

  it("a hub that fails is two empty lists, not an error — and the next visit asks again", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    expect(await fetchPodcastIndexMusic()).toEqual({ songs: [], musicians: [] });
    fetchMock.mockResolvedValue([musician("m1", "Torcon 7", 10)]);
    expect((await fetchPodcastIndexMusic()).musicians).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks the hub once for the whole session", async () => {
    fetchMock.mockResolvedValue([musician("m1", "Torcon 7", 10)]);
    const [a, b] = await Promise.all([fetchPodcastIndexMusic(), fetchPodcastIndexMusic()]);
    await fetchPodcastIndexMusic();
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a musician with several feeds is one face; an email address is not a musician's name", async () => {
    // Live (2026-09-24): Robert Willey and Christian Leuenberg appear once per album feed, and one feed is named info@100percentretro.com.
    fetchMock.mockResolvedValue([
      { ...musician("m1", "Robert Willey", 10), tags: musician("m1", "Robert Willey", 10).tags.map((t) => (t[0] === "feedGuid" ? ["feedGuid", "feed-a"] : t)) },
      { ...musician("m2", "Robert Willey", 20), tags: musician("m2", "Robert Willey", 20).tags.map((t) => (t[0] === "feedGuid" ? ["feedGuid", "feed-b"] : t)) },
      musician("m3", "info@100percentretro.com", 30),
    ]);
    const r = await fetchPodcastIndexMusic();
    expect(r.musicians.map((m) => m.name)).toEqual(["Robert Willey"]);
    expect(r.musicians[0].feedGuid).toBe("feed-b");
  });
});
