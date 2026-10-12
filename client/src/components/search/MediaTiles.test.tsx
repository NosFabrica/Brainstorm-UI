// @vitest-environment jsdom
/**
 * The Media tile grid. A tile for a video its creator marked sensitive shows
 * a placeholder in place of the poster or first frame; its tap still opens
 * the full view, which is told to ask first.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: { ...(await import("@/test/fakeEventStore")).eventStoreDefaults },
}));
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => openLightboxMock }));

import { MediaTiles } from "./RichSections";

const ID = "1".repeat(64);
const hit = (tags: string[][]): SearchHit =>
  ({
    event: {
      id: ID,
      kind: 34236,
      pubkey: "9".repeat(64),
      created_at: 1_790_000_000,
      sig: "s",
      content: "",
      tags: [["d", "b0f9"], ["title", "Morning at the lake"], ...tags],
    } as NostrEvent,
    author: null,
  }) as SearchHit;
const imeta = ["imeta", "url https://media.divine.video/b0f9", "m video/mp4", "image https://media.divine.video/thumb"];

describe("MediaTiles — a video marked sensitive", () => {
  it("is a placeholder with no poster or frame, and opens the full view covered", () => {
    render(<MediaTiles hits={[hit([imeta, ["content-warning", "nudity"]])]} />);
    const tile = screen.getByTestId(`media-tile-${ID}`);
    expect(within(tile).getByTestId("sensitive-tile")).toHaveTextContent("Sensitive");
    expect(tile.querySelector("img, video")).toBeNull();
    expect(within(tile).getByTestId("media-tile-media").getAttribute("aria-label")).toBe(
      "Sensitive video: Morning at the lake",
    );
    fireEvent.click(within(tile).getByTestId("media-tile-media"));
    expect(openLightboxMock).toHaveBeenLastCalledWith(
      [
        {
          url: "https://media.divine.video/b0f9",
          kind: "video",
          poster: "https://media.divine.video/thumb",
          warning: { reason: "nudity" },
        },
      ],
      0,
      expect.objectContaining({ postHref: expect.stringMatching(/^\/e\//) }),
    );
  });

  it("with only a poster, opens the post and never the poster", () => {
    openLightboxMock.mockClear();
    render(<MediaTiles hits={[hit([["imeta", "image https://media.divine.video/thumb"], ["content-warning"]])]} />);
    const tile = screen.getByTestId(`media-tile-${ID}`);
    expect(within(tile).getByTestId("sensitive-tile")).toBeInTheDocument();
    expect(tile.querySelector("img, video")).toBeNull();
    fireEvent.click(within(tile).getByTestId("media-tile-media"));
    expect(openLightboxMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toMatch(/^\/e\//);
  });

  it("leaves an unflagged video as it was", () => {
    render(<MediaTiles hits={[hit([imeta])]} />);
    const tile = screen.getByTestId(`media-tile-${ID}`);
    expect(within(tile).queryByTestId("sensitive-tile")).toBeNull();
    expect(tile.querySelector("img")?.getAttribute("src")).toBe("https://media.divine.video/thumb");
    expect(within(tile).getByTestId("media-tile-media").getAttribute("aria-label")).toBe("Play video");
    fireEvent.click(within(tile).getByTestId("media-tile-play"));
    expect(openLightboxMock).toHaveBeenLastCalledWith(
      [{ url: "https://media.divine.video/b0f9", kind: "video", poster: "https://media.divine.video/thumb" }],
      0,
      expect.anything(),
    );
  });
});
