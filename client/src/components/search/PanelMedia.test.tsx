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
