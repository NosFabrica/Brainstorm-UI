// @vitest-environment jsdom
/**
 * When the queue runs out the bar used to blink away. Spotify leaves it in
 * place, paused on the last track, ready to play again. So does ours now.
 * (A file of its own: the player is a module singleton, and this test needs
 * to own the audio element it creates.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const created: HTMLAudioElement[] = [];
vi.stubGlobal("Audio", function Audio() {
  const a = document.createElement("audio");
  created.push(a);
  return a;
});
import { closePlayer, playerSnapshot, setPlaylist, toggleTrack } from "./audioPlayer";

describe("audioPlayer — the end of the queue", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => { closePlayer(); vi.restoreAllMocks(); });

  it("the last track ends paused and stays the current one; an earlier one hands off", () => {
    setPlaylist([{ id: "a", src: "https://cdn/a.mp3", title: "A" }, { id: "b", src: "https://cdn/b.mp3", title: "B" }]);
    toggleTrack("a", "https://cdn/a.mp3");
    const audio = created[0];
    expect(audio).toBeDefined();
    audio.dispatchEvent(new Event("ended"));
    expect(playerSnapshot().currentId).toBe("b");
    audio.dispatchEvent(new Event("ended"));
    expect(playerSnapshot().currentId).toBe("b");
    expect(playerSnapshot().status).toBe("paused");
  });
});
