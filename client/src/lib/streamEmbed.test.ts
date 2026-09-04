// @vitest-environment node
/**
 * Benjamin, on a live "Dead By Daylight" stream page that said "This stream
 * can't play here": "we should be able to live stream these events". Its
 * NIP-53 `streaming` tag was a Twitch channel PAGE, not an HLS URL, so the
 * HLS player failed. Probed 2026-09-03 over 400 recent kind-30311s: most
 * carry .m3u8 (they already play), a handful point at Twitch / Kick /
 * YouTube pages — each has an official embeddable player.
 */
import { describe, expect, it } from "vitest";
import { streamEmbedUrl } from "./streamEmbed";

describe("streamEmbedUrl", () => {
  it("turns a Twitch channel page into the Twitch player, naming the embedding host", () => {
    expect(streamEmbedUrl("https://www.twitch.tv/cowboisim", "brainstorm.world")).toBe(
      "https://player.twitch.tv/?channel=cowboisim&parent=brainstorm.world&autoplay=true&muted=false",
    );
    expect(streamEmbedUrl("https://twitch.tv/CowboiSim/", "localhost")).toContain("channel=CowboiSim&parent=localhost");
  });

  it("turns a Kick channel page into the Kick player", () => {
    expect(streamEmbedUrl("https://kick.com/xqc", "brainstorm.world")).toBe("https://player.kick.com/xqc?autoplay=true&muted=false");
  });

  it("turns YouTube watch / live / short links into the embed player", () => {
    const want = "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1";
    expect(streamEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "x")).toBe(want);
    expect(streamEmbedUrl("https://youtube.com/live/dQw4w9WgXcQ?feature=share", "x")).toBe(want);
    expect(streamEmbedUrl("https://youtu.be/dQw4w9WgXcQ", "x")).toBe(want);
  });

  it("leaves HLS and unknown URLs to the video player (null)", () => {
    expect(streamEmbedUrl("https://api-uk.zap.stream/abc/live.m3u8", "x")).toBeNull();
    expect(streamEmbedUrl("https://cornychat.com/room", "x")).toBeNull();
    expect(streamEmbedUrl("not a url", "x")).toBeNull();
    // A Twitch PAGE that isn't a channel (a video, a directory) has no live player.
    expect(streamEmbedUrl("https://www.twitch.tv/videos/123", "x")).toBeNull();
    expect(streamEmbedUrl("https://www.twitch.tv/directory/gaming", "x")).toBeNull();
  });
});
