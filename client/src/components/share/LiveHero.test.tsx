// @vitest-environment jsdom
/**
 * The kind-30311 watch hero. A live stream plays in place: HLS through the
 * video player, a Twitch / Kick / YouTube page through that platform's own
 * embedded player. Only when neither is possible does the hero hand the
 * viewer to zap.stream.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { __resetRecordingChecks } from "@/lib/liveStream";
import { LiveHero } from "./LiveHero";

const stream = (tags: string[][]) => ({
  id: "1".repeat(64),
  kind: 30311,
  pubkey: "6f33c652db1c27cee905bc7da4c2cfb65a9f201808e9fbe49d12035d3e674815",
  created_at: 1_788_484_721,
  content: "",
  sig: "",
  tags: [["d", "abc"], ["title", "Dead By Daylight"], ...tags],
});

describe("LiveHero", () => {
  beforeEach(() => {
    __resetRecordingChecks();
    // Recording hosts answer unless a test says otherwise.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    // The player starts on arrival: take the native-HLS path and let play() succeed.
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("a live Twitch stream plays in the page through Twitch's player", () => {
    render(<LiveHero event={stream([["status", "live"], ["streaming", "https://www.twitch.tv/cowboisim"]])} />);
    const frame = screen.getByTestId("live-embed") as HTMLIFrameElement;
    expect(frame.src).toContain("player.twitch.tv/?channel=cowboisim");
    expect(frame.src).toContain(`parent=${window.location.hostname}`);
    expect(frame.getAttribute("allow")).toMatch(/fullscreen/);
    expect(screen.queryByTestId("live-watch-external")).toBeNull();
    // The way out is still one tap away, quietly.
    expect(screen.getByText(/Open in zap.stream/)).toBeInTheDocument();
  });

  // Benjamin: a stream opened from the grid should arrive already playing,
  // not behind a play button.
  it("a live HLS stream uses the video player and starts playing on arrival", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    render(<LiveHero event={stream([["status", "live"], ["streaming", "https://api-uk.zap.stream/x/live.m3u8"]])} />);
    expect(screen.getByTestId("live-player")).toBeInTheDocument();
    expect(screen.queryByTestId("live-embed")).toBeNull();
    await vi.waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.queryByTestId("live-play")).toBeNull();
  });

  it("a live stream with nothing playable hands off to zap.stream", () => {
    render(<LiveHero event={stream([["status", "live"], ["streaming", "https://cornychat.com/room"]])} />);
    expect(screen.getByText(/can.t play here/)).toBeInTheDocument();
    expect(screen.getByTestId("live-watch-external").getAttribute("href")).toMatch(/^https:\/\/zap\.stream\/naddr1/);
  });

  // A third of ended streams on the relay left a `recording` (zap.stream on
  // nearly all of its). "This stream has ended" was wrong for every one of them.
  it("an ended stream with a YouTube recording replays through YouTube's player", async () => {
    render(<LiveHero event={stream([["status", "ended"], ["recording", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]])} />);
    const frame = (await screen.findByTestId("replay-embed")) as HTMLIFrameElement;
    expect(frame.src).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(screen.queryByText(/This stream has ended/)).toBeNull();
    expect(screen.getByText(/Replay/)).toBeInTheDocument();
  });

  it("an ended stream with an HLS recording replays through the video player", async () => {
    render(<LiveHero event={stream([["status", "ended"], ["recording", "https://customer-51tz.cloudflarestream.com/abc/manifest/video.m3u8"]])} />);
    expect(await screen.findByTestId("live-player")).toBeInTheDocument();
    expect(screen.queryByText(/This stream has ended/)).toBeNull();
  });

  it("an ended stream with a video-file recording plays it as a video", async () => {
    render(<LiveHero event={stream([["status", "ended"], ["recording", "https://cdn.example/replay.mp4"]])} />);
    const video = (await screen.findByTestId("replay-video")) as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://cdn.example/replay.mp4");
    expect(video.hasAttribute("controls")).toBe(true);
  });

  // Odell's replay: data.zap.stream is gone, and a black player is worse than
  // the truth.
  it("a recording that no longer answers reads as ended, with the loss named", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<LiveHero event={stream([["status", "ended"], ["recording", "https://data.zap.stream/recording/2dbb68f0.m3u8"]])} />);
    expect(await screen.findByTestId("replay-gone")).toHaveTextContent(/recording is no longer available/i);
    expect(screen.queryByTestId("live-player")).toBeNull();
    expect(screen.queryByText(/Replay/)).toBeNull();
  });

  it("an ended stream with no recording still says so", () => {
    render(<LiveHero event={stream([["status", "ended"]])} />);
    expect(screen.getByText(/This stream has ended/)).toBeInTheDocument();
  });
});
