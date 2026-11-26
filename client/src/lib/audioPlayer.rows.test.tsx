// @vitest-environment jsdom
/**
 * A tick of the playing track re-renders the active row, not every row in the
 * list, and nothing at all while the tab is hidden: the first visible moment
 * catches up once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { toggleTrack, useTrackPlayer } from "./audioPlayer";

let element: HTMLAudioElement | null = null;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const RealAudio = window.Audio;
  // A `function`, not an arrow: the code calls `new Audio()`, and vitest constructs through the mock.
  vi.spyOn(window, "Audio").mockImplementation(function () {
    return (element ??= new RealAudio());
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
});

function rendersOf(id: string) {
  const count = { n: 0 };
  const hook = renderHook(() => {
    count.n++;
    return useTrackPlayer(id);
  });
  return { count, hook };
}

describe("useTrackPlayer", () => {
  it("re-renders only the active row on a tick, and shares one view among the others", () => {
    const playing = rendersOf("a");
    const idle = rendersOf("b");
    const other = rendersOf("c");
    act(() => toggleTrack("a", "https://example.com/a.mp3"));
    expect(playing.hook.result.current.isActive).toBe(true);
    expect(idle.hook.result.current).toBe(other.hook.result.current);

    const before = { playing: playing.count.n, idle: idle.count.n };
    act(() => void element!.dispatchEvent(new Event("timeupdate")));
    act(() => void element!.dispatchEvent(new Event("timeupdate")));
    expect(playing.count.n).toBe(before.playing + 2);
    expect(idle.count.n).toBe(before.idle);
    expect(idle.hook.result.current.isActive).toBe(false);
  });

  it("leaves ticks for later while the tab is hidden, and catches up once on return", () => {
    act(() => toggleTrack("h", "https://example.com/h.mp3"));
    const playing = rendersOf("h");
    const before = playing.count.n;

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => {
      element!.dispatchEvent(new Event("timeupdate"));
      element!.dispatchEvent(new Event("timeupdate"));
    });
    expect(playing.count.n).toBe(before);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(playing.count.n).toBe(before + 1);
  });
});
