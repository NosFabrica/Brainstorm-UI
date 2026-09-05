import { describe, it, expect } from "vitest";
import { isTestTrack, parseTrack } from "./trackEvent";

const ev = (tags: string[][], content = "") =>
  ({ id: "t1", pubkey: "a".repeat(64), kind: 31337, created_at: 1_700_000_000, tags, content });

describe("parseTrack — a kind-31337 event is a song only when it can be played", () => {
  it("reads title, artist, cover, audio, genre and duration", () => {
    const t = parseTrack(ev([["title", "Old Carbon"], ["artist", "NOVA"], ["media", "https://x.test/a.mp3"], ["image", "https://x.test/a.jpg"], ["duration", "214"], ["t", "jazz"]]));
    expect(t).toMatchObject({ title: "Old Carbon", artist: "NOVA", audio: "https://x.test/a.mp3", cover: "https://x.test/a.jpg", genre: "jazz", durationSec: 214 });
  });

  it("drops the kind's junk — no title, or nothing to play", () => {
    expect(parseTrack(ev([["d", "TOMB-7703"]], '{"players":[]}'))).toBeNull();
    expect(parseTrack(ev([["title", "Untitled but silent"]]))).toBeNull();
  });

  it("reads a duration published in milliseconds as seconds", () => {
    // Live: NOVA's tracks carry "200333" and rendered as 55 hours. No song is
    // ten hours long; past that the number is milliseconds.
    expect(parseTrack(ev([["title", "Duende"], ["media", "https://x.test/d.mp3"], ["duration", "200333"]]))?.durationSec).toBe(200);
    expect(parseTrack(ev([["title", "Long set"], ["media", "https://x.test/l.mp3"], ["duration", "7200"]]))?.durationSec).toBe(7200);
  });
});

// Browse today leads with "QA storage fixture qa41" from ff-qa-creator and
// "Test Blossom" by "test" — Fanfares' QA bot and blob tests publish the kind
// (probed 2026-09-04: t fanfares-qa / t test). They are not songs anyone searched for.
describe("isTestTrack — QA and test publications are not songs", () => {
  const qa = (tags: string[][]) => ({ id: "q", pubkey: "b".repeat(64), kind: 31337, created_at: 1, tags: [["media", "https://x.test/q.mp3"], ...tags], content: "" });
  it("names Fanfares' QA fixtures and 'test' tagged tracks", () => {
    expect(isTestTrack(qa([["title", "QA storage fixture qa41 #2"], ["artist", "ff-qa-creator"], ["t", "fanfares-qa"]]))).toBe(true);
    expect(isTestTrack(qa([["title", "Test Blossom"], ["artist", "test"], ["t", "test"]]))).toBe(true);
    expect(isTestTrack(qa([["title", "Test 2"], ["artist", "test"]]))).toBe(true);
  });
  it("leaves real songs alone — even ones with 'test' inside a word or a lyric", () => {
    expect(isTestTrack(qa([["title", "Contest of Champions"], ["artist", "NOVA"], ["t", "rock"]]))).toBe(false);
    expect(isTestTrack(qa([["title", "The Greatest"], ["artist", "Sia"]]))).toBe(false);
    expect(isTestTrack(qa([["title", "Testify"], ["artist", "Rage Against the Machine"], ["t", "rock"]]))).toBe(false);
  });
});
