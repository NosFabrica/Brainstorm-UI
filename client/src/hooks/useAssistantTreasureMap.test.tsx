// @vitest-environment jsdom
/**
 * The Assistant's Treasure Map as Account Setup reads it: the server's check
 * (docs/assistant/TREASURE-MAP-ASK.md), a 404 as "no such step here", the
 * version found on relays against what it should list, and a press whose
 * signed version joins the store only when it verifies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

const sk = generateSecretKey();
const ASSISTANT = getPublicKey(sk);
const SCORES = "wss://scores.example/";
const SHOULD = [
  ["30382:rank", SCORES],
  ["30382:followers", SCORES],
];
const signedMap = (entries: string[][]) =>
  finalizeEvent(
    { kind: 10040, created_at: 1_790_000_000, content: "", tags: entries.map(([k, r]) => [k, ASSISTANT, r]) },
    sk,
  );

const h = vi.hoisted(() => ({
  getAssistantTreasureMap: vi.fn(),
  setAssistantTreasureMap: vi.fn(),
  reach: vi.fn(),
  stored: undefined as unknown,
  added: [] as unknown[],
}));
vi.mock("@/services/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiClient: {
    getAssistantTreasureMap: h.getAssistantTreasureMap,
    setAssistantTreasureMap: h.setAssistantTreasureMap,
  },
}));
vi.mock("@/hooks/useStoreReplaceable", () => ({
  useStoreReplaceable: (_kind: number, pubkey: string | null) => ({
    event: pubkey ? h.stored : undefined,
    loading: false,
    settled: !!pubkey,
  }),
}));
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: vi.fn(async () => []),
  getNip85RelayUrl: () => "wss://scores.example",
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: (ev: unknown) => h.added.push(ev) } }));
vi.mock("@/lib/relayRequest", () => ({ requestNewestWithReach: h.reach }));

import { parseTreasureMapCheck } from "@/lib/assistantTreasureMap";
import { TreasureMapUnavailableError } from "@/services/api";
import { useAssistantTreasureMap } from "./useAssistantTreasureMap";

const HINT = "wss://hint.example/";
const check = (on: boolean, relays = [SCORES]) =>
  parseTreasureMapCheck({ assistant: ASSISTANT, on, duties: [], shouldSay: SHOULD, relays });
/** Each relay asked answers, holding `newest` (none by default). */
const answer = (newest?: unknown, answered = true) =>
  h.reach.mockImplementation(async (relays: string[]) => ({
    newest,
    reach: { asked: relays, answered: answered ? relays : [] },
  }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const mount = () => renderHook(() => useAssistantTreasureMap("a".repeat(64)), { wrapper });

beforeEach(() => {
  vi.clearAllMocks();
  h.stored = undefined;
  h.added = [];
  h.getAssistantTreasureMap.mockResolvedValue(check(false));
  answer();
});

describe("useAssistantTreasureMap", () => {
  it("a server without the route isn't supported: no step", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new TreasureMapUnavailableError());
    const { result } = mount();
    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBeNull();
  });

  it("another failure is an error, and not a verdict either way", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new Error("boom"));
    const { result } = mount();
    // Retried once (only "no route" isn't), so the answer takes a moment.
    await waitFor(() => expect(result.current.error?.message).toBe("boom"), { timeout: 3000 });
    expect(result.current.supported).toBeUndefined();
  });

  it("with nothing published, it's missing", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(result.current.on).toBe(false);
    expect(result.current.shouldSay.map((e) => e.key)).toEqual(["30382:rank", "30382:followers"]);
    expect(result.current.status).toBe("missing");
  });

  it("a version listing exactly the live duties is current; one listing fewer is out of date", async () => {
    h.stored = signedMap(SHOULD);
    const current = mount();
    await waitFor(() => expect(current.result.current.status).toBe("current"));
    expect(current.result.current.found).toHaveLength(2);
    h.stored = signedMap(SHOULD.slice(0, 1));
    const stale = mount();
    await waitFor(() => expect(stale.result.current.status).toBe("out-of-date"));
  });

  it("a press sends the choice, adds the signed version only when it verifies, and asks again", async () => {
    const event = signedMap(SHOULD);
    h.setAssistantTreasureMap.mockResolvedValue({
      on: true,
      published: true,
      event,
      relays: [{ url: SCORES, ok: true }],
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.supported).toBe(true));
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    await act(async () => {
      await result.current.set(true);
    });
    expect(h.setAssistantTreasureMap).toHaveBeenCalledWith(true);
    expect(h.added).toEqual([event]);
    await waitFor(() => expect(result.current.on).toBe(true));

    // Through JSON, as a server's answer arrives: no cached "verified" mark from signing it here.
    const forged = JSON.parse(JSON.stringify({ ...event, sig: "0".repeat(128) }));
    h.setAssistantTreasureMap.mockResolvedValue({ on: true, published: true, event: forged, relays: [] });
    await act(async () => {
      await result.current.set(true);
    });
    expect(h.added).toHaveLength(1);
  });

  it("asks the relays a press reads for the newest version: one that answers without it missed it", async () => {
    const event = signedMap(SHOULD);
    h.stored = event;
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES, HINT]));
    const { result } = mount();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    // The hint is never asked: a press never sends there.
    expect(h.reach.mock.calls.map((call) => call[0])).toEqual([[SCORES]]);
    expect(h.reach).toHaveBeenCalledWith([SCORES], { ids: [event.id] }, expect.any(Number));
  });

  it("leaves alone a relay that doesn't answer, as the press does", async () => {
    h.stored = signedMap(SHOULD);
    answer(undefined, false);
    const { result } = mount();
    await waitFor(() => expect(h.reach).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.missed).toEqual([]);
  });

  it("asks nothing while no version is found", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(h.reach).not.toHaveBeenCalled();
    expect(result.current.missed).toEqual([]);
  });

  it("asks again after a press: a repair sends the version already found", async () => {
    const event = signedMap(SHOULD);
    h.stored = event;
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = mount();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    h.setAssistantTreasureMap.mockResolvedValue({
      on: true,
      published: true,
      event,
      relays: [{ url: SCORES, ok: true }],
    });
    answer(event);
    await act(async () => {
      await result.current.set(true);
    });
    await waitFor(() => expect(result.current.missed).toEqual([]));
  });
});
