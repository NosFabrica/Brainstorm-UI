// @vitest-environment jsdom
/**
 * The event page, for the two things it decides before the video hero draws:
 * a video whose NIP-40 `expiration` has passed is gone, said the way a deleted
 * post is; and a video is dated by when it was published, since a restored
 * Vine's `created_at` is the day it was imported.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
// Author scores are batched on a timer (services/trustSignals): answered here, so a late
// flush after a test has ended finds an API to ask.
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
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
// Noon UTC on 13 May 2014: the same day in every time zone a test runs in.
const VINE_DAY = 1_399_982_400;
const dateOf = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const vine = (tags: string[][] = []): MinimalEvent => ({
  id: "1".repeat(64),
  kind: 34236,
  pubkey: "9".repeat(64),
  created_at: NOW - 3600,
  content: "",
  tags: [
    ["d", "iq3bXYa5duP"],
    ["imeta", "url https://media.divine.video/vine1", "m video/mp4", "dim 480x480"],
    ["title", "So cute"],
    ["published_at", String(VINE_DAY)],
    ...tags,
  ],
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

describe("the event page — an expired video", () => {
  it("says the post has expired, in place of the event", () => {
    open(vine([["expiration", String(NOW - 60)]]));
    expect(screen.getByTestId("event-expired")).toHaveTextContent("This post has expired.");
    expect(screen.queryByTestId("video-hero")).toBeNull();
    expect(screen.queryByTestId("event-note")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });

  // Only video kinds for now: expiration on every other kind is its own change.
  it("leaves a note with a past expiration as it was", () => {
    open({ ...vine(), kind: 1, content: "Flash sale until noon", tags: [["expiration", String(NOW - 60)]] });
    expect(screen.queryByTestId("event-expired")).toBeNull();
    expect(screen.getByTestId("event-note")).toHaveTextContent("Flash sale until noon");
  });

  it("covers every video kind", () => {
    for (const kind of [21, 22, 34235]) {
      const { unmount } = open({ ...vine([["expiration", String(NOW - 60)]]), kind });
      expect(screen.getByTestId("event-expired")).toBeInTheDocument();
      unmount();
    }
  });

  it("shows an event whose expiration is still ahead, or is not a time", () => {
    const { unmount } = open(vine([["expiration", String(NOW + 3600)]]));
    expect(screen.queryByTestId("event-expired")).toBeNull();
    expect(screen.getByTestId("video-hero")).toBeInTheDocument();
    unmount();
    open(vine([["expiration", "soon"]]));
    expect(screen.queryByTestId("event-expired")).toBeNull();
    expect(screen.getByTestId("video-hero")).toBeInTheDocument();
  });
});

describe("the event page — a video's date", () => {
  it("is when it was published: a Vine imported today still reads 2014", () => {
    open(vine());
    const byline = screen.getByTestId("event-date");
    expect(byline).toHaveTextContent(dateOf(VINE_DAY));
    expect(byline).toHaveTextContent("2014");
  });

  it("is created_at for every other kind, whatever its published_at says", () => {
    open({ ...vine(), kind: 1, content: "hello", tags: [["published_at", String(VINE_DAY)]] });
    expect(screen.getByTestId("event-date")).toHaveTextContent(dateOf(NOW - 3600));
  });
});
