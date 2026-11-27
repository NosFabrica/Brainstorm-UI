// @vitest-environment jsdom
/**
 * Every kind the kind-surfaces work covers (test/kindFixtures), through every
 * surface that draws an event: the full page (EventScreen's hero chain), a
 * quote (EmbeddedNoteCard), a top-page row (SerpRow), the All tab's row
 * (AllResultRow over lib/resultSummary) and its name (lib/kindLabel). None
 * falls to the generic fallback — the structural tag table, a quote of bare
 * words, a "Kind N" label — and each shows what its spec puts in its tags.
 * The search grid's check is in SearchResults.test.tsx, over the same fixtures.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import type { ReactElement } from "react";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";
import { KIND_FIXTURES } from "@/test/kindFixtures";

vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
}));
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchRepoCounts: async () => ({ issues: 0, patches: 0, contributors: [], lastAt: null }),
  fetchEventRsvps: async () => new Map(),
  fetchFromSearch: async () => [],
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/hooks/useSpecsForKind", () => ({ useSpecsForKind: () => [] }));
vi.mock("@/hooks/useLinkMetadata", () => ({ useLinkMetadata: () => null }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));
vi.mock("@/components/share/LinkPreview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/share/LinkPreview")>()),
  LinkPreviewCard: () => null,
}));

import { EventScreen } from "./EventScreen";
import { EmbeddedNoteCard } from "./EmbeddedNoteCard";
import { SerpRow } from "@/components/search/SerpRow";
import { AllResultRow } from "@/components/search/AllResultRow";
import { kindLabel } from "@/lib/kindLabel";
import { summaryOf } from "@/lib/resultSummary";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});

const draw = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>{ui}</AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

const author = { pubkey: "a".repeat(64), npub: "npub1test", name: "Maker" };
const flat = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ");

describe.each(KIND_FIXTURES)("$name on every surface", (fx) => {
  it("the full page draws its own hero, not the tag table", () => {
    draw(<EventScreen event={fx.event as unknown as MinimalEvent} />);
    expect(screen.getByTestId(fx.hero)).toBeInTheDocument();
    expect(screen.queryByTestId("structural-hero")).toBeNull();
  });

  it("a quote draws its card", () => {
    draw(<EmbeddedNoteCard event={fx.event as unknown as MinimalEvent} author={{ name: "Maker" }} href="/e/x" />);
    if (fx.shape === "note") {
      // A comment kind: its words, its kind named — what a quoted comment is.
      expect(flat(screen.getByTestId("embedded-note"))).toMatch(fx.cardText);
      return;
    }
    const card = fx.shape === "item-list" ? screen.getByTestId("embedded-list") : screen.getByTestId("embedded-card");
    if (fx.shape !== "item-list") expect(card).toHaveAttribute("data-shape", fx.shape);
    expect(flat(card)).toMatch(fx.cardText);
  });

  it("a top-page row draws its card, not a row of its raw content", () => {
    const { container } = draw(<SerpRow event={fx.event} author={author} query="" />);
    expect(flat(container)).toMatch(fx.cardText);
    // The generic row says JSON content is "Structured data": none of these is.
    expect(flat(container)).not.toMatch(/Structured data/);
  });

  it("the All tab's row says what it is, and its label is the kind's name", () => {
    expect(summaryOf(fx.event)).toBeTruthy();
    const { container } = draw(<AllResultRow event={fx.event} author={author} query="" />);
    expect(flat(container)).toMatch(fx.rowText);
    expect(kindLabel(fx.event)).toBe(fx.label);
  });
});
