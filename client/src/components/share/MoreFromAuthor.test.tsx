// @vitest-environment jsdom
/**
 * The strip under a post. It asked for the author's notes only, so under a
 * video from a creator who posts only on Divine it was empty. Under a video it
 * is now "More videos": the creator's other videos as tiles. Under anything
 * else it is what it was.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nip19, type NostrEvent } from "nostr-tools";

const recentMock =
  vi.fn<(pubkey: string, kinds: number[], limit: number, opts?: { relayHints?: string[] }) => Promise<NostrEvent[]>>();
const filterMock = vi.fn<(filter: Record<string, unknown>, relays: string[]) => Promise<NostrEvent[]>>();
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchRecentByKinds: (pubkey: string, kinds: number[], limit: number, opts?: { relayHints?: string[] }) =>
    recentMock(pubkey, kinds, limit, opts),
  fetchEventsByFilter: (filter: Record<string, unknown>, relays: string[]) => filterMock(filter, relays),
}));
vi.mock("@/lib/relayRouting", async (orig) => ({
  ...(await orig<typeof import("@/lib/relayRouting")>()),
  outboxRelays: async (_pubkey: string, relays: string[]) => relays,
}));

// The note cards' tier rings ask the API after a 50ms gather window; a slow
// render let that request out mid-test. Rings are not what this strip is about.
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));

import { MoreFromAuthor } from "./MoreFromAuthor";

const HINTS = ["wss://relay.divine.video"];
/** A creator per test: the store and the asks are the app's own, and remember. */
let creator = "";
let n = 0;

const video = (id: string, created_at: number, extra: string[][] = [], kind = 34236): NostrEvent =>
  ({
    id: id.padEnd(64, "0"),
    pubkey: creator,
    kind,
    created_at,
    content: "",
    sig: "",
    tags: [
      ["d", id],
      [
        "imeta",
        `url https://media.example/${id}`,
        "m video/mp4",
        `image https://media.example/${id}.jpg`,
        "dim 1080x1920",
      ],
      ["title", `Video ${id}`],
      ...extra,
    ],
  }) as NostrEvent;

const note = (id: string, created_at: number, content: string): NostrEvent =>
  ({ id: id.padEnd(64, "0"), pubkey: creator, kind: 1, created_at, content, sig: "", tags: [] }) as NostrEvent;

function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("MoreFromAuthor", () => {
  beforeEach(() => {
    creator = (++n).toString(16).padStart(2, "0").repeat(32);
    recentMock.mockReset().mockResolvedValue([]);
    filterMock.mockReset().mockResolvedValue([]);
  });

  describe("under a video", () => {
    it("shows the creator's other videos as tiles, newest first, without the one being watched", async () => {
      const current = video("a1", 3000);
      recentMock.mockResolvedValue([video("a2", 2000), current, video("a3", 4000, [], 22)]);
      mount(
        <MoreFromAuthor
          pubkey={creator}
          authorName="Rabble"
          relayHints={HINTS}
          excludeId={current.id}
          event={current}
        />,
      );
      const strip = await screen.findByTestId("more-videos");
      expect(strip).toHaveTextContent("More videos");
      const tiles = within(strip).getAllByTestId("share-video-tile");
      expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Video a3", "Video a2"]);
      // The video kinds, with the page's relay hints, and never the notes.
      expect(recentMock).toHaveBeenCalledWith(creator, [21, 22, 34235, 34236], expect.any(Number), {
        relayHints: HINTS,
      });
      expect(filterMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("more-from-author")).toBeNull();
    });

    it("leaves out another version of the video being watched", async () => {
      const current = video("a1", 3000);
      // The same address, published again: a new id.
      const again = { ...video("a1", 3500), id: "f".repeat(64) };
      recentMock.mockResolvedValue([again, video("a2", 2000)]);
      mount(
        <MoreFromAuthor
          pubkey={creator}
          authorName="Rabble"
          relayHints={HINTS}
          excludeId={current.id}
          event={current}
        />,
      );
      const strip = await screen.findByTestId("more-videos");
      expect(
        within(strip)
          .getAllByTestId("share-video-tile")
          .map((t) => t.getAttribute("aria-label")),
      ).toEqual(["Video a2"]);
    });

    it("shows four at most", async () => {
      const current = video("a0", 9000);
      recentMock.mockResolvedValue([current, ...[1, 2, 3, 4, 5, 6].map((i) => video(`b${i}`, 1000 * i))]);
      mount(
        <MoreFromAuthor
          pubkey={creator}
          authorName="Rabble"
          relayHints={HINTS}
          excludeId={current.id}
          event={current}
        />,
      );
      const strip = await screen.findByTestId("more-videos");
      expect(within(strip).getAllByTestId("share-video-tile")).toHaveLength(4);
    });

    // A link, not a button: a new tab and "copy link" work, and a screen reader hears where it goes.
    it("each tile is a link to that video's page, by its address", async () => {
      const current = video("a1", 3000);
      recentMock.mockResolvedValue([current, video("a2", 2000)]);
      mount(
        <MoreFromAuthor
          pubkey={creator}
          authorName="Rabble"
          relayHints={HINTS}
          excludeId={current.id}
          event={current}
        />,
      );
      const tile = await screen.findByRole("link", { name: "Video a2" });
      expect(tile).toBe(screen.getByTestId("share-video-tile"));
      const path = tile.getAttribute("href")!;
      expect(path).toMatch(/^\/e\/naddr1/);
      expect(nip19.decode(path.slice(3)).data).toMatchObject({
        kind: 34236,
        pubkey: creator,
        identifier: "a2",
        relays: HINTS,
      });
    });

    it("shows a video marked sensitive as the placeholder tile", async () => {
      const current = video("a1", 3000);
      recentMock.mockResolvedValue([current, video("a2", 2000, [["content-warning", "nudity"]])]);
      mount(
        <MoreFromAuthor
          pubkey={creator}
          authorName="Rabble"
          relayHints={HINTS}
          excludeId={current.id}
          event={current}
        />,
      );
      const tile = await screen.findByTestId("share-video-tile");
      expect(within(tile).getByTestId("sensitive-tile")).toBeInTheDocument();
      expect(tile.querySelector("img, video")).toBeNull();
    });

    it("shows nothing when the creator has no other video", async () => {
      const current = video("a1", 3000);
      recentMock.mockResolvedValue([current]);
      mount(
        <MoreFromAuthor
          pubkey={creator}
          authorName="Rabble"
          relayHints={HINTS}
          excludeId={current.id}
          event={current}
        />,
      );
      await waitFor(() => expect(recentMock).toHaveBeenCalled());
      expect(screen.queryByTestId("more-videos")).toBeNull();
      expect(screen.queryByTestId("more-from-author")).toBeNull();
    });
  });

  describe("under anything else", () => {
    it("is the author's other notes, asked as before", async () => {
      const current = note("c1", 3000, "The note being read, long enough to be told apart.");
      filterMock.mockResolvedValue([
        current,
        note("c2", 2000, "An older note of theirs."),
        note("c3", 4000, "A newer note of theirs."),
      ]);
      mount(
        <MoreFromAuthor
          pubkey={creator}
          authorName="Rabble"
          relayHints={HINTS}
          excludeId={current.id}
          excludeContent={current.content}
          event={current}
        />,
      );
      const strip = await screen.findByTestId("more-from-author");
      expect(strip).toHaveTextContent("More from Rabble");
      expect(strip).toHaveTextContent("A newer note of theirs.");
      expect(strip).toHaveTextContent("An older note of theirs.");
      expect(strip).not.toHaveTextContent("The note being read");
      expect(filterMock).toHaveBeenCalledWith({ authors: [creator], kinds: [1], limit: 12 }, expect.any(Array));
      expect(screen.queryByTestId("more-videos")).toBeNull();
      expect(recentMock).not.toHaveBeenCalled();
    });

    it("is the notes when the page does not say which event it is (an article)", async () => {
      filterMock.mockResolvedValue([
        note("d1", 2000, "A note of theirs."),
        note("d2", 2500, "Another note of theirs."),
      ]);
      mount(<MoreFromAuthor pubkey={creator} authorName="Rabble" relayHints={HINTS} />);
      expect(await screen.findByTestId("more-from-author")).toHaveTextContent("Another note of theirs.");
      expect(recentMock).not.toHaveBeenCalled();
    });
  });
});
