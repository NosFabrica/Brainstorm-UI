// @vitest-environment jsdom
/**
 * NIP-71 video events (kinds 21 / 22 normal & short, 34235 / 34236 their
 * addressable twins) on the post page. Benjamin, over a DiVine short that
 * opened as a post with no video: "these divine videos should play." The
 * video URL carries no file extension — the imeta `m video/mp4` says what it
 * is — and the poster rides in imeta's `image`.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VideoHero } from "./VideoHero";

const short = {
  id: "1".repeat(64),
  kind: 34236,
  pubkey: "9".repeat(64),
  created_at: 1_760_000_000,
  content: "Yep, in 2006 Eminem gifted Sir Elton John a pair of diamond-encrusted rings.",
  sig: "",
  tags: [
    ["d", "b0f9"],
    ["imeta", "url https://media.divine.video/b0f9046b98cc", "m video/mp4", "image https://media.divine.video/8cf94982", "dim 1080x1920"],
    ["title", "#Today #June 21 #FunFact"],
    ["summary", "Yep, in 2006 Eminem gifted Sir Elton John a pair of rings."],
  ],
};

describe("VideoHero", () => {
  it("plays the imeta video with its poster, title and summary — extension or not", () => {
    render(<VideoHero event={short} />);
    const video = screen.getByTestId("video-hero-player") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://media.divine.video/b0f9046b98cc");
    expect(video.getAttribute("poster")).toBe("https://media.divine.video/8cf94982");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(screen.getByTestId("video-hero-title")).toHaveTextContent("#Today #June 21 #FunFact");
    expect(screen.getByText(/a pair of rings/)).toBeInTheDocument();
    // A portrait short stands upright, not stretched to a landscape box.
    expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-\[9\/16\]/);
  });

  it("a landscape video without imeta falls back to the url tag and a wide frame", () => {
    render(
      <VideoHero
        event={{ ...short, kind: 21, tags: [["url", "https://cdn.example/talk.mp4"], ["thumb", "https://cdn.example/talk.jpg"], ["title", "A talk"]] }}
      />,
    );
    const video = screen.getByTestId("video-hero-player") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://cdn.example/talk.mp4");
    expect(video.getAttribute("poster")).toBe("https://cdn.example/talk.jpg");
    expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-video/);
  });
});
