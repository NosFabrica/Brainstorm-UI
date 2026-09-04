import { describe, it, expect } from "vitest";
import { parseTrack } from "./trackEvent";

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
