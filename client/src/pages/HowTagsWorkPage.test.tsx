/**
 * `/how-tags-work` is where the tags explainer video lives: every "How tags
 * work" link in the app already leads here, and the page is public, so the
 * link is one anyone can be sent. The video has sound and runs three minutes,
 * so it waits to be asked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { fakePlayback } from "@/test/fakePlayback";

const video = vi.hoisted(() => ({ src: null as string | null }));
vi.mock("@/config/explainers", () => ({
  TAGS_EXPLAINER: {
    get src() {
      return video.src;
    },
    poster: "/poster.webp",
    title: "How tags work",
    length: "3 min",
  },
}));
// The chrome needs an AccountsProvider, and isn't what this page is about.
vi.mock("@/components/InfoPageLayout", () => ({
  InfoPageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import HowTagsWorkPage from "./HowTagsWorkPage";

const HOSTED = "https://media.example/tags-explainer.mp4";

describe("the tags explainer video on /how-tags-work", () => {
  beforeEach(() => {
    video.src = HOSTED;
  });
  afterEach(() => vi.restoreAllMocks());

  it("is there to watch, with its still, and loads nothing until asked", () => {
    render(<HowTagsWorkPage />);
    const player = screen.getByTestId("explainer-video").querySelector("video")!;
    expect(player).toHaveAttribute("src", HOSTED);
    expect(player).toHaveAttribute("poster", "/poster.webp");
    expect(player).toHaveAttribute("preload", "none");
    expect(player).not.toHaveAttribute("autoplay");
    expect(screen.getByTestId("explainer-video")).toHaveTextContent("3 min, with sound");
  });

  it("plays when its play button is pressed, and hands over to the player's own controls", () => {
    const play = fakePlayback();
    render(<HowTagsWorkPage />);
    const player = screen.getByTestId("explainer-video").querySelector("video")!;
    expect(player).not.toHaveAttribute("controls");

    fireEvent.click(screen.getByRole("button", { name: "Play video: How tags work" }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(player).toHaveAttribute("controls");
    expect(screen.queryByRole("button", { name: "Play video: How tags work" })).toBeNull();
  });

  it("is where the link from the tags pages lands", () => {
    render(<HowTagsWorkPage />);
    expect(screen.getByTestId("explainer-video")).toHaveAttribute("id", "watch");
  });

  it("with no video hosted yet, the page offers none", () => {
    video.src = null;
    render(<HowTagsWorkPage />);
    expect(screen.queryByTestId("explainer-video")).toBeNull();
    expect(screen.getByTestId("section-htw-simple")).toBeInTheDocument();
  });
});

/**
 * The words under the video are the video's own, in its order, so someone who
 * watched it reads the same story and someone who didn't gets it in a minute.
 * Simplifying must not drop the three things the page exists to admit.
 */
describe("the copy on /how-tags-work backs the video", () => {
  beforeEach(() => {
    video.src = HOSTED;
  });

  it("tells it in the video's order, under the video's headlines", () => {
    render(<HowTagsWorkPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Word of mouth, for the whole internet.");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "People you know count. Bots don't.",
      "Nobody can erase a tag. Anyone can disagree.",
      "Your reputation goes where you go.",
      "Not in the list? Search for it.",
      "Your turn.",
    ]);
    expect(screen.getByTestId("section-htw-simple")).toHaveTextContent(
      "A tag is a friend saying “he makes the best coffee”, written down.",
    );
  });

  it("still admits the three things a simpler page could lose", () => {
    render(<HowTagsWorkPage />);
    expect(screen.getByTestId("section-htw-no-delete")).toHaveTextContent("There is no delete button");
    expect(screen.getByTestId("section-htw-counts")).toHaveTextContent("a rough guide, not the last word");
    expect(screen.getByTestId("section-htw-discovery")).toHaveTextContent("Search finds every tag");
  });

  it("ends by telling the reader how to tag someone, and the one rule", () => {
    render(<HowTagsWorkPage />);
    const turn = screen.getByTestId("section-htw-try");
    expect(turn).toHaveTextContent("Add a tag");
    expect(turn).toHaveTextContent("There are no take-backs, so say it the way you'd say it in person.");
  });
});
