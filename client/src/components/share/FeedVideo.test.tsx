// @vitest-environment jsdom
/**
 * An inline video that the reader has just asked for ("Show video" on a sensitive cover) takes
 * focus as it appears. With reduced motion it is a poster under a "Play video" button, and the
 * button is what takes it.
 *
 * Given the size its imeta says it is, the frame is that shape before the video loads, never
 * taller than the frame a video of unknown size gets. A short loops when asked to.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const reduce = vi.hoisted(() => ({ on: false }));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => reduce.on }));

import { FeedVideo } from "./FeedVideo";

describe("FeedVideo — autoFocus", () => {
  it("focuses the video when it plays in place", () => {
    reduce.on = false;
    render(<FeedVideo src="https://cdn.example/clip.mp4" autoFocus />);
    expect(document.activeElement).toBe(screen.getByTestId("feed-video-el"));
  });

  it("focuses the play button when motion is reduced, and leaves the video out of the tab order", () => {
    reduce.on = true;
    const { container } = render(<FeedVideo src="https://cdn.example/clip.mp4" autoFocus />);
    expect(document.activeElement).toBe(screen.getByTestId("feed-video-play"));
    expect(container.querySelector("video")!.hasAttribute("tabindex")).toBe(false);
  });

  it("takes no focus unless asked", () => {
    reduce.on = false;
    render(<FeedVideo src="https://cdn.example/clip.mp4" />);
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByTestId("feed-video-el").hasAttribute("tabindex")).toBe(false);
  });
});

describe("FeedVideo — the frame", () => {
  const frameOf = (dim?: { width: number; height: number }) => {
    reduce.on = false;
    render(<FeedVideo src="https://cdn.example/clip.mp4" dim={dim} />);
    return screen.getByTestId("feed-video");
  };

  it("is upright for a portrait video, and no taller than 34rem", () => {
    const frame = frameOf({ width: 1080, height: 1920 });
    expect(frame.dataset.shape).toBe("portrait");
    expect(frame.style.aspectRatio).toBe("1080 / 1920");
    expect(frame.style.maxWidth).toBe("19.125rem");
  });

  it("is square for a square one", () => {
    const frame = frameOf({ width: 480, height: 480 });
    expect(frame.dataset.shape).toBe("square");
    expect(frame.style.aspectRatio).toBe("480 / 480");
    expect(frame.style.maxWidth).toBe("34rem");
  });

  it("is wide for a landscape one", () => {
    const frame = frameOf({ width: 1920, height: 1080 });
    expect(frame.dataset.shape).toBe("landscape");
    expect(frame.style.aspectRatio).toBe("1920 / 1080");
  });

  it("sits in the middle of its column when it is narrower than it", () => {
    expect(frameOf({ width: 1080, height: 1920 }).className).toContain("mx-auto");
  });

  it("stays the one frame it was when the size is not known", () => {
    const frame = frameOf();
    expect(frame.className).not.toContain("mx-auto");
    expect(frame.dataset.shape).toBeUndefined();
    expect(frame.style.aspectRatio).toBe("");
    expect(frame.style.maxWidth).toBe("");
    expect(screen.getByTestId("feed-video-el").className).toContain("max-h-[34rem]");
  });

  it("a sliver of a size is drawn no narrower than a phone held upright", () => {
    expect(frameOf({ width: 100, height: 2000 }).style.aspectRatio).toBe("9 / 16");
  });

  it("holds its shape under the play button when motion is reduced", () => {
    reduce.on = true;
    const { container } = render(<FeedVideo src="https://cdn.example/clip.mp4" dim={{ width: 1080, height: 1920 }} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.dataset.shape).toBe("portrait");
    expect(frame.style.aspectRatio).toBe("1080 / 1920");
  });
});

describe("FeedVideo — loop", () => {
  it("loops when asked to, and only then", () => {
    reduce.on = false;
    const { unmount } = render(<FeedVideo src="https://cdn.example/clip.mp4" loop />);
    expect(screen.getByTestId("feed-video-el").hasAttribute("loop")).toBe(true);
    unmount();
    render(<FeedVideo src="https://cdn.example/clip.mp4" />);
    expect(screen.getByTestId("feed-video-el").hasAttribute("loop")).toBe(false);
  });

  it("loops under the play button too", () => {
    reduce.on = true;
    const { container } = render(<FeedVideo src="https://cdn.example/clip.mp4" loop />);
    expect(container.querySelector("video")!.hasAttribute("loop")).toBe(true);
  });
});
