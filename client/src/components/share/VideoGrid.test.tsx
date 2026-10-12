// @vitest-environment jsdom
/**
 * A person's videos as tiles, on their profile and under one of their videos.
 * The tiles used to be wide and cut to fill, which lost most of an upright
 * short and the edges of a square Vine. Now the frame follows the videos, a
 * mixed set shares one frame so its rows line up, and nothing is cut. Each
 * tile says when the video was published: a restored Vine's `created_at` is
 * the day it was imported.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MinimalEvent } from "@/lib/noteRefs";
import { VideoGrid, videoItemOf, type VideoItem } from "./VideoGrid";

const NOW = Math.floor(Date.now() / 1000);

const video = (n: number, dim: string | null, extra: string[][] = [], kind = 34236): MinimalEvent => ({
  id: String(n).repeat(64),
  pubkey: "9".repeat(64),
  kind,
  created_at: NOW - 3 * 86_400,
  content: "",
  tags: [
    ["d", `v${n}`],
    [
      "imeta",
      `url https://media.example/v${n}`,
      "m video/mp4",
      `image https://media.example/v${n}.jpg`,
      ...(dim ? [`dim ${dim}`] : []),
    ],
    ["title", `Video ${n}`],
    ...extra,
  ],
});

const items = (events: MinimalEvent[]) => events.map(videoItemOf).filter((v): v is VideoItem => v !== null);
const frames = () => screen.getAllByTestId("share-video-tile").map((t) => t.className);

describe("VideoGrid", () => {
  it("stands upright shorts upright, four to a row", () => {
    render(<VideoGrid videos={items([video(1, "1080x1920"), video(2, "720x1280")])} onOpen={vi.fn()} />);
    expect(frames()).toHaveLength(2);
    for (const frame of frames()) expect(frame).toMatch(/aspect-\[9\/16\]/);
    expect(screen.getByTestId("video-grid").className).toMatch(/grid-cols-2 sm:grid-cols-4/);
  });

  it("frames square Vines square", () => {
    render(<VideoGrid videos={items([video(1, "480x480"), video(2, "480x480")])} onOpen={vi.fn()} />);
    for (const frame of frames()) expect(frame).toMatch(/aspect-square/);
  });

  it("keeps wide videos, and videos that do not say their shape, wide and two to a row", () => {
    render(<VideoGrid videos={items([video(1, "1920x1080"), video(2, null)])} onOpen={vi.fn()} />);
    for (const frame of frames()) expect(frame).toMatch(/aspect-video/);
    expect(screen.getByTestId("video-grid").className).toMatch(/grid-cols-1 sm:grid-cols-2/);
  });

  // One frame for the set, so a row lines up; the poster is fitted inside it, so nothing is cut.
  it("gives a mixed set one square frame, and still cuts nothing", () => {
    render(
      <VideoGrid
        videos={items([video(1, "1080x1920"), video(2, "480x480"), video(3, "1920x1080")])}
        onOpen={vi.fn()}
      />,
    );
    expect(frames()).toHaveLength(3);
    for (const frame of frames()) {
      expect(frame).toMatch(/aspect-square/);
      expect(frame).not.toMatch(/aspect-video|aspect-\[9\/16\]/);
    }
    for (const poster of screen.getAllByTestId("video-tile-poster")) {
      expect(poster.className).toMatch(/object-contain/);
      expect(poster.className).not.toMatch(/object-cover/);
    }
  });

  it("dates a tile by when the video was published, not when it was imported", () => {
    render(
      <VideoGrid
        videos={items([video(1, "480x480", [["published_at", "1399982400"]]), video(2, "480x480")])}
        onOpen={vi.fn()}
      />,
    );
    const [vine, native] = screen.getAllByTestId("video-grid-item");
    // 2014-05-13, where its created_at is three days ago.
    expect(within(vine).getByTestId("video-tile-date")).toHaveTextContent(/2014/);
    expect(within(vine).getByTestId("video-tile-date")).not.toHaveTextContent(/ago/);
    expect(within(native).getByTestId("video-tile-date")).toHaveTextContent("3d ago");
    expect(within(vine).getByText("Video 1")).toBeInTheDocument();
  });

  it("shows a video marked sensitive as the placeholder, with no poster asked for", () => {
    render(<VideoGrid videos={items([video(1, "1080x1920", [["content-warning", "nudity"]])])} onOpen={vi.fn()} />);
    const tile = screen.getByTestId("share-video-tile");
    expect(within(tile).getByTestId("sensitive-tile")).toBeInTheDocument();
    expect(tile.querySelector("img, video")).toBeNull();
    expect(tile.getAttribute("aria-label")).toBe("Sensitive video: Video 1");
  });

  it("hands the tapped video to the caller", () => {
    const onOpen = vi.fn();
    const videos = items([video(1, "1080x1920"), video(2, "1080x1920")]);
    render(<VideoGrid videos={videos} onOpen={onOpen} />);
    fireEvent.click(screen.getAllByTestId("share-video-tile")[1]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(videos[1]);
  });
});

describe("VideoGrid, where a tile leads to the video's page", () => {
  it("makes each tile a link to its video, named by its title", () => {
    const videos = items([video(1, "1080x1920"), video(2, "1080x1920")]);
    render(<VideoGrid videos={videos} hrefOf={(v) => `/e/${v.event.id.slice(0, 4)}`} />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/e/1111", "/e/2222"]);
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["Video 1", "Video 2"]);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("videoItemOf", () => {
  it("reads the video, its poster and its title", () => {
    const item = videoItemOf(video(1, "1080x1920"))!;
    expect(item).toMatchObject({
      url: "https://media.example/v1",
      poster: "https://media.example/v1.jpg",
      title: "Video 1",
    });
    expect(item.video.dim).toEqual({ width: 1080, height: 1920 });
  });

  it("falls back to the url tag, as the video's own page does", () => {
    const event = { ...video(1, null), kind: 21, tags: [["url", "https://cdn.example/talk.mp4"]] };
    expect(videoItemOf(event)).toMatchObject({ url: "https://cdn.example/talk.mp4", title: "" });
  });

  it("is nothing for an event with no video and no poster", () => {
    expect(videoItemOf({ ...video(1, null), tags: [["title", "Empty"]] })).toBeNull();
  });
});
