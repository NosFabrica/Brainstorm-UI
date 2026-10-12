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
  // In view from the moment it is watched, which is when an unflagged card starts to play.
  class InView {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.cb(
        [{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the cover and starts nothing, where an unflagged one plays", () => {
    vi.stubGlobal("IntersectionObserver", InView);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const dim = (event: NostrEvent) => {
      event.tags = event.tags.map((t) => (t[0] === "imeta" ? [...t, "dim 1080x1920"] : t));
      return event;
    };

    const flagged = render(<MediaCard event={dim(short([["content-warning", "nudity"]]))} author={null} />);
    expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
    expect(flagged.container.querySelector("video")).toBeNull();
    expect(play).not.toHaveBeenCalled();
    flagged.unmount();

    render(<MediaCard event={dim(short())} author={null} />);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
