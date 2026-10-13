// @vitest-environment jsdom
/**
 * The Media tile grid. A tile for a video its creator marked sensitive shows
 * a placeholder in place of the poster or first frame; its tap still opens
 * the full view, which is told to ask first. A tile is captioned with the
 * title, and an upright or square video is fitted into it whole.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
          loop: true,
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
      [
        {
          url: "https://media.divine.video/b0f9",
          kind: "video",
          poster: "https://media.divine.video/thumb",
          loop: true,
        },
      ],
      0,
      expect.anything(),
    );
  });

  // A short goes round again in the full view, as on its own page. A full-length video plays once.
  it("opens a short looping, and a full-length video not", () => {
    const { unmount } = render(<MediaTiles hits={[hit([imeta])]} />);
    fireEvent.click(screen.getByTestId("media-tile-play"));
    expect(openLightboxMock.mock.lastCall![0][0].loop).toBe(true);
    unmount();
    const long = hit([imeta]);
    render(<MediaTiles hits={[{ ...long, event: { ...long.event, kind: 34235 } }]} />);
    fireEvent.click(screen.getByTestId("media-tile-play"));
    expect(openLightboxMock.mock.lastCall![0][0].loop).toBe(false);
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

describe("MediaTiles — a video's date", () => {
  it("dates a classic Vine by the day it was posted, not the day it was imported", () => {
    render(<MediaTiles hits={[{ event: classicVine(), author: null } as SearchHit]} />);
    const tile = screen.getByTestId(`media-tile-${"7".repeat(64)}`);
    expect(tile).toHaveTextContent("Sep 2014");
    expect(tile).not.toHaveTextContent("1m ago");
  });
});

describe("MediaTiles — the caption", () => {
  const captionOf = (h: SearchHit) => {
    render(<MediaTiles hits={[h]} />);
    return within(screen.getByTestId(`media-tile-${h.event.id}`)).getByTestId("media-tile-caption");
  };

  it("is the title when there is one, not the words under it", () => {
    const h = hit([imeta]);
    h.event.content = "#lake #morning #fog";
    const caption = captionOf(h);
    expect(caption).toHaveTextContent("Morning at the lake");
    expect(caption).not.toHaveTextContent("#lake");
  });

  it("is the words when there is no title", () => {
    const h = hit([imeta]);
    h.event.tags = h.event.tags.filter((t) => t[0] !== "title");
    h.event.content = "Mist over the water";
    expect(captionOf(h)).toHaveTextContent("Mist over the water");
  });
});

// The grid's tiles are all 4:3. Cropped to fill one, an upright video shows its middle third.
describe("MediaTiles — an upright or square video", () => {
  const posterOf = (dim?: string) => {
    render(<MediaTiles hits={[hit([dim ? [...imeta, `dim ${dim}`] : imeta])]} />);
    return screen.getByTestId(`media-tile-${ID}`).querySelector("img")!;
  };

  it("is fitted into the tile whole", () => {
    expect(posterOf("1080x1920").className).toContain("object-contain");
  });

  it("so is a square classic Vine", () => {
    render(<MediaTiles hits={[{ event: classicVine(), author: null } as SearchHit]} />);
    const tile = screen.getByTestId(`media-tile-${"7".repeat(64)}`);
    expect(tile.querySelector("img")!.className).toContain("object-contain");
    // The tile itself keeps the grid's shape.
    expect(within(tile).getByTestId("media-tile-media").className).toContain("aspect-[4/3]");
  });

  it("a wide video, or one that gives no size, fills the tile as before", () => {
    expect(posterOf("1920x1080").className).toContain("object-cover");
    cleanup();
    expect(posterOf().className).toContain("object-cover");
  });

  it("the first frame of a video with no poster is fitted the same way", () => {
    const noPoster = ["imeta", "url https://media.divine.video/b0f9", "m video/mp4", "dim 1080x1920"];
    render(<MediaTiles hits={[hit([noPoster])]} />);
    expect(screen.getByTestId(`media-tile-${ID}`).querySelector("video")!.className).toContain("object-contain");
  });
});
