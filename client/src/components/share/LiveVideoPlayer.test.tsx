// @vitest-environment jsdom
/**
 * Benjamin, over a stream opened from the Live grid: "when users click videos
 * it should load already playing — right now users still have to press play".
 * YouTube and Twitch start on arrival. Browsers allow that with sound once the
 * viewer has clicked anywhere on the site (the tile they came from); on a cold
 * deep link they refuse — so the player falls back to starting muted with one
 * Unmute button, the way Twitch does, and only asks for a tap when even that
 * is refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LiveVideoPlayer } from "./LiveVideoPlayer";

const notAllowed = () => Object.assign(new Error("play() failed because the user didn't interact"), { name: "NotAllowedError" });

describe("LiveVideoPlayer — starting on arrival", () => {
  let play: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // The native-HLS path (Safari's); nothing to download in a test.
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
    play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("with autoStart, plays on mount and shows no play button", async () => {
    render(<LiveVideoPlayer src="https://x/live.m3u8" autoStart />);
    await vi.waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.queryByTestId("live-play")).toBeNull();
    const video = screen.getByTestId("live-video") as HTMLVideoElement;
    expect(video.muted).toBe(false);
    expect(screen.queryByTestId("live-unmute")).toBeNull();
  });

  it("when the browser refuses sound, starts muted and offers one Unmute", async () => {
    play.mockRejectedValueOnce(notAllowed()).mockResolvedValue(undefined);
    render(<LiveVideoPlayer src="https://x/live.m3u8" autoStart />);
    const unmute = await screen.findByTestId("live-unmute");
    const video = screen.getByTestId("live-video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("live-play")).toBeNull();
    fireEvent.click(unmute);
    expect(video.muted).toBe(false);
    expect(screen.queryByTestId("live-unmute")).toBeNull();
  });

  it("when even muted playback is refused, the play button waits for a tap", async () => {
    play.mockRejectedValue(notAllowed());
    render(<LiveVideoPlayer src="https://x/live.m3u8" autoStart />);
    await screen.findByTestId("live-play");
    expect(screen.queryByTestId("live-unmute")).toBeNull();
  });
});
