/**
 * What a quoted event is drawn as. A note quoting a stream, a listing or a
 * video showed the event's `content` — a stream's empty string, a listing's
 * long description, a caption with no video. Each family now has the card it
 * has elsewhere; one that cannot fill its card stays words.
 */
import { describe, expect, it } from "vitest";
import {
  ADDRESS_CARD_KINDS,
  embedAudioUrl,
  embedPictures,
  embedShapeOf,
  namesItsKind,
  taggedVideoUrl,
} from "./embedShape";
import type { MinimalEvent } from "./noteRefs";

const PK = "a".repeat(64);
let n = 0;
const ev = (kind: number, tags: string[][] = [], content = ""): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey: PK,
  created_at: 1_790_000_000,
  tags,
  content,
});

describe("embedShapeOf", () => {
  it("a note is words", () => {
    expect(embedShapeOf(ev(1, [], "gm"))).toBe("note");
  });

  it("a NIP-71 video that names its file in imeta is a video; one that only links it in its words stays words", () => {
    const video = ev(34235, [
      ["imeta", "url https://cdn.example/v.mp4", "m video/mp4", "image https://cdn.example/v.jpg"],
    ]);
    expect(embedShapeOf(video)).toBe("video");
    expect(taggedVideoUrl(video)).toBe("https://cdn.example/v.mp4");
    expect(embedShapeOf(ev(22, [["title", "A clip"]], "Watch https://cdn.example/clip.mp4"))).toBe("note");
  });

  it("a picture post is its pictures, and an image file too; a picture post with none is words", () => {
    const pics = ev(20, [
      ["imeta", "url https://img.example/1.jpg", "m image/jpeg"],
      ["imeta", "url https://img.example/2.jpg", "m image/jpeg"],
    ]);
    expect(embedShapeOf(pics)).toBe("picture");
    expect(embedPictures(pics)).toEqual(["https://img.example/1.jpg", "https://img.example/2.jpg"]);
    expect(
      embedShapeOf(
        ev(1063, [
          ["url", "https://img.example/f.png"],
          ["m", "image/png"],
        ]),
      ),
    ).toBe("picture");
    expect(embedShapeOf(ev(20, [], "nothing here"))).toBe("note");
  });

  it("a track that names its audio is a track; the junk on its kind number stays words", () => {
    expect(
      embedShapeOf(
        ev(31337, [
          ["d", "song"],
          ["title", "Song"],
          ["media", "https://audio.example/song.mp3"],
        ]),
      ),
    ).toBe("track");
    expect(embedShapeOf(ev(31337, [["d", "save"]], '{"level":3}'))).toBe("note");
  });

  it("a voice message and an audio file are one player", () => {
    const voice = ev(1222, [], "https://blossom.example/voice.m4a");
    expect(embedShapeOf(voice)).toBe("audio");
    expect(embedAudioUrl(voice)).toBe("https://blossom.example/voice.m4a");
    expect(embedShapeOf(ev(1244, [], "https://blossom.example/abc"))).toBe("audio");
    expect(
      embedShapeOf(
        ev(1063, [
          ["url", "https://audio.example/a.ogg"],
          ["m", "audio/ogg"],
        ]),
      ),
    ).toBe("audio");
  });

  it("things lib/thing can read are things — a community, a goal, a mint review — and a 38000 with no format stays words", () => {
    expect(
      embedShapeOf(
        ev(34550, [
          ["d", "k"],
          ["name", "Kiteh Kawasaki"],
        ]),
      ),
    ).toBe("thing");
    expect(embedShapeOf(ev(9041, [["amount", "1000"]], "Keep the lights on"))).toBe("thing");
    expect(
      embedShapeOf(
        ev(38000, [
          ["k", "38172"],
          ["u", "https://mint.example"],
          ["d", "m"],
        ]),
      ),
    ).toBe("thing");
    expect(embedShapeOf(ev(38000, [["d", "b21068c8"]]))).toBe("note");
  });

  it("people lists are faces; bookmark sets are item lists", () => {
    expect(
      embedShapeOf(
        ev(30000, [
          ["d", "devs"],
          ["p", PK],
        ]),
      ),
    ).toBe("people-list");
    expect(
      embedShapeOf(
        ev(39089, [
          ["d", "pack"],
          ["p", PK],
        ]),
      ),
    ).toBe("people-list");
    expect(
      embedShapeOf(
        ev(30392, [
          ["d", "t"],
          ["p", PK],
        ]),
      ),
    ).toBe("people-list");
    expect(
      embedShapeOf(
        ev(30003, [
          ["d", "reads"],
          ["e", "f".repeat(64)],
        ]),
      ),
    ).toBe("item-list");
  });

  it("a stream, a dated event, a listing, an app and a repo each have their card", () => {
    expect(
      embedShapeOf(
        ev(30311, [
          ["d", "s"],
          ["title", "Live"],
        ]),
      ),
    ).toBe("live");
    expect(
      embedShapeOf(
        ev(31923, [
          ["d", "e"],
          ["title", "Meetup"],
          ["start", "1790000000"],
        ]),
      ),
    ).toBe("calendar-event");
    expect(
      embedShapeOf(
        ev(30402, [
          ["d", "l"],
          ["title", "Bike"],
          ["price", "100", "USD"],
        ]),
      ),
    ).toBe("listing");
    expect(embedShapeOf(ev(30402, [["d", "l"]]))).toBe("note");
    expect(
      embedShapeOf(
        ev(32267, [
          ["d", "app"],
          ["name", "Amethyst"],
        ]),
      ),
    ).toBe("app");
    for (const kind of [30617, 1617, 1618, 1621]) expect(embedShapeOf(ev(kind, [["d", "r"]], "x"))).toBe("repo");
  });

  it("long-form — articles, drafts, publications, sections, specs, wiki pages — is the article teaser", () => {
    for (const kind of [30023, 30024, 30040, 30041, 30817, 30818])
      expect(
        embedShapeOf(
          ev(
            kind,
            [
              ["d", "x"],
              ["title", "T"],
            ],
            "Body",
          ),
        ),
      ).toBe("article");
  });

  it("an event deleted by overwriting is the note card's stub, whatever its kind", () => {
    expect(
      embedShapeOf(
        ev(30402, [
          ["d", "l"],
          ["deleted", "true"],
        ]),
      ),
    ).toBe("note");
  });
});

describe("ADDRESS_CARD_KINDS", () => {
  it("holds the addresses drawn as cards, never the long-form or lists drawn elsewhere", () => {
    for (const kind of [30311, 30402, 31923, 30000, 39089, 34550, 38000, 36787, 34235, 30617, 32267, 15129])
      expect(ADDRESS_CARD_KINDS.has(kind)).toBe(true);
    for (const kind of [30023, 30040, 30003, 1, 1621]) expect(ADDRESS_CARD_KINDS.has(kind)).toBe(false);
  });
});

describe("namesItsKind", () => {
  it("a note, a thread and a comment are words; a zap or a reaction says what it is", () => {
    expect([1, 11, 1111].map(namesItsKind)).toEqual([false, false, false]);
    expect([9735, 7, 6].map(namesItsKind)).toEqual([true, true, true]);
  });
});
