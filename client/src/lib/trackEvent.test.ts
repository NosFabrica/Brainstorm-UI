import { describe, it, expect } from "vitest";
import { isTestTrack, parseTrack } from "./trackEvent";

const ev = (tags: string[][], content = "") => ({
  id: "t1",
  pubkey: "a".repeat(64),
  kind: 31337,
  created_at: 1_700_000_000,
  tags,
  content,
});

describe("parseTrack — a kind-31337 event is a song only when it can be played", () => {
  it("reads title, artist, cover, audio, genre and duration", () => {
    const t = parseTrack(
      ev([
        ["title", "Old Carbon"],
        ["artist", "NOVA"],
        ["media", "https://x.test/a.mp3"],
        ["image", "https://x.test/a.jpg"],
        ["duration", "214"],
        ["t", "jazz"],
      ]),
    );
    expect(t).toMatchObject({
      title: "Old Carbon",
      artist: "NOVA",
      audio: "https://x.test/a.mp3",
      cover: "https://x.test/a.jpg",
      genre: "jazz",
      durationSec: 214,
    });
  });

  it("drops the kind's junk — no title, or nothing to play", () => {
    expect(parseTrack(ev([["d", "TOMB-7703"]], '{"players":[]}'))).toBeNull();
    expect(parseTrack(ev([["title", "Untitled but silent"]]))).toBeNull();
  });

  it("reads a duration published in milliseconds as seconds", () => {
    // Live: NOVA's tracks carry "200333" and rendered as 55 hours. No song is
    // ten hours long; past that the number is milliseconds.
    expect(
      parseTrack(
        ev([
          ["title", "Duende"],
          ["media", "https://x.test/d.mp3"],
          ["duration", "200333"],
        ]),
      )?.durationSec,
    ).toBe(200);
    expect(
      parseTrack(
        ev([
          ["title", "Long set"],
          ["media", "https://x.test/l.mp3"],
          ["duration", "7200"],
        ]),
      )?.durationSec,
    ).toBe(7200);
  });
});

// Browse today leads with "QA storage fixture qa41" from ff-qa-creator and
// "Test Blossom" by "test" — Fanfares' QA bot and blob tests publish the kind
// (probed 2026-09-04: t fanfares-qa / t test). They are not songs anyone searched for.
describe("isTestTrack — QA and test publications are not songs", () => {
  const qa = (tags: string[][]) => ({
    id: "q",
    pubkey: "b".repeat(64),
    kind: 31337,
    created_at: 1,
    tags: [["media", "https://x.test/q.mp3"], ...tags],
    content: "",
  });
  it("names Fanfares' QA fixtures and 'test' tagged tracks", () => {
    expect(
      isTestTrack(
        qa([
          ["title", "QA storage fixture qa41 #2"],
          ["artist", "ff-qa-creator"],
          ["t", "fanfares-qa"],
        ]),
      ),
    ).toBe(true);
    expect(
      isTestTrack(
        qa([
          ["title", "Test Blossom"],
          ["artist", "test"],
          ["t", "test"],
        ]),
      ),
    ).toBe(true);
    expect(
      isTestTrack(
        qa([
          ["title", "Test 2"],
          ["artist", "test"],
        ]),
      ),
    ).toBe(true);
  });
  it("leaves real songs alone — even ones with 'test' inside a word or a lyric", () => {
    expect(
      isTestTrack(
        qa([
          ["title", "Contest of Champions"],
          ["artist", "NOVA"],
          ["t", "rock"],
        ]),
      ),
    ).toBe(false);
    expect(
      isTestTrack(
        qa([
          ["title", "The Greatest"],
          ["artist", "Sia"],
        ]),
      ),
    ).toBe(false);
    expect(
      isTestTrack(
        qa([
          ["title", "Testify"],
          ["artist", "Rage Against the Machine"],
          ["t", "rock"],
        ]),
      ),
    ).toBe(false);
  });
});

// Live, in Everything's Listen rows: four episodes said "Podcast" where the
// artist goes. Older kind-31337 records carry a `c` CATEGORY — Podcast, Rock,
// Pop — not a creator. A category is a genre; the artist line falls back to
// the author's name, as it does when no artist is given at all.
describe("parseTrack — a category tag is a genre, never the artist", () => {
  const ev = (tags: string[][]) => ({
    id: "t1",
    pubkey: "a".repeat(64),
    kind: 31337,
    created_at: 1,
    tags,
    content: "",
  });
  it("reads `c` as the genre and leaves the artist unset", () => {
    const t = parseTrack(
      ev([
        ["subject", "Bitcoin Alchemy Podcast"],
        ["c", "Podcast"],
        ["media", "https://x.test/ep.mp3"],
      ]),
    );
    expect(t?.artist).toBeUndefined();
    expect(t?.genre).toBe("Podcast");
  });
  it("a real artist tag still wins", () => {
    const t = parseTrack(
      ev([
        ["title", "Old Carbon"],
        ["artist", "NOVA"],
        ["c", "Rock"],
        ["media", "https://x.test/a.mp3"],
      ]),
    );
    expect(t?.artist).toBe("NOVA");
    expect(t?.genre).toBe("Rock");
  });
});

describe("parseTrack — the other kinds the Music tab plays", () => {
  const at = (kind: number, tags: string[][], content = "") => ({ ...ev(tags, content), kind });

  it("reads a kind-36787 track as Amethyst and Ditto publish it (staging, 2026-09-29)", () => {
    const t = parseTrack(
      at(36787, [
        ["d", "6704f12b-4c76-4698-a4fe-7f166cf95160"],
        ["title", "Acapella Random Song"],
        ["artist", "Beatbox Serenade"],
        ["url", "https://blossom.ditto.pub/ef316b48.mp3"],
        ["t", "music"],
        ["image", "https://blossom.ditto.pub/4f4003a5.jpg"],
        ["duration", "34"],
      ]),
    );
    expect(t).toMatchObject({
      title: "Acapella Random Song",
      artist: "Beatbox Serenade",
      audio: "https://blossom.ditto.pub/ef316b48.mp3",
      cover: "https://blossom.ditto.pub/4f4003a5.jpg",
      durationSec: 34,
    });
  });

  it("reads a kind-54 podcast episode by its audio tag", () => {
    const t = parseTrack(
      at(54, [
        ["title", "#24 Game-life balance"],
        ["audio", "https://anchor.fm/s/10e3c37f0/podcast/play/1262377", "audio/mpeg"],
        ["duration", "1820"],
      ]),
    );
    expect(t).toMatchObject({ title: "#24 Game-life balance", durationSec: 1820 });
  });

  it("drops a 30054 that is someone's reading progress, not an episode", () => {
    expect(
      parseTrack(
        at(30054, [
          ["d", "28a4d7cf"],
          ["a", "30023:8f4281f8:article"],
          ["position", "1122"],
          ["duration", "3587"],
        ]),
      ),
    ).toBeNull();
  });

  it("still refuses a kind it does not play", () => {
    expect(
      parseTrack(
        at(1, [
          ["title", "x"],
          ["url", "https://x.test/a.mp3"],
        ]),
      ),
    ).toBeNull();
  });
});
