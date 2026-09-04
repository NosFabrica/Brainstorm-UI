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
});
