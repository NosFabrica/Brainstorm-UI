// @vitest-environment jsdom
/**
 * The Media tab's card. A video plays in the card as it scrolls into view,
 * so a video its creator marked sensitive must not: the card shows the cover
 * and asks first. A video event is framed in the shape its imeta gives, a
 * short loops, and it is dated by when it was published.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));
vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: { ...(await import("@/test/fakeEventStore")).eventStoreDefaults },
}));

import { MediaCard } from "./cards";

const short = (tags: string[][] = []): NostrEvent =>
  ({
    id: "1".repeat(64),
    kind: 34236,
    pubkey: "9".repeat(64),
    created_at: 1_790_000_000,
    sig: "s",
    content: "",
    tags: [
      ["d", "b0f9"],
      ["imeta", "url https://media.divine.video/b0f9", "m video/mp4", "image https://media.divine.video/thumb"],
      ["title", "Morning at the lake"],
      ...tags,
    ],
  }) as NostrEvent;

describe("MediaCard — a video marked sensitive", () => {
  it("shows the cover in place of the player, and plays only once asked", () => {
    render(<MediaCard event={short([["content-warning", "nudity"]])} author={null} />);
    const card = screen.getByTestId(`media-card-${"1".repeat(64)}`);
    expect(within(card).getByTestId("sensitive-cover")).toHaveTextContent(
      "The creator marked this video as sensitive: nudity",
    );
    expect(screen.queryByTestId("feed-video")).toBeNull();
    expect(card.querySelector("video")).toBeNull();
    expect(card.querySelector('img[src*="thumb"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show video" }));
    expect(screen.queryByTestId("sensitive-cover")).toBeNull();
    expect(screen.getByTestId("feed-video-el").getAttribute("src")).toBe("https://media.divine.video/b0f9");
    expect(document.activeElement).toBe(screen.getByTestId("feed-video-el"));
    // Asking for the video is not opening the post.
    expect(window.location.pathname).toBe("/");
  });

  it("covers a flagged video event that has only a poster", () => {
    const posterOnly = short([["content-warning"]]);
    posterOnly.tags = posterOnly.tags.map((t) =>
      t[0] === "imeta" ? ["imeta", "url https://media.divine.video/b0f9", "image https://media.divine.video/thumb"] : t,
    );
    render(<MediaCard event={posterOnly} author={null} />);
    expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
    expect(screen.queryByTestId(`media-thumb-${"1".repeat(64)}`)).toBeNull();
  });

  it("leaves an unflagged video as it was", () => {
    render(<MediaCard event={short()} author={null} />);
    expect(screen.queryByTestId("sensitive-cover")).toBeNull();
    const video = screen.getByTestId("feed-video-el");
    expect(video.getAttribute("src")).toBe("https://media.divine.video/b0f9");
    expect(video.getAttribute("poster")).toBe("https://media.divine.video/thumb");
    // A list of cards never moves focus by itself.
    expect(document.activeElement).toBe(document.body);
    expect(video.hasAttribute("tabindex")).toBe(false);
  });
});

describe("MediaCard — a video event's shape", () => {
  const withDim = (kind: number, dim: string, tags: string[][] = []): NostrEvent => {
    const event = short(tags);
    event.kind = kind;
    event.tags = event.tags.map((t) =>
      t[0] === "imeta" ? ["imeta", "url https://media.divine.video/b0f9", "m video/mp4", `dim ${dim}`] : t,
    );
    return event;
  };

  it("frames a portrait short upright and loops it", () => {
    render(<MediaCard event={withDim(34236, "1080x1920")} author={null} />);
    expect(screen.getByTestId("feed-video").dataset.shape).toBe("portrait");
    expect(screen.getByTestId("feed-video-el").hasAttribute("loop")).toBe(true);
  });

  it("frames a classic Vine square", () => {
    render(<MediaCard event={withDim(34236, "480x480", [["platform", "vine"]])} author={null} />);
    expect(screen.getByTestId("feed-video").dataset.shape).toBe("square");
  });

  it("frames a long video by its size and does not loop it", () => {
    render(<MediaCard event={withDim(21, "1920x1080")} author={null} />);
    expect(screen.getByTestId("feed-video").dataset.shape).toBe("landscape");
    expect(screen.getByTestId("feed-video-el").hasAttribute("loop")).toBe(false);
  });

  it("keeps the one frame for a video that gives no size", () => {
    render(<MediaCard event={short()} author={null} />);
    expect(screen.getByTestId("feed-video").dataset.shape).toBeUndefined();
    expect(screen.getByTestId("feed-video-el").hasAttribute("loop")).toBe(true);
  });
});

describe("MediaCard — a flagged video in view", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const dim = (event: NostrEvent) => {
    event.tags = event.tags.map((t) => (t[0] === "imeta" ? [...t, "dim 1080x1920"] : t));
    return event;
  };

  it("shows the cover and starts nothing, where an unflagged one plays", () => {
    // Wholly in view from the moment it is watched, which is when an unflagged card starts to play.
    stubVisibleIntersectionObserver({ ratio: 1 });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());

    const flagged = render(<MediaCard event={dim(short([["content-warning", "nudity"]]))} author={null} />);
    expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
    expect(flagged.container.querySelector("video")).toBeNull();
    expect(play).not.toHaveBeenCalled();
    flagged.unmount();

    render(<MediaCard event={dim(short())} author={null} />);
    expect(play).toHaveBeenCalledTimes(1);
  });

  // The cover used to be a wide box whatever the video was, so "Show video" on an upright
  // short swapped a 16:9 cover for a 9:16 player and everything under it moved.
  it("the cover holds the frame the video will take, so showing it moves nothing", () => {
    render(<MediaCard event={dim(short([["content-warning", "nudity"]]))} author={null} />);
    const cover = screen.getByTestId("media-card-cover");
    expect(within(cover).getByTestId("sensitive-cover")).toBeInTheDocument();
    const before = { aspectRatio: cover.style.aspectRatio, maxWidth: cover.style.maxWidth };
    expect(before).toEqual({ aspectRatio: "1080 / 1920", maxWidth: "19.125rem" });
    expect(cover.className).toContain("mx-auto");

    fireEvent.click(screen.getByRole("button", { name: "Show video" }));
    const frame = screen.getByTestId("feed-video");
    expect({ aspectRatio: frame.style.aspectRatio, maxWidth: frame.style.maxWidth }).toEqual(before);
    expect(frame.className).toContain("mx-auto");
  });

  it("a flagged video that gives no size keeps the wide cover", () => {
    render(<MediaCard event={short([["content-warning", "nudity"]])} author={null} />);
    expect(screen.queryByTestId("media-card-cover")).toBeNull();
    expect(screen.getByTestId("sensitive-cover").className).toContain("aspect-video");
  });
});

// A restored Vine is signed the day it was imported; `published_at` is the day it was posted.
const classicVine = (): NostrEvent =>
  ({
    id: "7".repeat(64),
    kind: 34236,
    pubkey: "9".repeat(64),
    created_at: Math.floor(Date.now() / 1000) - 60,
    sig: "s",
    content: "Vampire Eric",
    tags: [
      ["d", "OaXhLEvJxwA"],
      ["title", "Vampire Eric"],
      [
        "imeta",
        "url https://media.divine.video/9001",
        "m video/mp4",
        "image https://media.divine.video/9001.jpg",
        "dim 480x480",
      ],
      ["published_at", "1410674550"],
      ["platform", "vine"],
      ["l", "vine-archive", "archive.divine.video"],
    ],
  }) as NostrEvent;

describe("MediaCard — a video's date", () => {
  it("dates a classic Vine by the day it was posted, not the day it was imported", () => {
    render(<MediaCard event={classicVine()} author={null} />);
    const card = screen.getByTestId(`media-card-${"7".repeat(64)}`);
    expect(card).toHaveTextContent("Sep 14, 2014");
    expect(card).not.toHaveTextContent("1m ago");
  });
});
