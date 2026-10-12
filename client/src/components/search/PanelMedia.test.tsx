// @vitest-environment jsdom
/**
 * A person's latest media in their panel. A video its creator marked
 * sensitive keeps its row, with a placeholder where the poster would be, and
 * its play button opens the full view covered.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchResult } from "@/lib/profileSearch";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => openLightboxMock }));

import { PanelLatestMedia, latestVideos } from "./PanelMedia";

const person = { pubkey: "9".repeat(64), npub: "npub1maker", name: "Maker" } as SearchResult;
const short = (id: string, tags: string[][] = []): NostrEvent =>
  ({
    id,
    kind: 34236,
    pubkey: person.pubkey,
    created_at: 1_790_000_000,
    sig: "s",
    content: "Morning at the lake",
    tags: [
      ["d", id],
      ["imeta", `url https://media.divine.video/${id}`, "m video/mp4", `image https://media.divine.video/${id}.jpg`],
      ...tags,
    ],
  }) as NostrEvent;

describe("PanelLatestMedia — a video marked sensitive", () => {
  it("reads the warning with the video", () => {
    const [flagged, plain] = latestVideos([short("a1", [["content-warning", "nudity"]]), short("b2")]);
    expect(flagged.warning).toEqual({ reason: "nudity" });
    expect(plain.warning).toBeNull();
  });

  it("shows a placeholder for it and the poster for the rest; play opens the full view covered", () => {
    render(<PanelLatestMedia person={person} events={[short("a1", [["content-warning", "nudity"]]), short("b2")]} />);
    const flagged = screen.getByTestId("person-media-item-a1");
    expect(within(flagged).getByTestId("sensitive-tile")).toBeInTheDocument();
    expect(flagged.querySelector("img, video")).toBeNull();
    const plain = screen.getByTestId("person-media-item-b2");
    expect(within(plain).queryByTestId("sensitive-tile")).toBeNull();
    expect(plain.querySelector("img")?.getAttribute("src")).toBe("https://media.divine.video/b2.jpg");

    expect(within(plain).getByRole("button").getAttribute("aria-label")).toBe("Play Morning at the lake");
    expect(within(flagged).getByRole("button").getAttribute("aria-label")).toBe("Sensitive video: Morning at the lake");
    fireEvent.click(within(flagged).getByRole("button"));
    expect(openLightboxMock).toHaveBeenLastCalledWith(
      [
        {
          url: "https://media.divine.video/a1",
          kind: "video",
          poster: "https://media.divine.video/a1.jpg",
          warning: { reason: "nudity" },
        },
      ],
      0,
      expect.anything(),
    );
  });
});
// A restored Vine is signed the day it was imported; `published_at` is the day it was posted.
const classicVine = (): NostrEvent =>
  ({
    id: "7".repeat(64),
    kind: 34236,
    pubkey: person.pubkey,
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

describe("PanelLatestMedia — a video's date", () => {
  it("dates a classic Vine by the day it was posted, not the day it was imported", () => {
    expect(latestVideos([classicVine()])[0].at).toBe(1_410_674_550);
    render(<PanelLatestMedia person={person} events={[classicVine()]} />);
    const row = screen.getByTestId(`person-media-item-${"7".repeat(64)}`);
    const years = new Date().getFullYear() - 2014;
    expect(row.textContent).toMatch(new RegExp(`(${years}|${years - 1})y ago`));
    expect(row).not.toHaveTextContent("1m ago");
  });

  it("orders by the day posted: a Vine imported today sits under last week's video", () => {
    const lastWeek = short("b2");
    lastWeek.created_at = Math.floor(Date.now() / 1000) - 7 * 86_400;
    render(<PanelLatestMedia person={person} events={[classicVine(), lastWeek]} />);
    const rows = screen.getAllByTestId(/^person-media-item-/).map((el) => el.getAttribute("data-testid"));
    expect(rows).toEqual(["person-media-item-b2", `person-media-item-${"7".repeat(64)}`]);
  });
});
