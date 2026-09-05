// @vitest-environment jsdom
/**
 * System now-playing: what Brainstorm plays shows on the lock screen and in
 * the browser's media hub with its artwork, and the hardware keys — play,
 * pause, next, previous — drive the shared player. The Media Session API,
 * fed from the queue's own metadata.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closePlayer, extendPlaylist, peekNext, playNext, setPlaylist, stopAllMedia, toggleTrack } from "./audioPlayer";

type Handler = (() => void) | null;
const handlers = new Map<string, Handler>();
const session = { metadata: null as null | { title: string; artist: string; artwork: { src: string }[] }, setActionHandler: vi.fn((name: string, h: Handler) => handlers.set(name, h)) };

describe("audioPlayer — Media Session", () => {
  beforeEach(() => {
    handlers.clear();
    session.metadata = null;
    Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
    vi.stubGlobal("MediaMetadata", class { title: string; artist: string; album: string; artwork: { src: string }[]; constructor(init: { title: string; artist?: string; album?: string; artwork?: { src: string }[] }) { this.title = init.title; this.artist = init.artist ?? ""; this.album = init.album ?? ""; this.artwork = init.artwork ?? []; } });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("tells the system what plays, from the queue's metadata, and moves with Next", () => {
    setPlaylist([
      { id: "a", src: "https://cdn/a.mp3", title: "Old Carbon", artist: "NOVA", cover: "https://img/a.jpg" },
      { id: "b", src: "https://cdn/b.mp3", title: "Duende", artist: "NOVA" },
    ]);
    toggleTrack("a", "https://cdn/a.mp3");
    expect(session.metadata).toMatchObject({ title: "Old Carbon", artist: "NOVA", artwork: [{ src: "https://img/a.jpg" }] });
    playNext();
    expect(session.metadata).toMatchObject({ title: "Duende", artist: "NOVA" });
  });

  it("wires the hardware keys: play, pause, next and previous", () => {
    setPlaylist([{ id: "a", src: "https://cdn/a.mp3", title: "A" }, { id: "b", src: "https://cdn/b.mp3", title: "B" }]);
    toggleTrack("a", "https://cdn/a.mp3");
    for (const key of ["play", "pause", "nexttrack", "previoustrack"]) expect(handlers.get(key)).toEqual(expect.any(Function));
    handlers.get("nexttrack")!();
    expect(session.metadata?.title).toBe("B");
    handlers.get("previoustrack")!();
    expect(session.metadata?.title).toBe("A");
  });
});

// The bar follows the listener across the app now, so the music does too:
// leaving a page stops its videos, never the song.
describe("audioPlayer — music outlives the page", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => { closePlayer(); vi.restoreAllMocks(); });

  it("a route change pauses videos on the page but not the shared audio", () => {
    const video = document.createElement("video");
    document.body.appendChild(video);
    Object.defineProperty(video, "paused", { value: false, configurable: true });
    toggleTrack("a", "https://cdn/a.mp3", { title: "A" });
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();
    stopAllMedia();
    // Exactly the page's video, once — the shared player kept going.
    expect(pause).toHaveBeenCalledTimes(1);
    expect(pause.mock.instances[0]).toBe(video);
    video.remove();
  });

  it("closePlayer stops the sound and forgets the track", () => {
    toggleTrack("a", "https://cdn/a.mp3", { title: "A" });
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();
    closePlayer();
    expect(pause).toHaveBeenCalled();
    expect(navigator.mediaSession?.metadata ?? null).toBeNull();
  });
});

describe("audioPlayer — extending the line-up behind the active track", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => { closePlayer(); vi.restoreAllMocks(); });

  it("lines new tracks up right after the active one, once each, keeping what was already queued", () => {
    setPlaylist([{ id: "a", src: "https://cdn/a.mp3", title: "A" }]);
    toggleTrack("a", "https://cdn/a.mp3");
    extendPlaylist([{ id: "b", src: "https://cdn/b.mp3", title: "B" }, { id: "a", src: "https://cdn/a.mp3", title: "A" }, { id: "c", src: "https://cdn/c.mp3", title: "C" }]);
    expect(peekNext("a")?.id).toBe("b");
    expect(peekNext("b")?.id).toBe("c");
    expect(peekNext("c")).toBeNull();
  });

  it("a lone track that was never in a list becomes the head of one", () => {
    setPlaylist([]);
    toggleTrack("solo", "https://cdn/s.mp3", { title: "Solo" });
    extendPlaylist([{ id: "n", src: "https://cdn/n.mp3", title: "N" }]);
    expect(peekNext("solo")?.id).toBe("n");
  });
});
