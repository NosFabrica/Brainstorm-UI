// @vitest-environment jsdom
/**
 * An event's files on its page: a sound says its length without loading the
 * file to ask, a clip shows its still before it plays, and a sensitive post's
 * cover takes the shape its first file will, so showing it moves nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { mediaItemsOf } from "@/lib/mediaKind";
import type { MinimalEvent } from "@/lib/noteRefs";
import { EventMedia } from "./EventMedia";

const ev = (tags: string[][], content = ""): MinimalEvent => ({
  id: "e".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1,
  kind: 1111,
  content,
  tags,
});

const draw = (event: MinimalEvent) => render(<EventMedia event={event} items={mediaItemsOf(event)} />);

afterEach(() => vi.restoreAllMocks());

describe("EventMedia", () => {
  it("a sound whose imeta says its duration is not loaded to ask for it", () => {
    const probe = vi.spyOn(window, "Audio");
    draw(ev([["imeta", "url https://x.test/a.mp3", "m audio/mpeg", "duration 61"]]));
    expect(screen.getByTestId("event-media-audio")).toHaveTextContent("1:01");
    expect(probe).not.toHaveBeenCalled();
  });

  it("a clip shows the still its imeta names", () => {
    draw(ev([["imeta", "url https://x.test/v.mp4", "m video/mp4", "image https://x.test/v.jpg"]]));
    expect(document.querySelector("video")?.getAttribute("poster")).toBe("https://x.test/v.jpg");
  });

  it("a sensitive post's cover stands in its first file's shape", () => {
    draw(
      ev([
        ["imeta", "url https://x.test/v.mp4", "m video/mp4", "dim 1080x1920"],
        ["content-warning", "x"],
      ]),
    );
    expect(screen.getByTestId("sensitive-cover").style.aspectRatio).toBe("1080 / 1920");
    fireEvent.click(screen.getByRole("button", { name: "Show video" }));
    expect(document.querySelector("video")?.style.aspectRatio).toBe("1080 / 1920");
  });
});
