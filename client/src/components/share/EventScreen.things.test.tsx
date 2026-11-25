// @vitest-environment jsdom
/**
 * Every "thing" kind on its own page and quoted in a note: each draws the hero
 * and the card its kind has (a listing, a stream, an app, a repo, a thing page,
 * a list), never the structural fallback that prints its tags, and shows its
 * title and the facts its spec gives it. The pure readers behind the All row
 * and the labels are walked with the same fixtures in lib/thingSurfaces.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import { renderWithProviders } from "@/test/utils";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";
import { THING_KIND_FIXTURES } from "@/test/thingKindFixtures";
import { embedShapeOf } from "@/lib/embedShape";

vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: async () => new Map(),
  fetchEventsByIds: async () => [],
}));
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
vi.mock("@/hooks/useBtcRates", () => ({ useBtcRates: () => null }));
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
import { EmbeddedNoteCard } from "./EmbeddedNoteCard";

beforeEach(() => stubVisibleIntersectionObserver());
afterEach(cleanup);

const page = (event: (typeof THING_KIND_FIXTURES)[number]["event"]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <EventScreen event={event} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

describe.each(THING_KIND_FIXTURES)("$name", ({ event, shows }) => {
  it("has a page of its own: its hero, its title and its facts, never its tags in a table", () => {
    page(event);
    expect(screen.queryByTestId("structural-hero")).toBeNull();
    const text = document.body.textContent ?? "";
    for (const words of shows) expect(text).toContain(words);
  });

  it("is quoted as the card its kind has, with its title", () => {
    renderWithProviders(<EmbeddedNoteCard event={event} author={{ name: "Maker" }} href="/e/x" />);
    // A list of things is quoted by its own list card, a market or ballot in the note card's
    // compact drawing of it; every other kind by its kind card.
    const card =
      embedShapeOf(event) === "item-list"
        ? screen.getByTestId("embedded-list")
        : (screen.queryByTestId("embedded-card") ?? screen.getByTestId("embedded-thing"));
    expect(card).toHaveTextContent(shows[0]);
    expect(screen.queryByTestId("embedded-structural")).toBeNull();
  });
});
