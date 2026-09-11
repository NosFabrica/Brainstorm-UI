// @vitest-environment jsdom
/**
 * Comments on a listing live where the marketplace app published them — the
 * profile relays hold none, the search relay indexes them all. The thread
 * asks both and shows one merged conversation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NostrEvent } from "nostr-tools";

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "unknown" }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ hasMywot: false }) }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => ({ isSearchObserver: false }) }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["house", () => {}] }));
vi.mock("@/services/trustAnchor", () => ({ triggerScoringAndAnchor: vi.fn() }));
// Nested cards ask the API for signals, overviews and influence; none of it
// matters here, so every method answers with nothing.
vi.mock("@/services/api", () => ({
  apiClient: new Proxy({}, { get: () => async () => null }),
}));
const byFilterMock = vi.fn<(f: Record<string, unknown>) => Promise<NostrEvent[]>>(async () => []);
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: (f: Record<string, unknown>) => byFilterMock(f),
  fetchProfileMap: async () => new Map(),
}));
const indexedMock = vi.fn<(address: string | null, eventId: string) => Promise<NostrEvent[]>>(async () => []);
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchCommentsByAddress: (address: string | null, eventId: string) => indexedMock(address, eventId),
}));

import { EventThread } from "./EventThread";

const ROOT = "e".repeat(64);
const SELLER = "b".repeat(64);
const COORD = `30402:${SELLER}:obscura-vpn`;
const comment = (id: string, text: string): NostrEvent =>
  ({ id: id.padEnd(64, "0"), kind: 1111, pubkey: "c".repeat(64), created_at: 1_700_000_000, content: text, sig: "", tags: [["A", COORD], ["K", "30402"], ["P", SELLER]] }) as NostrEvent;

describe("EventThread", () => {
  beforeEach(() => {
    byFilterMock.mockReset();
    byFilterMock.mockResolvedValue([]);
    indexedMock.mockReset();
  });

  it("shows a listing's comments from the search relay even when the profile relays have none", async () => {
    indexedMock.mockResolvedValue([comment("q1", "Does it ship to Italy?"), comment("q2", "Great private alternative.")]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EventThread eventId={ROOT} addressCoord={COORD} authorNpub="npub1seller" relayHints={[]} />
      </QueryClientProvider>,
    );
    const thread = await screen.findByTestId("event-thread");
    expect(thread).toHaveTextContent("Comments (2)");
    expect(thread).toHaveTextContent("Does it ship to Italy?");
    expect(thread).toHaveTextContent("Great private alternative.");
    expect(indexedMock).toHaveBeenCalledWith(COORD, ROOT);
  });
});
