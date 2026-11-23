// @vitest-environment jsdom
/**
 * Each batch of commenters' scores re-renders the thread; only the rows whose
 * commenter was just scored draw again.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const thread = vi.hoisted(() => ({ events: [] as unknown[], renders: new Map<string, number>() }));
const PROFILES = new Map();

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "unknown" }));
vi.mock("@/hooks/useCanSearchMywot", () => ({ useCanSearchMywot: () => ({ canUseMywot: false }) }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["house", () => {}] }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => PROFILES }));
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null) =>
    key?.startsWith("thread-replies") ? { events: thread.events, loading: false } : { events: [], loading: false },
}));
vi.mock("@/services/trustAnchor", () => ({ triggerScoringAndAnchor: vi.fn() }));
vi.mock("@/services/trustSignals", () => ({
  lookupTrustSignals: async (pk: string) => ({ influence: pk.startsWith("a") ? 0.9 : 0.4 }),
}));
vi.mock("@/components/share/EmbeddedNoteCard", () => ({
  EmbeddedNoteCard: ({ event, trustScore01 }: { event: { id: string }; trustScore01?: number | null }) => {
    thread.renders.set(event.id, (thread.renders.get(event.id) ?? 0) + 1);
    return <p data-testid={`card-${event.id}`}>{String(trustScore01)}</p>;
  },
}));

import { EventThread } from "./EventThread";

const ROOT = "e".repeat(64);
const reply = (id: string, pubkey: string, at: number) => ({
  id,
  kind: 1,
  pubkey,
  created_at: at,
  content: id,
  tags: [["e", ROOT]],
});

describe("EventThread's comment rows", () => {
  it("re-renders only the row whose commenter was just scored", async () => {
    thread.events = [reply("r1", "a".repeat(64), 1)];
    const view = render(<EventThread eventId={ROOT} authorNpub="npub1x" relayHints={[]} />);
    await waitFor(() => expect(screen.getByTestId("card-r1")).toHaveTextContent("0.9"));
    const first = thread.renders.get("r1");

    thread.events = [...thread.events, reply("r2", "b".repeat(64), 2)];
    await act(async () => view.rerender(<EventThread eventId={ROOT} authorNpub="npub1x" relayHints={[]} />));
    await waitFor(() => expect(screen.getByTestId("card-r2")).toHaveTextContent("0.4"));
    expect(thread.renders.get("r1")).toBe(first);
  });
});
