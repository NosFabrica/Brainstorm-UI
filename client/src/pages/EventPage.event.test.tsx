// @vitest-environment jsdom
/**
 * `/e/A` → `/e/B` is a new page, not the old one with new props: what a reader
 * did on A — revealed a post reported as nudity, opened a folded list — must
 * not carry over to B.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { nip19, type NostrEvent } from "nostr-tools";
import { navigate } from "wouter/use-browser-location";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/hooks/useSpecsForKind", () => ({ useSpecsForKind: () => [] }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import EventPage from "./EventPage";

const NOW = Math.floor(Date.now() / 1000);
const REPORTER = "a".repeat(64);
const ALICE = "b".repeat(64);
const event = (id: string, kind: number, tags: string[][], content: string, pubkey: string): NostrEvent => ({
  id: id.repeat(64),
  kind,
  pubkey,
  created_at: NOW - 60,
  tags,
  content,
  sig: "s".repeat(128),
});

// Seeded unsigned: the page reads what the store holds.
const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});

describe("moving from one event page to another", () => {
  it("a post revealed on one report's page is hidden again on the next", async () => {
    const postA = event("1", 1, [], "first reported words", ALICE);
    const postB = event("2", 1, [], "second reported words", ALICE);
    const reportA = event("3", 1984, [["e", postA.id, "nudity"]], "", REPORTER);
    const reportB = event("4", 1984, [["e", postB.id, "nudity"]], "", REPORTER);
    for (const e of [postA, postB, reportA, reportB]) eventStore.add(e);

    window.history.pushState({}, "", `/e/${nip19.noteEncode(reportA.id)}`);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <EventStoreProvider eventStore={eventStore}>
          <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
            <EventPage />
          </AccountsProvider>
        </EventStoreProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("report-event-reveal"));
    expect(await screen.findByText("first reported words")).toBeInTheDocument();

    act(() => navigate(`/e/${nip19.noteEncode(reportB.id)}`));
    await waitFor(() => expect(screen.queryByText("first reported words")).toBeNull());
    // B's post is behind its own click, not shown because A's was.
    expect(screen.getByTestId("report-event-reveal")).toBeInTheDocument();
    expect(screen.queryByText("second reported words")).toBeNull();
  });
});
