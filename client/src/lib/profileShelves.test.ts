import { describe, expect, it } from "vitest";
import { profileLiveStreams, profileTracks } from "./profileShelves";

const NOW = 1_800_000_000;
let n = 0;
const ev = (kind: number, tags: string[][], created_at = NOW) => ({
  id: String(++n).padStart(64, "0"),
  pubkey: "a".repeat(64),
  kind,
  created_at,
  tags,
  content: "",
});

describe("profileTracks", () => {
  const AUDIO = ["media", "https://cdn.example/song.mp3"];

  // An older record's `c` is its category ("Podcast"), not the artist.
  it("never shows a `c` category as the artist", () => {
    const [track] = profileTracks([ev(31337, [["title", "Song"], AUDIO, ["c", "Podcast"]])]);

    expect(track.artist).toBeUndefined();
    expect(track.genre).toBe("Podcast");
  });

  it("drops a track with nothing to play, and a QA publication", () => {
    const tracks = profileTracks([
      ev(31337, [["title", "No audio"]]),
      ev(31337, [["title", "QA storage fixture qa41"], AUDIO, ["t", "fanfares-qa"]]),
      ev(31337, [["title", "Song"], AUDIO, ["artist", "Joe"]]),
    ]);

    expect(tracks.map((t) => t.title)).toEqual(["Song"]);
  });

  it("shows the genre capitalised and never as just 'music'", () => {
    expect(profileTracks([ev(31337, [["title", "A"], AUDIO, ["t", "rock"]])])[0].genre).toBe("Rock");
    expect(profileTracks([ev(31337, [["title", "B"], AUDIO, ["t", "music"]])])[0].genre).toBeUndefined();
  });
});

describe("profileLiveStreams", () => {
  const live = (tags: string[][], created_at = NOW) =>
    ev(30311, [["d", "s"], ["title", "Stream"], ...tags], created_at);

  // "open" is on air by the Live tab's rule; the row's LIVE pill followed `status === "live"` only.
  it("puts an `open` stream on air", () => {
    const { liveNow } = profileLiveStreams([live([["status", "open"]])], NOW);

    expect(liveNow).toHaveLength(1);
    expect(liveNow[0].live).toBe(true);
  });

  it("a 'live' nobody updated for a week is not on air, and replays aren't shown", () => {
    const shelves = profileLiveStreams(
      [
        live([["status", "live"]], NOW - 8 * 86_400),
        live([
          ["status", "ended"],
          ["recording", "https://r.example/x"],
        ]),
      ],
      NOW,
    );

    expect(shelves.has).toBe(false);
  });

  it("keeps the two soonest upcoming streams", () => {
    const at = (s: number) =>
      live([
        ["status", "planned"],
        ["starts", String(NOW + s)],
      ]);
    const { upcoming } = profileLiveStreams([at(3_000), at(1_000), at(2_000)], NOW);

    expect(upcoming.map((s) => s.startsSec)).toEqual([NOW + 1_000, NOW + 2_000]);
    expect(upcoming.every((s) => !s.live && s.timing.startsWith("Starts "))).toBe(true);
  });

  it("trims a padded title", () => {
    const { liveNow } = profileLiveStreams(
      [
        ev(30311, [
          ["d", "s"],
          ["title", "  Stream  "],
          ["status", "live"],
        ]),
      ],
      NOW,
    );

    expect(liveNow[0].title).toBe("Stream");
  });
});
