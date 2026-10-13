import { describe, it, expect } from "vitest";
import { MEDIA_KIND_ORDER, MEDIA_KIND_LABELS, mediaItemsOf, mediaKindOf } from "./mediaKind";

// Benjamin (2026-09-25): "we don't have images as an option or videos — that
// gets filtered into Media". The tab's facets need one word per hit.
const ev = (kind: number, tags: string[][] = [], content = "") => ({
  id: "e".repeat(64),
  pubkey: "a".repeat(64),
  kind,
  tags,
  content,
  created_at: 1,
});

describe("mediaKindOf — one word per media hit", () => {
  it("a kind-20 picture is a photo; NIP-71 videos are videos; a voice message is audio", () => {
    expect(mediaKindOf(ev(20, [["imeta", "url https://cdn/x.jpg", "m image/jpeg"]]))).toBe("photo");
    expect(mediaKindOf(ev(21, [["imeta", "url https://cdn/x.mp4", "m video/mp4"]]))).toBe("video");
    expect(
      mediaKindOf(
        ev(34236, [
          ["d", "s1"],
          ["imeta", "url https://cdn.divine.video/x.mp4", "m video/mp4"],
        ]),
      ),
    ).toBe("video");
    expect(mediaKindOf(ev(1222, [["imeta", "url https://cdn/x.ogg", "m audio/ogg"]]))).toBe("audio");
  });

  it("a file is what its mime says; an APK is nothing here", () => {
    expect(
      mediaKindOf(
        ev(1063, [
          ["url", "https://cdn/song.mp3"],
          ["m", "audio/mpeg"],
        ]),
      ),
    ).toBe("audio");
    expect(
      mediaKindOf(
        ev(1063, [
          ["url", "https://cdn/pic"],
          ["m", "image/png"],
        ]),
      ),
    ).toBe("photo");
    expect(
      mediaKindOf(
        ev(1063, [
          ["url", "https://cdn/clip"],
          ["m", "video/mp4"],
        ]),
      ),
    ).toBe("video");
    expect(
      mediaKindOf(
        ev(1063, [
          ["url", "https://cdn/app.apk"],
          ["m", "application/vnd.android.package-archive"],
        ]),
      ),
    ).toBeNull();
  });

  it("a note is judged by the picture or clip it carries", () => {
    expect(mediaKindOf(ev(1, [], "look https://cdn/sunset.jpg"))).toBe("photo");
    expect(mediaKindOf(ev(1, [], "watch https://cdn/clip.mp4"))).toBe("video");
    expect(mediaKindOf(ev(1, [["imeta", "url https://cdn/talk.m4a", "m audio/mp4"]], "listen"))).toBe("audio");
    expect(mediaKindOf(ev(1, [], "just words"))).toBeNull();
  });

  it("the facets come in a fixed order with their words", () => {
    expect(MEDIA_KIND_ORDER).toEqual(["photo", "video", "audio"]);
    expect(MEDIA_KIND_ORDER.map((k) => MEDIA_KIND_LABELS[k])).toEqual(["Photos", "Videos", "Audio"]);
  });
});

// An event page drew every file that was not a video as a picture, so a voice
// message or a podcast's mp3 showed as a broken image. Each file now says what it is.
describe("mediaItemsOf — each file as what it is", () => {
  it("reads every imeta, with its mime, alt and size", () => {
    const items = mediaItemsOf(
      ev(20, [
        ["imeta", "url https://cdn/a.jpg", "m image/jpeg", "alt A red door", "dim 1200x800"],
        ["imeta", "url https://cdn/b", "m image/webp", "dim nonsense"],
      ]),
    );
    expect(items).toEqual([
      { url: "https://cdn/a.jpg", kind: "photo", mime: "image/jpeg", alt: "A red door", dim: { w: 1200, h: 800 } },
      { url: "https://cdn/b", kind: "photo", mime: "image/webp", alt: undefined, dim: undefined },
    ]);
  });

  it("an audio file is audio, by its mime or its extension — never a picture", () => {
    expect(mediaItemsOf(ev(1111, [["imeta", "url https://cdn/ep", "m audio/mpeg"]]))[0].kind).toBe("audio");
    expect(mediaItemsOf(ev(1111, [["imeta", "url https://cdn/ep.mp3"]]))[0].kind).toBe("audio");
    expect(mediaItemsOf(ev(1, [], "listen https://cdn/song.flac"))[0]).toEqual({
      url: "https://cdn/song.flac",
      kind: "audio",
    });
  });

  it("a voice message's file is audio, even one called .webm", () => {
    for (const kind of [1222, 1244]) {
      expect(mediaItemsOf(ev(kind, [["imeta", "url https://cdn/v.webm"]]))[0].kind).toBe("audio");
    }
  });

  it("a kind-1063 file is what its `m` tag says, its size from `dim`", () => {
    const [item] = mediaItemsOf(
      ev(1063, [
        ["url", "https://cdn/f"],
        ["m", "video/mp4"],
        ["dim", "1920x1080"],
      ]),
    );
    expect(item).toMatchObject({ kind: "video", mime: "video/mp4", dim: { w: 1920, h: 1080 } });
  });

  it("a link with no mime and no extension is a picture, as before; each file once", () => {
    const items = mediaItemsOf(
      ev(20, [
        ["imeta", "url https://blossom/abc"],
        ["imeta", "url https://blossom/abc"],
      ]),
    );
    expect(items).toEqual([
      { url: "https://blossom/abc", kind: "photo", mime: undefined, alt: undefined, dim: undefined },
    ]);
  });

  it("a voice message and an audio header are audio for the Media tab", () => {
    expect(mediaKindOf(ev(1244, [["imeta", "url https://cdn/v.webm"]]))).toBe("audio");
    expect(mediaKindOf(ev(1808, [["url", "https://cdn/a.webm"]]))).toBe("audio");
  });
});
