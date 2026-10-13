import { describe, it, expect } from "vitest";
import { MEDIA_KIND_ORDER, MEDIA_KIND_LABELS, mediaItemsOf, mediaKindOf, mediaKindOfUrl } from "./mediaKind";
import { parseNoteContent } from "./noteContent";

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

  // Audit: the names and mimes the note text (lib/noteContent) already knows.
  it("an .m4v is a video, a .bmp or .svg a picture, and a mime in capitals is still a mime", () => {
    expect(mediaKindOfUrl("https://x.test/a.m4v")).toBe("video");
    expect(mediaItemsOf(ev(20, [["imeta", "url https://x.test/a.m4v"]]))[0].kind).toBe("video");
    expect(mediaKindOfUrl("https://x.test/a.svg")).toBe("photo");
    expect(mediaKindOfUrl("https://x.test/a.bmp?x=1")).toBe("photo");
    expect(mediaItemsOf(ev(1, [], "https://x.test/a.svg"))[0]).toMatchObject({ kind: "photo" });
    expect(mediaItemsOf(ev(1111, [["imeta", "url https://x.test/a", "m Audio/MPEG"]]))[0].kind).toBe("audio");
    expect(mediaItemsOf(ev(1111, [["imeta", "url https://x.test/a", "m Video/MP4"]]))[0].kind).toBe("video");
    expect(
      mediaKindOf(
        ev(1063, [
          ["url", "https://x.test/a"],
          ["m", "VIDEO/MP4"],
        ]),
      ),
    ).toBe("video");
  });

  it("a .webm that says a duration but no size is a sound in a sound's kind; one in a voice message always is", () => {
    // Audit: only where the event is a sound — a track, an episode, an audio header. In a note
    // a running time is what every clip has, and mediaKindOf already called it a video.
    for (const kind of [31337, 36787, 54, 30054, 30055, 1808])
      expect(mediaItemsOf(ev(kind, [["imeta", "url https://x.test/a.webm", "duration 12"]]))[0].kind).toBe("audio");
    expect(mediaItemsOf(ev(1, [["imeta", "url https://x.test/a.webm", "duration 12"]]))[0].kind).toBe("video");
    expect(mediaItemsOf(ev(1, [["imeta", "url https://x.test/a.webm", "duration 12", "dim 640x360"]]))[0].kind).toBe(
      "video",
    );
    expect(mediaItemsOf(ev(1, [["imeta", "url https://x.test/a.webm"]]))[0].kind).toBe("video");
    expect(mediaItemsOf(ev(1222, [["imeta", "url https://x.test/a.webm", "m video/webm"]]))[0].kind).toBe("audio");
  });

  it("carries each file's duration and poster, as its imeta says them", () => {
    const [clip, sound] = mediaItemsOf(
      ev(1, [
        ["imeta", "url https://x.test/v.mp4", "m video/mp4", "image https://x.test/v.jpg", "dim 640x360"],
        ["imeta", "url https://x.test/a.mp3", "duration 61.5"],
        ["imeta", "url https://x.test/b.mp3", "duration nonsense"],
      ]),
    );
    expect(clip).toMatchObject({ kind: "video", poster: "https://x.test/v.jpg" });
    expect(sound).toMatchObject({ kind: "audio", durationSec: 61.5 });
    expect(mediaItemsOf(ev(1, [["imeta", "url https://x.test/b.mp3", "duration nonsense"]]))[0].durationSec).toBe(
      undefined,
    );
  });
});

describe("mediaKindOf and mediaItemsOf agree", () => {
  // Audit: the Media tab's word for a hit and the page's drawing of its first file were two readings.
  it("the hit's kind is its first file's", () => {
    for (const e of [
      ev(1, [["imeta", "url https://x.test/clip.webm", "duration 12.5"]]),
      ev(1, [["imeta", "url https://blossom/abc"]]),
      ev(1063, [
        ["url", "https://x.test/f"],
        ["m", "audio/mpeg"],
      ]),
      ev(1, [], "x https://x.test/a.jpg?w=1, nice"),
      ev(1222, [["imeta", "url https://x.test/v.webm", "m video/webm"]]),
    ])
      expect(mediaKindOf(e)).toBe(mediaItemsOf(e)[0].kind);
  });
});

describe("a `url` tag is a file only when it says it is one", () => {
  // Audit: a note's `url` tag naming a web page was a "photo", drawn as a broken picture.
  it("a web page in a `url` tag is no file; a picture, a typed file or a sound kind's file is", () => {
    expect(mediaItemsOf(ev(1, [["url", "https://news.example/article"]], "read this"))).toEqual([]);
    expect(mediaKindOf(ev(1, [["url", "https://news.example/article"]], "read this"))).toBeNull();
    expect(mediaItemsOf(ev(1, [["url", "https://x.test/p.png"]]))[0]).toMatchObject({ kind: "photo" });
    expect(
      mediaItemsOf(
        ev(1063, [
          ["url", "https://x.test/blob"],
          ["m", "image/png"],
        ]),
      )[0],
    ).toMatchObject({ kind: "photo" });
    expect(mediaItemsOf(ev(1808, [["url", "https://x.test/blob"]]))[0]).toMatchObject({ kind: "audio" });
    // An imeta that says nothing is still a picture, as before.
    expect(mediaItemsOf(ev(1, [["imeta", "url https://blossom/abc"]]))[0]).toMatchObject({ kind: "photo" });
  });
});

describe("the files in a note's words are the ones its text draws", () => {
  // Audit: the fallback kept a markdown picture's closing paren, so the page drew it twice.
  it("each is the URL the note's tokenizer reads, a markdown picture's paren left out", () => {
    expect(mediaItemsOf(ev(20, [], "pic ![](https://x.test/b.png?x=1)")).map((i) => i.url)).toEqual([
      "https://x.test/b.png?x=1",
    ]);
    expect(mediaItemsOf(ev(1, [], "see (https://x.test/c.jpg) and https://x.test/d.mp4")).map((i) => i.url)).toEqual(
      parseNoteContent("see (https://x.test/c.jpg) and https://x.test/d.mp4")
        .filter((t) => t.type === "image" || t.type === "video")
        .map((t) => (t as { value: string }).value),
    );
  });
});
