// @vitest-environment jsdom
/**
 * The Videos block on a person's public page. "View all" used to open the
 * Media tab scoped to the person, which mixed their photos in. It now opens
 * that tab with its Videos chip chosen (`kind:video`, lib/mediaFacet), so the
 * page asks for videos and its lead group keeps to them.
 * A tap plays the video in full view: a short loops there, and the way to its
 * page is by address when the video has one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import type { MinimalEvent } from "@/lib/noteRefs";
import { mediaFacetOf } from "@/lib/mediaFacet";
import { liftQuery } from "@/lib/searchSyntax";

const openLightbox = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => openLightbox }));

import { videoItemOf, type VideoItem } from "./VideoGrid";
import { VideosBlock } from "./VideosBlock";

const CREATOR = "9".repeat(64);
const NPUB = nip19.npubEncode(CREATOR);

const video = (n: number, kind: number, extra: string[][] = []): MinimalEvent => ({
  id: String(n).repeat(64),
  pubkey: CREATOR,
  kind,
  created_at: 1_760_000_000,
  content: "",
  tags: [
    ["d", `v${n}`],
    ["imeta", `url https://media.example/v${n}`, "m video/mp4", `image https://media.example/v${n}.jpg`],
    ["title", `Video ${n}`],
    ...extra,
  ],
});

const mount = (events: MinimalEvent[]) =>
  render(
    <VideosBlock
      pubkey={CREATOR}
      videos={events.map(videoItemOf).filter((v): v is VideoItem => v !== null)}
      author={{ name: "Rabble", npub: NPUB, picture: null }}
      relayHints={["wss://relay.divine.video"]}
    />,
  );

describe("VideosBlock", () => {
  beforeEach(() => openLightbox.mockReset());

  it("“View all” opens the Media tab on this person with its Videos chip chosen", () => {
    mount([video(1, 34236)]);
    const href = screen.getByTestId("block-view-all").getAttribute("href")!;
    const params = new URL(href, "https://brainstorm.world").searchParams;
    expect(params.get("t")).toBe("media");
    expect(params.get("q")).toBe(`from:${NPUB} kind:video`);
    // The Media tab reads it as its Videos chip, and the search as one author and the four video kinds.
    expect(mediaFacetOf(params.get("q")!)).toBe("videos");
    expect(liftQuery(params.get("q")!)).toEqual({ search: "", authors: [CREATOR], kinds: [21, 22, 34235, 34236] });
  });

  it("is the block the page had: its title, its test id, a tile per video", () => {
    mount([video(1, 34236), video(2, 34236)]);
    const block = screen.getByTestId("share-block-videos");
    expect(block).toHaveTextContent("Videos");
    expect(screen.getAllByTestId("share-video-tile")).toHaveLength(2);
  });

  it("a tap plays the video in full view: a short loops, a full-length video does not", () => {
    mount([video(1, 34236), video(2, 21), video(3, 22, [["content-warning", "nudity"]])]);
    fireEvent.click(screen.getAllByTestId("share-video-tile")[1]);
    expect(openLightbox).toHaveBeenCalledTimes(1);
    const [items, index, context] = openLightbox.mock.calls[0];
    expect(index).toBe(1);
    expect(items).toEqual([
      {
        url: "https://media.example/v1",
        kind: "video",
        poster: "https://media.example/v1.jpg",
        warning: null,
        loop: true,
      },
      {
        url: "https://media.example/v2",
        kind: "video",
        poster: "https://media.example/v2.jpg",
        warning: null,
        loop: false,
      },
      // Still covered in full view: the warning rides along.
      {
        url: "https://media.example/v3",
        kind: "video",
        poster: "https://media.example/v3.jpg",
        warning: { reason: "nudity" },
        loop: true,
      },
    ]);
    expect(context.author).toEqual({ name: "Rabble", npub: NPUB, picture: null });
    // Kind 21 has no address: its page is linked by id.
    expect(context.postHref).toMatch(/^\/e\/nevent1/);
  });

  it("the way to an addressable video's page is its address, with the relay hint", () => {
    mount([video(1, 34236)]);
    fireEvent.click(screen.getByTestId("share-video-tile"));
    const { postHref } = openLightbox.mock.calls[0][2];
    expect(postHref).toMatch(/^\/e\/naddr1/);
    expect(nip19.decode(postHref.slice(3)).data).toMatchObject({
      kind: 34236,
      pubkey: CREATOR,
      identifier: "v1",
      relays: ["wss://relay.divine.video"],
    });
  });

  it("shows nothing when hidden, or when there are no videos", () => {
    const { unmount } = mount([]);
    expect(screen.queryByTestId("share-block-videos")).toBeNull();
    unmount();
    render(
      <VideosBlock
        pubkey={CREATOR}
        videos={[videoItemOf(video(1, 34236))!]}
        author={{ name: "Rabble", npub: NPUB }}
        relayHints={[]}
        hidden
      />,
    );
    expect(screen.queryByTestId("share-block-videos")).toBeNull();
  });
});
