import { describe, it, expect } from "vitest";
import { MEDIA_KIND_ORDER, MEDIA_KIND_LABELS, mediaKindOf } from "./mediaKind";

// Benjamin (2026-09-25): "we don't have images as an option or videos — that
// gets filtered into Media". The tab's facets need one word per hit.
const ev = (kind: number, tags: string[][] = [], content = "") => ({ id: "e".repeat(64), pubkey: "a".repeat(64), kind, tags, content, created_at: 1 });

describe("mediaKindOf — one word per media hit", () => {
  it("a kind-20 picture is a photo; NIP-71 videos are videos; a voice message is audio", () => {
    expect(mediaKindOf(ev(20, [["imeta", "url https://cdn/x.jpg", "m image/jpeg"]]))).toBe("photo");
    expect(mediaKindOf(ev(21, [["imeta", "url https://cdn/x.mp4", "m video/mp4"]]))).toBe("video");
    expect(mediaKindOf(ev(34236, [["d", "s1"], ["imeta", "url https://cdn.divine.video/x.mp4", "m video/mp4"]]))).toBe("video");
    expect(mediaKindOf(ev(1222, [["imeta", "url https://cdn/x.ogg", "m audio/ogg"]]))).toBe("audio");
  });

  it("a file is what its mime says; an APK is nothing here", () => {
    expect(mediaKindOf(ev(1063, [["url", "https://cdn/song.mp3"], ["m", "audio/mpeg"]]))).toBe("audio");
    expect(mediaKindOf(ev(1063, [["url", "https://cdn/pic"], ["m", "image/png"]]))).toBe("photo");
    expect(mediaKindOf(ev(1063, [["url", "https://cdn/clip"], ["m", "video/mp4"]]))).toBe("video");
    expect(mediaKindOf(ev(1063, [["url", "https://cdn/app.apk"], ["m", "application/vnd.android.package-archive"]]))).toBeNull();
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
