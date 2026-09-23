// @vitest-environment jsdom
/**
 * One sound at a time. The music bar follows the listener across pages, and
 * a page can hold a video that plays with sound — a live stream, a replay, a
 * note's clip once unmuted. Both played over each other, worst on a phone
 * (Benjamin, 2026-09-09: "a critical UX issue when users are listening to
 * music and a video auto-plays"). Whatever starts sounding takes the floor;
 * whatever held it pauses.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSoloPlayback, playSolo } from "./playback";

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  document.body.innerHTML = "";
});

/** A media element the way jsdom leaves it: play/pause unimplemented, so they are spied. */
function media(tag: "video" | "audio", { muted = false } = {}) {
  const el = document.createElement(tag);
  el.muted = muted;
  el.pause = vi.fn();
  document.body.appendChild(el);
  return el;
}

describe("solo playback", () => {
  it("when a video starts sounding, the music stops", () => {
    stop = installSoloPlayback(document);
    const music = { pause: vi.fn() };
    playSolo(music);
    const video = media("video");
    video.dispatchEvent(new Event("play"));
    expect(music.pause).toHaveBeenCalledTimes(1);
  });

  // A note's clip autoplays muted as it scrolls into view (FeedVideo) — no
  // sound, so nothing to yield to. The music keeps playing over a silent clip.
  it("a muted video autoplaying under the music leaves it alone", () => {
    stop = installSoloPlayback(document);
    const music = { pause: vi.fn() };
    playSolo(music);
    media("video", { muted: true }).dispatchEvent(new Event("play"));
    expect(music.pause).not.toHaveBeenCalled();
  });

  // The clip was silent until the listener tapped its speaker: from that tap
  // it is the thing they chose to hear.
  it("unmuting a playing video takes the floor from the music", () => {
    stop = installSoloPlayback(document);
    const music = { pause: vi.fn() };
    playSolo(music);
    const clip = media("video", { muted: true });
    clip.dispatchEvent(new Event("play"));
    expect(music.pause).not.toHaveBeenCalled();
    Object.defineProperty(clip, "paused", { value: false, configurable: true });
    clip.muted = false;
    clip.dispatchEvent(new Event("volumechange"));
    expect(music.pause).toHaveBeenCalledTimes(1);
  });

  it("when the music starts, the video that was sounding pauses", () => {
    stop = installSoloPlayback(document);
    const stream = media("video");
    stream.dispatchEvent(new Event("play"));
    const music = { pause: vi.fn() };
    playSolo(music);
    expect(stream.pause).toHaveBeenCalledTimes(1);
    expect(music.pause).not.toHaveBeenCalled();
  });

  it("a video resuming after its own pause does not pause itself, and a second video takes over from the first", () => {
    stop = installSoloPlayback(document);
    const first = media("video");
    first.dispatchEvent(new Event("play"));
    first.dispatchEvent(new Event("play"));
    expect(first.pause).not.toHaveBeenCalled();
    const second = media("audio");
    second.dispatchEvent(new Event("play"));
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(second.pause).not.toHaveBeenCalled();
  });
});
