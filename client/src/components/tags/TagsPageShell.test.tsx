/**
 * The tags pages (`/tags`, `/tags/mine`) point at the explainer. With a video
 * to watch, that pointer is a row with its still, leading to the player on
 * `/how-tags-work`; a line of small grey text was easy to miss, most of all on
 * an empty "Your tags".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
// The chrome needs an AccountsProvider, and isn't what this is about.
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => null }));

import { TagsPageShell } from "./TagsPageShell";

const show = (view: "browse" | "mine") =>
  render(
    <TagsPageShell view={view} title="Your tags" subtitle="What people say about you.">
      <p>the page</p>
    </TagsPageShell>,
  );

describe.each(["mine", "browse"] as const)("the explainer pointer on the %s tags page", (view) => {
  beforeEach(() => {
    video.src = "https://media.example/tags-explainer.mp4";
  });

  it("is a row with the video's still, leading to the player", () => {
    show(view);
    const row = screen.getByTestId("tags-explainer-video");
    expect(row).toHaveAttribute("href", "/how-tags-work#watch");
    expect(row).toHaveTextContent("Watch: How tags work");
    expect(row).toHaveTextContent("3 min video, with sound");
    expect(row.querySelector("img")).toHaveAttribute("src", "/poster.webp");
    // One pointer, not two.
    expect(screen.queryByTestId("tags-guide-link")).toBeNull();
  });

  it("stays the plain link while no video is hosted", () => {
    video.src = null;
    show(view);
    expect(screen.queryByTestId("tags-explainer-video")).toBeNull();
    expect(screen.getByTestId("tags-guide-link")).toHaveAttribute("href", "/how-tags-work");
  });
});
