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
// matters here, so every method answers with nothing — the trust-signal batch
// with an empty map, as the API answers for nobody it knows (a null crashed its
// flush whenever the batch window closed before the test ended).
vi.mock("@/services/api", () => ({
  apiClient: new Proxy({}, { get: (_target, name) => async () => (name === "getTrustSignals" ? new Map() : null) }),
}));
const byFilterMock = vi.fn<(f: Record<string, unknown>) => Promise<NostrEvent[]>>(async () => []);
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByFilter: (f: Record<string, unknown>) => byFilterMock(f),
  fetchFromSearchRelayByFilters: (fs: Record<string, unknown>[]) => searchMock(fs),
  fetchProfileMap: async () => new Map(),
}));
const searchMock = vi.fn<(fs: Record<string, unknown>[]) => Promise<NostrEvent[]>>(async () => []);
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
  ({
    id: id.padEnd(64, "0"),
    kind: 1111,
    pubkey: "c".repeat(64),
    created_at: 1_700_000_000,
    content: text,
    sig: "",
    tags: [
      ["A", COORD],
      ["K", "30402"],
      ["P", SELLER],
    ],
  }) as NostrEvent;

describe("EventThread", () => {
  beforeEach(() => {
    byFilterMock.mockReset();
    byFilterMock.mockResolvedValue([]);
    indexedMock.mockReset();
    searchMock.mockReset();
    searchMock.mockResolvedValue([]);
  });

  it("shows a listing's comments from the search relay even when the profile relays have none", async () => {
    indexedMock.mockResolvedValue([
      comment("q1", "Does it ship to Italy?"),
      comment("q2", "Great private alternative."),
    ]);
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

  it("shows voice replies (1244) under a voice message", async () => {
    const VOICE = "f".repeat(64);
    const reply = {
      id: "v1".padEnd(64, "0"),
      kind: 1244,
      pubkey: "c".repeat(64),
      created_at: 1_700_000_000,
      content: "https://blossom.example/reply.webm",
      sig: "",
      tags: [
        ["E", VOICE],
        ["K", "1222"],
        ["e", VOICE],
        ["k", "1222"],
      ],
    } as NostrEvent;
    byFilterMock.mockImplementation(async (f) => {
      const kinds = (f.kinds as number[] | undefined) ?? [];
      return kinds.includes(1244) ? [reply] : [];
    });
    indexedMock.mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EventThread eventId={VOICE} authorNpub="npub1voice" relayHints={[]} />
      </QueryClientProvider>,
    );
    const thread = await screen.findByTestId("event-thread");
    expect(thread).toHaveTextContent(/\(1\)/);
  });

  it("on a book, shows the comments left on its chapters, each saying which", async () => {
    const BOOK = `30040:${SELLER}:constitution`;
    const SECTION = `30041:${SELLER}:constitution-article-four-section-3`;
    const onSection = {
      ...comment("s1", "Territories clause, still argued about."),
      tags: [
        ["A", SECTION],
        ["a", SECTION],
        ["K", "30041"],
      ],
    } as NostrEvent;
    const onBook = { ...comment("b1", "A beautiful edition."), tags: [["A", BOOK]] } as NostrEvent;
    indexedMock.mockResolvedValue([onBook]);
    searchMock.mockImplementation(async (fs) =>
      fs.some((f) => (f["#A"] as string[] | undefined)?.includes(SECTION)) ? [onSection] : [],
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EventThread
          eventId={ROOT}
          addressCoord={BOOK}
          authorNpub="npub1author"
          relayHints={[]}
          scope={new Map([[SECTION, "Section 3"]])}
        />
      </QueryClientProvider>,
    );
    const thread = await screen.findByTestId("event-thread");
    await screen.findByText("Territories clause, still argued about.");
    expect(thread).toHaveTextContent("Comments (2)");
    // Only the chapter's comment says where it was left; the book's own needs no label.
    const labels = screen.getAllByTestId("thread-comment-on");
    expect(labels).toHaveLength(1);
    expect(labels[0]).toHaveTextContent("on Section 3");
  });
});
