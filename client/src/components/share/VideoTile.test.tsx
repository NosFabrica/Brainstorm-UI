// @vitest-environment jsdom
/**
 * A profile's video tile. Benjamin, over tiles showing a broken-image glyph:
 * "these images need to be fixed for the video thumbnails." Posters die
 * (expired CDN links, hosts gone) — when one fails the tile falls back to
 * the video's own first frame, and with no video at all to a quiet
 * placeholder, never a broken image.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VideoTile } from "./VideoTile";

describe("VideoTile", () => {
  it("shows the poster, and on failure the video's first frame instead", () => {
    render(<VideoTile poster="https://cdn.dead/poster.jpg" url="https://cdn.example/clip.mp4" onOpen={vi.fn()} />);
    const poster = screen.getByTestId("video-tile-poster") as HTMLImageElement;
    expect(poster.src).toBe("https://cdn.dead/poster.jpg");
    fireEvent.error(poster);
    expect(screen.queryByTestId("video-tile-poster")).toBeNull();
    const frame = screen.getByTestId("video-tile-frame") as HTMLVideoElement;
    expect(frame.getAttribute("src")).toBe("https://cdn.example/clip.mp4#t=0.1");
  });

  it("with no poster and no playable url, a placeholder — never a broken image", () => {
    render(<VideoTile poster={undefined} url={undefined} onOpen={vi.fn()} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("video-tile-placeholder")).toBeInTheDocument();
  });

  it("a tap opens the video (the caller decides how)", () => {
    const onOpen = vi.fn();
    render(<VideoTile poster="https://cdn.example/p.jpg" url="https://cdn.example/clip.mp4" onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("share-video-tile"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // A portrait short or a square Vine used to be cut to a wide tile. The tile now takes the
  // frame it is given, and whatever it shows is fitted inside it, never cut to fill it.
  it("stands in the frame it is given: upright, square, or wide when not told", () => {
    const tile = (shape?: "portrait" | "square" | "landscape") => {
      const { unmount } = render(<VideoTile poster="https://cdn.example/p.jpg" shape={shape} onOpen={vi.fn()} />);
      const className = screen.getByTestId("share-video-tile").className;
      unmount();
      return className;
    };
    expect(tile("portrait")).toMatch(/aspect-\[9\/16\]/);
    expect(tile("square")).toMatch(/aspect-square/);
    expect(tile("landscape")).toMatch(/aspect-video/);
    expect(tile()).toMatch(/aspect-video/);
    expect(tile("portrait")).not.toMatch(/aspect-video|aspect-square/);
  });

  it("never crops the poster, or the first frame that stands in for it", () => {
    render(<VideoTile poster="https://cdn.dead/poster.jpg" url="https://cdn.example/clip.mp4" onOpen={vi.fn()} />);
    const poster = screen.getByTestId("video-tile-poster");
    expect(poster.className).toMatch(/object-contain/);
    expect(poster.className).not.toMatch(/object-cover/);
    fireEvent.error(poster);
    const frame = screen.getByTestId("video-tile-frame");
    expect(frame.className).toMatch(/object-contain/);
    expect(frame.className).not.toMatch(/object-cover/);
  });

  // Where a tile leads to the video's page it is a link, so a new tab and "copy link" work.
  it("given an href, is a link to the video's page, named by its title", () => {
    render(<VideoTile poster="https://cdn.example/p.jpg" title="Goal" href="/e/naddr1goal" />);
    const tile = screen.getByRole("link", { name: "Goal" });
    expect(tile).toBe(screen.getByTestId("share-video-tile"));
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe("/e/naddr1goal");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("video-tile-poster")).toBeInTheDocument();
  });

  it("a link with no title is named “Video”, and a sensitive one says so before its title", () => {
    const { unmount } = render(<VideoTile poster="https://cdn.example/p.jpg" href="/e/naddr1goal" />);
    expect(screen.getByRole("link", { name: "Video" })).toBeInTheDocument();
    unmount();
    render(<VideoTile poster="https://cdn.example/p.jpg" title="Goal" warning={{}} href="/e/naddr1goal" />);
    const tile = screen.getByRole("link", { name: "Sensitive video: Goal" });
    expect(tile.querySelector("img, video")).toBeNull();
  });

  it("a video marked sensitive is a placeholder, never its poster or a frame; the tap still opens it", () => {
    const onOpen = vi.fn();
    render(
      <VideoTile
        poster="https://cdn.example/p.jpg"
        url="https://cdn.example/clip.mp4"
        warning={{ reason: "nudity" }}
        title="Goal"
        onOpen={onOpen}
      />,
    );
    const tile = screen.getByTestId("share-video-tile");
    // It is not offered as "Play": the tap opens a cover first.
    expect(tile.getAttribute("aria-label")).toBe("Sensitive video: Goal");
    expect(screen.getByTestId("sensitive-tile")).toHaveTextContent("Sensitive");
    expect(tile.querySelector("img, video")).toBeNull();
    fireEvent.click(tile);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
