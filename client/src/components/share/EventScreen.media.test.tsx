// @vitest-environment jsdom
/**
 * A post's files on its page: each drawn once, where its words name it or
 * below them when they never do; and a post its creator marked sensitive
 * (NIP-36) is asked for once, whichever part of the page holds its media.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/ThreadAncestors", () => ({ ThreadAncestors: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import { EventScreen } from "./EventScreen";

const NOW = Math.floor(Date.now() / 1000);
let n = 0;
const eventOf = (kind: number, tags: string[][], content: string): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "3"),
  kind,
  pubkey: "9".repeat(64),
  created_at: NOW - 3600,
  content,
  tags,
});
const open = (event: MinimalEvent) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <EventScreen event={event} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );
const srcs = () => Array.from(document.querySelectorAll("img, video")).map((i) => i.getAttribute("src") ?? "");
const A = "https://blossom.example/" + "a".repeat(64);
const B = "https://blossom.example/" + "b".repeat(64);

describe("a post's files on its page", () => {
  // Audit: an extensionless Blossom picture the text names was neither drawn below
  // (the text names it) nor in the text (no extension): a link chip.
  for (const kind of [1, 1111, 11])
    it(`kind ${kind}: two extensionless pictures named in its words are each drawn once`, () => {
      open(
        eventOf(
          kind,
          [
            ["imeta", `url ${A}`, "m image/jpeg"],
            ["imeta", `url ${B}`, "m image/jpeg"],
          ],
          `look ${A} and ${B}`,
        ),
      );
      expect(srcs().filter((s) => s.includes("aaaa"))).toHaveLength(1);
      expect(srcs().filter((s) => s.includes("bbbb"))).toHaveLength(1);
    });

  it("a web page in a note's url tag is no picture", () => {
    open(eventOf(1, [["url", "https://news.example/article"]], "read this"));
    expect(srcs().filter((s) => s.includes("news.example"))).toEqual([]);
  });
});

describe("a sensitive post is asked for once", () => {
  // Audit: a flagged note drew one cover over its words' picture and another over its
  // imeta-only files; a voice clip got a 16:9 "Show media" box.
  it("its words' picture and an imeta-only sound: one cover, the sound plays without a box", () => {
    open(
      eventOf(
        1,
        [
          ["content-warning", "nsfw"],
          ["imeta", "url https://x.test/clip.mp3", "m audio/mpeg"],
        ],
        "look https://x.test/p.jpg",
      ),
    );
    expect(screen.getAllByTestId("sensitive-cover")).toHaveLength(1);
    expect(screen.getAllByTestId("sensitive-show")).toHaveLength(1);
    expect(screen.getByTestId("event-media-audio")).toBeInTheDocument();
  });

  it("its words' picture and an imeta-only picture: one cover, and one ask shows both", () => {
    open(
      eventOf(
        1,
        [
          ["content-warning", "nsfw"],
          ["imeta", "url https://x.test/only-imeta.jpg", "m image/jpeg"],
        ],
        "look https://x.test/p.jpg",
      ),
    );
    expect(screen.getAllByTestId("sensitive-show")).toHaveLength(1);
    expect(srcs().filter((s) => s.includes("x.test"))).toEqual([]);
    fireEvent.click(screen.getByTestId("sensitive-show"));
    expect(screen.queryByTestId("sensitive-cover")).toBeNull();
    expect(srcs().filter((s) => s.includes("only-imeta"))).toHaveLength(1);
    expect(srcs().filter((s) => s.includes("p.jpg"))).toHaveLength(1);
  });

  it("words with no media and an imeta-only picture: the files' cover asks", () => {
    open(
      eventOf(
        1,
        [
          ["content-warning", "nsfw"],
          ["imeta", "url https://x.test/only-imeta.jpg", "m image/jpeg"],
        ],
        "just words",
      ),
    );
    expect(screen.getAllByTestId("sensitive-show")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("sensitive-show"));
    expect(srcs().filter((s) => s.includes("only-imeta"))).toHaveLength(1);
  });

  it("a picture post with a clip in its words: the pictures' cover asks for both", () => {
    open(
      eventOf(
        20,
        [
          ["content-warning", "nsfw"],
          ["imeta", "url https://x.test/pic.jpg", "m image/jpeg"],
        ],
        "a caption https://youtu.be/9bZkp7q19f0",
      ),
    );
    // The picture post's cover leads; the clip in its words waits under a tile.
    expect(screen.getAllByTestId("sensitive-show")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("sensitive-show"));
    expect(screen.queryByTestId("sensitive-show")).toBeNull();
  });
});
