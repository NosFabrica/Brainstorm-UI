// @vitest-environment node
/**
 * Thumbnails a link gives away without asking anyone: YouTube's are at a
 * known address per video id, and a link that IS a video file can show its
 * own first frame. Everything else waits on the link-metadata proxy.
 */
import { describe, expect, it } from "vitest";
import { isVideoFileUrl, youtubeThumbnail } from "./linkThumb";

describe("youtubeThumbnail", () => {
  it("finds the video id in every YouTube link shape", () => {
    const want = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
    expect(youtubeThumbnail("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe(want);
    expect(youtubeThumbnail("https://youtu.be/dQw4w9WgXcQ")).toBe(want);
    expect(youtubeThumbnail("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(want);
    expect(youtubeThumbnail("https://m.youtube.com/live/dQw4w9WgXcQ?feature=share")).toBe(want);
    expect(youtubeThumbnail("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(want);
  });
  it("is null for anything else", () => {
    expect(youtubeThumbnail("https://www.youtube.com/@channel")).toBeNull();
    expect(youtubeThumbnail("https://rfi.fr/story")).toBeNull();
    expect(youtubeThumbnail("not a url")).toBeNull();
  });
});

describe("isVideoFileUrl", () => {
  it("knows a video file by its extension, query string or not", () => {
    expect(isVideoFileUrl("https://blossom.primal.net/abc.mp4")).toBe(true);
    expect(isVideoFileUrl("https://cdn.example/clip.webm?x=1")).toBe(true);
    expect(isVideoFileUrl("https://cdn.example/clip.mov#t=1")).toBe(true);
    expect(isVideoFileUrl("https://cdn.example/photo.jpg")).toBe(false);
    expect(isVideoFileUrl("https://rfi.fr/story")).toBe(false);
  });
});
