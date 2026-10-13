import { vi } from "vitest";

/**
 * jsdom has no media pipeline: `play()` is not implemented and `paused` never
 * changes. This gives a suite about playback the part a browser would: `play`
 * and `pause` flip `paused`, and fire their event when they change it.
 *
 * Returns the `play` spy. Undo with `vi.restoreAllMocks()`.
 */
export function fakePlayback() {
  const playing = new WeakSet<HTMLMediaElement>();
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    if (!playing.has(this)) {
      playing.add(this);
      this.dispatchEvent(new Event("play"));
    }
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    if (playing.delete(this)) this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (this: HTMLMediaElement) {
    return !playing.has(this);
  });
  return play;
}
