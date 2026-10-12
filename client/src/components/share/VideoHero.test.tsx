// @vitest-environment jsdom
/**
 * NIP-71 video events (kinds 21 / 22 normal & short, 34235 / 34236 their
 * addressable twins) on the post page. Benjamin, over a DiVine short that
 * opened as a post with no video: "these divine videos should play." The
 * video URL carries no file extension — the imeta `m video/mp4` says what it
 * is — and the poster rides in imeta's `image`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { VideoHero } from "./VideoHero";

const requestNav = vi.fn();
vi.mock("@/components/share/ShareNavContext", () => ({ useShareNav: () => requestNav }));

const short = {
  id: "1".repeat(64),
  kind: 34236,
  pubkey: "9".repeat(64),
  created_at: 1_760_000_000,
  content: "Yep, in 2006 Eminem gifted Sir Elton John a pair of diamond-encrusted rings.",
  sig: "",
  tags: [
    ["d", "b0f9"],
    [
      "imeta",
      "url https://media.divine.video/b0f9046b98cc",
      "m video/mp4",
      "image https://media.divine.video/8cf94982",
      "dim 1080x1920",
    ],
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
        event={{
          ...short,
          kind: 21,
          tags: [
            ["url", "https://cdn.example/talk.mp4"],
            ["thumb", "https://cdn.example/talk.jpg"],
            ["title", "A talk"],
          ],
        }}
      />,
    );
    const video = screen.getByTestId("video-hero-player") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://cdn.example/talk.mp4");
    expect(video.getAttribute("poster")).toBe("https://cdn.example/talk.jpg");
    expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-video/);
  });

  // A short reads as a short: the right shape, looping, with what its own tags say about it.
  describe("a short reads as a short", () => {
    const withTags = (tags: string[][], kind = 34236) => ({ ...short, kind, tags });
    const imeta = (dim: string) => [
      "imeta",
      "url https://media.divine.video/b0f9046b98cc",
      "m video/mp4",
      "image https://media.divine.video/8cf94982",
      `dim ${dim}`,
    ];
    const vine = withTags([
      ["d", "iq3bXYa5duP"],
      [...imeta("480x480"), "duration 6"],
      ["title", "So cute"],
      ["summary", "So cute\n\nOriginal stats: 491 loops - 39 likes"],
      ["platform", "vine"],
      ["l", "vine-archive", "archive.divine.video"],
      ["loops", "1234567"],
      ["likes", "4"],
      ["published_at", "1399982400"],
      ["client", "vine-archive-importer"],
    ]);

    it("frames a square video square, and a portrait one upright", () => {
      const { unmount } = render(<VideoHero event={withTags([imeta("1080x1080")])} />);
      expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-square/);
      unmount();
      // A few pixels off square is still square.
      const near = render(<VideoHero event={withTags([imeta("1080x1040")])} />);
      expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-square/);
      near.unmount();
      render(<VideoHero event={withTags([imeta("1080x1920")])} />);
      expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-\[9\/16\]/);
      expect(screen.getByTestId("video-hero-frame").className).not.toMatch(/aspect-square/);
    });

    it("loops a short, and never a full-length video", () => {
      const { unmount } = render(<VideoHero event={short} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(true);
      unmount();
      const twentyTwo = render(<VideoHero event={{ ...short, kind: 22 }} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(true);
      twentyTwo.unmount();
      const long = render(<VideoHero event={{ ...short, kind: 21 }} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(false);
      // The page never starts a video by itself.
      expect(screen.getByTestId("video-hero-player").hasAttribute("autoplay")).toBe(false);
      long.unmount();
      render(<VideoHero event={{ ...short, kind: 34235 }} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(false);
    });

    it("names the video for a screen reader by its alt, else its title", () => {
      const { unmount } = render(<VideoHero event={withTags([...short.tags, ["alt", "Two rings on a piano"]])} />);
      expect(screen.getByTestId("video-hero-player").getAttribute("aria-label")).toBe("Two rings on a piano");
      unmount();
      render(<VideoHero event={short} />);
      expect(screen.getByTestId("video-hero-player").getAttribute("aria-label")).toBe("#Today #June 21 #FunFact");
    });

    it("a restored Vine says how long it is and what Vine counted", () => {
      render(<VideoHero event={{ ...vine, created_at: 1_760_000_000 }} />);
      const facts = screen.getByTestId("video-hero-facts");
      expect(facts).toHaveTextContent(/^6s · 1,234,567 loops · 4 likes/);
      expect(within(facts).getByTestId("video-hero-vine")).toHaveTextContent("Classic Vine");
      // The date is the byline's to say, once.
      expect(facts).not.toHaveTextContent(/20\d\d/);
      // The summary was only the title and the stats again.
      expect(screen.queryByText(/Original stats/)).toBeNull();
      expect(screen.getAllByText("So cute")).toHaveLength(1);
    });

    it("a native short says its length, and nothing about Vine; a minute or more reads as m:ss", () => {
      render(<VideoHero event={withTags([...short.tags, ["duration", "65"]])} />);
      const facts = screen.getByTestId("video-hero-facts");
      expect(facts).toHaveTextContent(/^1:05$/);
    });

    it("has no facts line when the event gives none", () => {
      render(<VideoHero event={short} />);
      expect(screen.queryByTestId("video-hero-facts")).toBeNull();
    });

    it("offers the hashtags the words do not already carry, each a way to its tag", () => {
      render(
        <VideoHero
          event={withTags([
            ...short.tags.filter((t) => t[0] !== "summary"),
            ["summary", "Rings for #Elton, from Eminem."],
            ["t", "today"],
            ["t", "Elton"],
            ["t", "music"],
            ["t", "FunFact"],
            ["t", "history"],
          ])}
        />,
      );
      const chips = screen.getAllByTestId("video-hero-hashtag");
      expect(chips.map((c) => c.textContent)).toEqual(["#music", "#history"]);
      fireEvent.click(chips[0]);
      expect(requestNav).toHaveBeenLastCalledWith({ kind: "hashtag", target: "#music", label: "#music" });
    });

    it("offers twelve hashtags at most", () => {
      const many = Array.from({ length: 15 }, (_, i) => ["t", `tag${i + 1}`]);
      render(<VideoHero event={withTags([...short.tags, ...many])} />);
      const chips = screen.getAllByTestId("video-hero-hashtag");
      expect(chips).toHaveLength(12);
      expect(chips.at(-1)).toHaveTextContent("#tag12");
    });

    it("shows no hashtag row when the words carry them all", () => {
      render(<VideoHero event={withTags([...short.tags, ["t", "today"], ["t", "funfact"]])} />);
      expect(screen.queryByTestId("video-hero-hashtags")).toBeNull();
    });

    it("links to the video on Divine when it is Divine's, and not otherwise", () => {
      const { unmount } = render(<VideoHero event={vine} />);
      const link = screen.getByTestId("video-hero-divine");
      expect(link.getAttribute("href")).toBe("https://divine.video/video/iq3bXYa5duP");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link).toHaveTextContent("Watch on");
      expect(within(link).getByTestId("brand-divine")).toBeInTheDocument();
      unmount();
      render(
        <VideoHero
          event={withTags(
            [
              ["d", "talk"],
              ["url", "https://cdn.example/talk.mp4"],
              ["title", "A talk"],
            ],
            21,
          )}
        />,
      );
      expect(screen.queryByTestId("video-hero-divine")).toBeNull();
    });

    it("says where Divine recorded it, as Divine's own check", () => {
      const { unmount } = render(<VideoHero event={withTags([...short.tags, ["verification", "verified_mobile"]])} />);
      const chip = screen.getByTestId("video-hero-capture");
      expect(chip).toHaveTextContent("Recorded in the Divine app");
      expect(chip.getAttribute("title")).toBe("Divine's own capture check, not a Brainstorm trust score");
      unmount();
      const web = render(<VideoHero event={withTags([...short.tags, ["verification", "verified_web"]])} />);
      expect(screen.getByTestId("video-hero-capture")).toHaveTextContent("Recorded in Divine on the web");
      web.unmount();
      render(<VideoHero event={short} />);
      expect(screen.queryByTestId("video-hero-capture")).toBeNull();
    });
  });

  // Safe by default: nothing of a video its creator marked sensitive is asked for until the reader says so.
  describe("a video its creator marked sensitive", () => {
    const flagged = { ...short, tags: [...short.tags, ["content-warning", "nudity"]] };

    it("is covered, with no player and no poster, until “Show video”", () => {
      render(<VideoHero event={flagged} />);
      const frame = screen.getByTestId("video-hero-frame");
      expect(within(frame).getByTestId("sensitive-cover")).toHaveTextContent(
        "The creator marked this video as sensitive: nudity",
      );
      expect(screen.queryByTestId("video-hero-player")).toBeNull();
      expect(frame.querySelector("video, img")).toBeNull();
      // The words stay: they are the creator's description, not the video.
      expect(screen.getByTestId("video-hero-title")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Show video" }));
      expect(screen.queryByTestId("sensitive-cover")).toBeNull();
      const video = screen.getByTestId("video-hero-player");
      expect(video.getAttribute("src")).toBe("https://media.divine.video/b0f9046b98cc");
      expect(video.getAttribute("poster")).toBe("https://media.divine.video/8cf94982");
      // The button that had focus is gone: focus lands on what it revealed.
      expect(document.activeElement).toBe(video);
    });

    it("does not take focus for a video that was never covered", () => {
      render(<VideoHero event={short} />);
      expect(document.activeElement).toBe(document.body);
    });

    it("is covered again on a new visit", () => {
      const first = render(<VideoHero event={flagged} />);
      fireEvent.click(screen.getByRole("button", { name: "Show video" }));
      first.unmount();
      render(<VideoHero event={flagged} />);
      expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
    });

    // The reveal is for one video: another flagged video drawn in the same place asks again.
    it("is covered again when the page turns to a different flagged video", () => {
      const { rerender } = render(<VideoHero event={flagged} />);
      fireEvent.click(screen.getByRole("button", { name: "Show video" }));
      expect(screen.getByTestId("video-hero-player")).toBeInTheDocument();
      rerender(<VideoHero event={{ ...flagged, id: "2".repeat(64) }} />);
      expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
      expect(screen.queryByTestId("video-hero-player")).toBeNull();
      // …and the first one, come back to, asks again too.
      rerender(<VideoHero event={flagged} />);
      expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
    });

    it("covers a video labelled in the content-warning namespace too", () => {
      render(<VideoHero event={{ ...short, tags: [...short.tags, ["l", "violence", "content-warning"]] }} />);
      expect(screen.getByTestId("sensitive-cover")).toHaveTextContent(": violence");
      expect(screen.queryByTestId("video-hero-player")).toBeNull();
    });
  });
});
