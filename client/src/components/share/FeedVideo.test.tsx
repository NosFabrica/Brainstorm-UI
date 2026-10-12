// @vitest-environment jsdom
/**
 * An inline video that the reader has just asked for ("Show video" on a sensitive cover) takes
 * focus as it appears. With reduced motion it is a poster under a "Play video" button, and the
 * button is what takes it.
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
