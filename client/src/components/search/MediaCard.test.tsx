// @vitest-environment jsdom
/**
 * The Media tab's card. A video plays in the card as it scrolls into view,
 * so a video its creator marked sensitive must not: the card shows the cover
 * and asks first.
 */
import { describe, expect, it, vi } from "vitest";
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
