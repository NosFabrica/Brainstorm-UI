/**
 * What the event page's audio hero reads from each audio kind. A track, an
 * episode, a trailer, a voice message and an audio header each publish their
 * file and facts under different tags (the shapes Amethyst's quartz reads).
 */
import { describe, expect, it } from "vitest";
import { hasAudioHero, readAudioEvent } from "./audioEvent";

const ev = (kind: number, tags: string[][] = [], content = "") => ({ kind, tags, content });

describe("readAudioEvent", () => {
  it("a 36787 music track: artist, album, track number, release, explicit, duration", () => {
    const a = readAudioEvent(
      ev(
        36787,
        [
          ["d", "t1"],
          ["title", "Night Drive"],
          ["artist", "The Relays"],
          ["url", "https://cdn/night.mp3"],
          ["image", "https://cdn/cover.jpg"],
          ["album", "Signals"],
          ["track_number", "3"],
          ["released", "2024-03-01"],
          ["explicit", "true"],
          ["duration", "214"],
          ["t", "music"],
          ["t", "synthwave"],
        ],
        "Recorded live.",
      ),
    );
    expect(a).toMatchObject({
      shape: "track",
      label: "Track",
      title: "Night Drive",
      artist: "The Relays",
      audio: "https://cdn/night.mp3",
      cover: "https://cdn/cover.jpg",
      album: "Signals",
      trackNumber: "3",
      released: "2024-03-01",
      explicit: true,
      durationSec: 214,
      text: "Recorded live.",
      genres: ["Synthwave"],
    });
    expect(readAudioEvent(ev(36787, [["explicit", "false"]])).explicit).toBe(false);
  });

  it("a 54 episode plays its `audio` tag and reads its description", () => {
    const a = readAudioEvent(
      ev(54, [
        ["title", "Ep 12: Relays"],
        ["audio", "https://cdn/ep12.mp3", "audio/mpeg"],
        ["description", "On running relays."],
        ["image", "https://cdn/show.jpg"],
      ]),
    );
    expect(a).toMatchObject({ shape: "episode", label: "Episode", audio: "https://cdn/ep12.mp3" });
    expect(a.text).toBe("On running relays.");
  });

  it("a 30054 episode says its season and episode", () => {
    const a = readAudioEvent(
      ev(30054, [
        ["title", "Pilot"],
        ["audio", "https://cdn/pilot.mp3"],
        ["season", "2"],
        ["episode", "1"],
        ["duration", "3600"],
      ]),
    );
    expect(a).toMatchObject({ season: "2", episode: "1", durationSec: 3600 });
  });

  it("a voice message's caption is its words without the file's URL", () => {
    const url = "https://cdn/voice.webm";
    const a = readAudioEvent(ev(1222, [["imeta", `url ${url}`, "m audio/webm", "duration 12"]], `${url} on my way`));
    expect(a).toMatchObject({ shape: "voice", title: "Voice message", audio: url, durationSec: 12, text: "on my way" });
    expect(readAudioEvent(ev(1244, [["imeta", `url ${url}`]], url))).toMatchObject({ title: "Voice reply" });
    expect(readAudioEvent(ev(1244, [["imeta", `url ${url}`]], url)).text).toBeUndefined();
  });

  it("an audio header plays its stream first", () => {
    const a = readAudioEvent(
      ev(
        1808,
        [
          ["download_url", "https://cdn/full.wav"],
          ["stream_url", "https://cdn/stream.mp3"],
        ],
        "A field recording",
      ),
    );
    expect(a).toMatchObject({
      shape: "audio",
      title: "Audio",
      audio: "https://cdn/stream.mp3",
      text: "A field recording",
    });
  });
});

describe("hasAudioHero", () => {
  it("every audio kind with a file to play", () => {
    expect(hasAudioHero(ev(36787, [["url", "https://cdn/a.mp3"]]))).toBe(true);
    expect(hasAudioHero(ev(54, [["audio", "https://cdn/a.mp3"]]))).toBe(true);
    expect(hasAudioHero(ev(1222, [["imeta", "url https://cdn/v.webm"]]))).toBe(true);
    expect(hasAudioHero(ev(1808, [["stream_url", "https://cdn/s.mp3"]]))).toBe(true);
  });

  // Other apps write 30054/30055 for reading progress and claim graphs, with nothing to play.
  it("not a 30054 with nothing to play, nor a kind that is not a sound", () => {
    expect(hasAudioHero(ev(30054, [["position", "120"]], "chapter 3"))).toBe(false);
    expect(hasAudioHero(ev(1, [["url", "https://cdn/a.mp3"]]))).toBe(false);
  });

  it("a 31337 as before, whatever it carries", () => {
    expect(hasAudioHero(ev(31337))).toBe(true);
  });
});
