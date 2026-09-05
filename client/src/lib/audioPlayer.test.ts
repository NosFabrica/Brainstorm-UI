// @vitest-environment jsdom
/**
 * System now-playing: what Brainstorm plays shows on the lock screen and in
 * the browser's media hub with its artwork, and the hardware keys — play,
 * pause, next, previous — drive the shared player. The Media Session API,
 * fed from the queue's own metadata.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playNext, setPlaylist, toggleTrack } from "./audioPlayer";

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
