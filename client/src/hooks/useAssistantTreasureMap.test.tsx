// @vitest-environment jsdom
/**
 * The Assistant's Treasure Map as Account Setup reads it: the server's check
 * (docs/assistant/TREASURE-MAP-ASK.md), a 404 as "no such step here", the
 * version found on relays against what it should list, a press whose signed
 * version joins the store only when it verifies, and the relay probe: which
 * writer relays answered without the newest version, asked only where a page
 * wants it and only while a press would otherwise sign nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

const sk = generateSecretKey();
const ASSISTANT = getPublicKey(sk);
const SCORES = "wss://scores.example/";
const LISTS = "wss://lists.example/";
const SHOULD = [
  ["30382:rank", SCORES],
  ["30382:followers", SCORES],
];
const signedMap = (entries: string[][], created_at = 1_790_000_000) =>
  finalizeEvent({ kind: 10040, created_at, content: "", tags: entries.map(([k, r]) => [k, ASSISTANT, r]) }, sk);

const h = vi.hoisted(() => ({
  getAssistantTreasureMap: vi.fn(),
  setAssistantTreasureMap: vi.fn(),
  reach: vi.fn(),
  stored: undefined as unknown,
  added: [] as unknown[],
  listeners: new Set<() => void>(),
}));
vi.mock("@/services/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiClient: {
    getAssistantTreasureMap: h.getAssistantTreasureMap,
    setAssistantTreasureMap: h.setAssistantTreasureMap,
  },
}));
// A store that re-renders on `add`, as the EventStore does.
vi.mock("@/hooks/useStoreReplaceable", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    h.listeners.add(listener);
    return () => void h.listeners.delete(listener);
  };
  return {
    useStoreReplaceable: (_kind: number, pubkey: string | null) => {
      const event = useSyncExternalStore(subscribe, () => h.stored);
      return { event: pubkey ? event : undefined, loading: false, settled: !!pubkey };
    },
  };
});
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: vi.fn(async () => []),
  getNip85RelayUrl: () => "wss://scores.example",
}));
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    add: (ev: unknown) => {
      h.added.push(ev);
      h.stored = ev;
      h.listeners.forEach((listener) => listener());
    },
  },
}));
vi.mock("@/lib/relayRequest", () => ({ requestNewestWithReach: h.reach }));

import { parseTreasureMapCheck } from "@/lib/assistantTreasureMap";
import { AssistantRouteError, TreasureMapUnavailableError } from "@/services/api";
import { useAssistantTreasureMap } from "./useAssistantTreasureMap";

const HINT = "wss://hint.example/";
const check = (on: boolean, relays = [SCORES], shouldSay = SHOULD) =>
  parseTreasureMapCheck({ assistant: ASSISTANT, on, duties: [], shouldSay, relays });
/** Each relay asked answers, holding `newest` (none by default). */
const answer = (newest?: unknown, answered = true) =>
  h.reach.mockImplementation(async (relays: string[]) => ({
    newest,
    reach: { asked: relays, answered: answered ? relays : [] },
  }));
/** Each relay asked answers with what it holds here. */
const holding = (held: Record<string, unknown>) =>
  h.reach.mockImplementation(async (relays: string[]) => ({
    newest: held[relays[0]],
    reach: { asked: relays, answered: relays },
  }));
const ownNewest = { kinds: [10040], authors: [ASSISTANT], limit: 1 };

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const mount = (options?: { probeRelays?: boolean }) =>
  renderHook(() => useAssistantTreasureMap("a".repeat(64), options), { wrapper });
const probing = () => mount({ probeRelays: true });
/** Mounted, with every render's error kept. */
const mountSeen = () => {
  const seen: (string | undefined)[] = [];
  const hook = renderHook(
    () => {
      const map = useAssistantTreasureMap("a".repeat(64));
      seen.push(map.error?.message);
      return map;
    },
    { wrapper },
  );
  return { ...hook, seen };
};
const TOO_MANY = "Your Treasure Map names more than 64 keys, too many to check.";

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

  it("a failure a Turn off gets past, the GET's own 502s and its 422, says so", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    const tooMany = mount();
    await waitFor(() => expect(tooMany.result.current.error?.message).toBe(TOO_MANY));
    expect(tooMany.result.current.offUnchecked).toBe(true);
    // Asking again can't change a 422: the Map has to be edited first.
    expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(1);
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError("Couldn't read your Treasure Map.", 502, true));
    const unread = mount();
    await waitFor(() => expect(unread.result.current.offUnchecked).toBe(true), { timeout: 3000 });
  });

  it("any other failure doesn't offer Turn off: the POST would fail the same way", async () => {
    for (const err of [
      new TypeError("Failed to fetch"),
      new AssistantRouteError("Couldn't check your Assistant's Treasure Map (502)", 502, false),
      new AssistantRouteError("Internal error.", 500, true),
    ]) {
      h.getAssistantTreasureMap.mockRejectedValue(err);
      const { result, unmount } = mount();
      await waitFor(() => expect(result.current.error).toBe(err), { timeout: 3000 });
      expect(result.current.offUnchecked).toBe(false);
      unmount();
    }
  });

  it("keeps a failure while the check is asked again, so a Turn off past it keeps its place", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    const { result, seen } = mountSeen();
    await waitFor(() => expect(result.current.error?.message).toBe(TOO_MANY));
    let fail!: () => void;
    h.getAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = () => reject(new AssistantRouteError(TOO_MANY, 422, true));
        }),
    );
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: false, event: null, relays: [] });
    // The press answers without waiting for the re-check.
    await act(async () => {
      await result.current.set(false);
    });
    await waitFor(() => expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(2));
    await act(async () => fail());
    await waitFor(() => expect(result.current.error?.message).toBe(TOO_MANY));
    expect(seen.slice(seen.indexOf(TOO_MANY))).not.toContain(undefined);
  });

  it("a Turn off made before any check has loaded still adds its version", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    const { result } = mount();
    await waitFor(() => expect(result.current.error).not.toBeNull());
    const empty = signedMap([]);
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: true, event: empty, relays: [] });
    await act(async () => {
      await result.current.set(false);
    });
    expect(h.added).toEqual([empty]);
  });

  it("shows a press's choice at once, and answers once the check is back", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = mount();
    await waitFor(() => expect(result.current.on).toBe(true));
    let back!: () => void;
    h.getAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          back = () => resolve(check(false));
        }),
    );
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [],
    });
    let answered = false;
    act(() => {
      void result.current.set(false).then(() => (answered = true));
    });
    await waitFor(() => expect(result.current.on).toBe(false));
    expect(answered).toBe(false);
    await act(async () => back());
    await waitFor(() => expect(answered).toBe(true));
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

  it("asks each writer relay for its own newest version: one that answered without it missed it", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, HINT]));
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    expect(h.reach).toHaveBeenCalledWith([SCORES], ownNewest, 5000);
    // The hint is never asked: a press never sends there.
    expect(h.reach.mock.calls.map((call) => call[0])).toEqual([[SCORES]]);
  });

  it("a relay holding a newer version than the store's hasn't missed it", async () => {
    h.stored = signedMap(SHOULD);
    holding({ [SCORES]: signedMap(SHOULD, 1_790_000_100) });
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = probing();
    await waitFor(() => expect(h.reach).toHaveBeenCalled());
    await waitFor(() => expect(result.current.checkingRelays).toBe(false));
    expect(result.current.missed).toEqual([]);
  });

  it("of two writer relays, names the one that answered without the newest", async () => {
    const both = [...SHOULD, ["30392", LISTS]];
    const v1 = signedMap(both);
    const v2 = signedMap(both, 1_790_000_100);
    h.stored = v1;
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES], both));
    holding({ [SCORES]: v1, [LISTS]: v2 });
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    expect(h.reach.mock.calls.map((call) => call[0])).toEqual([[SCORES], [LISTS]]);
  });

  it("says it's still asking, rather than that nothing was missed", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    h.reach.mockImplementation(() => new Promise(() => {}));
    const { result } = probing();
    await waitFor(() => expect(result.current.checkingRelays).toBe(true));
    expect(result.current.missed).toEqual([]);
  });

  it("leaves alone a relay that doesn't answer, as the press does", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    answer(undefined, false);
    const { result } = probing();
    await waitFor(() => expect(h.reach).toHaveBeenCalled());
    await waitFor(() => expect(result.current.checkingRelays).toBe(false));
    expect(result.current.missed).toEqual([]);
  });

  it("while off, asks the scores relay alone: Turn off reads only the outbox", async () => {
    const both = [...SHOULD, ["30392", LISTS]];
    h.stored = signedMap([]);
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES], both));
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    expect(h.reach.mock.calls.map((call) => call[0])).toEqual([[SCORES]]);
  });

  it("asks only where a page wants it", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("current"));
    expect(h.reach).not.toHaveBeenCalled();
    expect(result.current.checkingRelays).toBe(false);
  });

  it("asks nothing while a press would sign a new version, which goes to every writer relay", async () => {
    h.stored = signedMap(SHOULD.slice(0, 1));
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const stale = probing();
    await waitFor(() => expect(stale.result.current.status).toBe("out-of-date"));
    // Off with duties still listed: Turn off signs an empty version.
    h.getAssistantTreasureMap.mockResolvedValue(check(false));
    const listed = probing();
    await waitFor(() => expect(listed.result.current.found).toHaveLength(1));
    expect(h.reach).not.toHaveBeenCalled();
    expect(listed.result.current.missed).toEqual([]);
  });

  it("asks again after a press, which doesn't wait for the answer", async () => {
    const event = signedMap(SHOULD);
    h.stored = event;
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    h.setAssistantTreasureMap.mockResolvedValue({
      on: true,
      published: true,
      event,
      relays: [{ url: SCORES, ok: true }],
    });
    // A repair: the relay now holds it, but answers only after the press has.
    let land!: () => void;
    h.reach.mockImplementation(
      (relays: string[]) =>
        new Promise((resolve) => {
          land = () => resolve({ newest: event, reach: { asked: relays, answered: relays } });
        }),
    );
    await act(async () => {
      await result.current.set(true);
    });
    // The press has answered; the relays are still being asked.
    await waitFor(() => expect(result.current.checkingRelays).toBe(true));
    await act(async () => land());
    await waitFor(() => expect(result.current.missed).toEqual([]));
    expect(result.current.checkingRelays).toBe(false);
  });

  it("a press that signs a new version shows it at once and asks the relays again", async () => {
    h.stored = signedMap(SHOULD.slice(0, 1));
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = probing();
    await waitFor(() => expect(result.current.status).toBe("out-of-date"));
    const next = signedMap(SHOULD, 1_790_000_100);
    h.setAssistantTreasureMap.mockResolvedValue({ on: true, published: true, event: next, relays: [] });
    h.reach.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      await result.current.set(true);
    });
    expect(result.current.published?.id).toBe(next.id);
    expect(result.current.status).toBe("current");
    await waitFor(() => expect(result.current.checkingRelays).toBe(true));
  });
});
