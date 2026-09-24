/**
 * The Decentralized Lists the app reads as content — first, the team's two
 * V4V music lists from Podcast Index (2026-09-24), the concrete first step
 * of the D-list approach to categories: a list coordinate names a
 * category, the category has an icon, and a list's kind-9999 items read as
 * songs and musicians. The grammar only; fetching is services/dlists.
 */
import { describe, expect, it } from "vitest";
import { Music } from "lucide-react";
import { nip19 } from "nostr-tools";
import { dlistCoordinateOf, dlistFor, filterPodcastIndex, parseDListMusician, parseDListSong } from "./dlists";

const AUTHOR = "77599c5c4a7ba08456679d812a414037f4b01c975fb4f577187df11d189f80d3";
const SONGS = `39998:${AUTHOR}:b504f5a8-949f-4d31-ad14-8afcebde2b34`;
const MUSICIANS = `39998:${AUTHOR}:c7e2e5f1-2258-4d9d-92ed-d29b9837a82a`;

const songEv = {
  id: "a313660f".padEnd(64, "0"), pubkey: AUTHOR, kind: 9999, created_at: 1773697595, content: "",
  tags: [["z", SONGS], ["t", "https://podcastindex.org/podcast/4148683#4"], ["title", "Step Into the Light"], ["artist", "Torcon 7"],
    ["url", "https://mp3s.podcastindex.org/Step_Into_The_Light.mp3"], ["duration", "316"], ["feedId", "4148683"],
    ["feedGuid", "a94f5cc9-8c58-55fc-91fe-a324087a655b"], ["artwork", "https://feeds.podcastindex.org/torcon7cover.jpg"], ["alt", "Song: Step Into the Light by Torcon 7"]],
};
const musicianEv = {
  id: "4921a433".padEnd(64, "0"), pubkey: AUTHOR, kind: 9999, created_at: 1773697595, content: "",
  tags: [["z", MUSICIANS], ["t", "a94f5cc9-8c58-55fc-91fe-a324087a655b"], ["name", "Torcon 7"], ["feedUrl", "https://feeds.podcastindex.org/Album-TourconVII.xml"],
    ["feedId", "4148683"], ["feedGuid", "a94f5cc9-8c58-55fc-91fe-a324087a655b"], ["artwork", "https://feeds.podcastindex.org/torcon7cover.jpg"], ["alt", "Musician: Torcon 7"]],
};
const without = (ev: typeof songEv, key: string) => ({ ...ev, tags: ev.tags.filter((t) => t[0] !== key) });
const withTag = (ev: typeof songEv, key: string, value: string) => ({ ...without(ev, key), tags: [...without(ev, key).tags, [key, value]] });

describe("the D-list registry", () => {
  it("names the V4V Songs list as music, with the Music icon; the musicians list too; anything else is nothing", () => {
    expect(dlistFor(SONGS)).toEqual({ coordinate: SONGS, name: "V4V Songs", category: "music", shape: "song", icon: Music });
    expect(dlistFor(MUSICIANS)?.shape).toBe("musician");
    expect(dlistFor(MUSICIANS)?.icon).toBe(Music);
    expect(dlistFor(`39998:${"a".repeat(64)}:x`)).toBeNull();
  });

  it("reads the list a kind-9999 item belongs to from its z tag", () => {
    expect(dlistCoordinateOf(songEv)).toBe(SONGS);
    expect(dlistCoordinateOf(without(songEv, "z"))).toBeNull();
  });
});

describe("a V4V Songs item", () => {
  it("reads as a playable song, its id namespaced away from tracks and Wavlake", () => {
    expect(parseDListSong(songEv)).toEqual({
      id: `podcastindex:${songEv.id}`, eventId: songEv.id, title: "Step Into the Light", artist: "Torcon 7",
      audio: "https://mp3s.podcastindex.org/Step_Into_The_Light.mp3", cover: "https://feeds.podcastindex.org/torcon7cover.jpg", durationSec: 316,
      feedId: "4148683", feedGuid: "a94f5cc9-8c58-55fc-91fe-a324087a655b", url: "https://podcastindex.org/podcast/4148683#4", source: "podcastindex",
    });
  });

  it("without a title or a playable url it is not a song; nor is another kind wearing the tags; a bad duration is no duration", () => {
    expect(parseDListSong(without(songEv, "title"))).toBeNull();
    expect(parseDListSong(without(songEv, "url"))).toBeNull();
    expect(parseDListSong(withTag(songEv, "url", "ftp://x/y.mp3"))).toBeNull();
    expect(parseDListSong({ ...songEv, kind: 1 })).toBeNull();
    expect(parseDListSong(withTag(songEv, "duration", "abc"))?.durationSec).toBeUndefined();
  });
});

describe("a V4V Musicians item", () => {
  it("reads as a musician with a Podcast Index page; no feed id, no page; no name, no musician", () => {
    expect(parseDListMusician(musicianEv)).toEqual({
      id: `podcastindex:${musicianEv.id}`, name: "Torcon 7", feedUrl: "https://feeds.podcastindex.org/Album-TourconVII.xml", feedId: "4148683",
      feedGuid: "a94f5cc9-8c58-55fc-91fe-a324087a655b", artwork: "https://feeds.podcastindex.org/torcon7cover.jpg", url: "https://podcastindex.org/podcast/4148683", source: "podcastindex",
    });
    expect(parseDListMusician(without(musicianEv, "feedId"))?.url).toBeUndefined();
    expect(parseDListMusician(without(musicianEv, "name"))).toBeNull();
  });
});

describe("words against the lists", () => {
  const hits = { songs: [parseDListSong(songEv)!], musicians: [parseDListMusician(musicianEv)!] };

  it("browsing keeps everything; words narrow songs by title or artist and musicians by name; a person scope is not a word", () => {
    expect(filterPodcastIndex("", hits)).toEqual(hits);
    expect(filterPodcastIndex("torcon", hits)).toEqual(hits);
    expect(filterPodcastIndex("step into the light", hits)).toEqual({ songs: hits.songs, musicians: [] });
    expect(filterPodcastIndex("jazz", hits)).toEqual({ songs: [], musicians: [] });
    expect(filterPodcastIndex(`from:${nip19.npubEncode("b".repeat(64))} torcon`, hits)).toEqual(hits);
  });
});
