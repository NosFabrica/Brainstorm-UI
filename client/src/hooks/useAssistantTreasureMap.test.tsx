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
// Each relay asked answers with its own newest version, as lib/relayRequest `requestHeld` does.
vi.mock("@/lib/relayRequest", () => ({ requestHeld: h.reach }));

import { parseTreasureMapCheck } from "@/lib/assistantTreasureMap";
import { AssistantRouteError, TreasureMapUnavailableError } from "@/services/api";
import { useAssistantTreasureMap } from "./useAssistantTreasureMap";

const HINT = "wss://hint.example/";
const check = (on: boolean, relays = [SCORES], shouldSay = SHOULD, writerRelays = [SCORES]) =>
  parseTreasureMapCheck({ assistant: ASSISTANT, on, duties: [], shouldSay, relays, writerRelays });
/** Each relay asked answers, holding `newest` (none by default). */
const answer = (held?: unknown, answered = true) =>
  h.reach.mockImplementation(async (relays: string[]) => ({
    held,
    reach: { asked: relays, answered: answered ? relays : [] },
  }));
/** Each relay asked answers with what it holds here. */
const holding = (held: Record<string, unknown>) =>
  h.reach.mockImplementation(async (relays: string[]) => ({
    held: held[relays[0]],
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
const UNREAD =
  "Couldn't read your Treasure Map, so your Assistant's Treasure Map couldn't be checked. Try again in a moment.";
const unread = () => new AssistantRouteError(UNREAD, 502, true);
const SCORES_502 = "Couldn't check whether your Scores are kept up to date. Try again in a moment.";
const PUB = "a".repeat(64);
const KEY = ["assistant-treasure-map", PUB];

/** From here, each GET waits to be answered by hand, in the order sent. */
const holdGets = () => {
  const gets: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
  h.getAssistantTreasureMap.mockImplementation(() => new Promise((resolve, reject) => gets.push({ resolve, reject })));
  return gets;
};
/** One QueryClient for several mounts, its retry quick. */
const shared = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 20 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};
/** Mounted over a client the test can reach, with every render's error kept. */
const mountShared = (options?: { probeRelays?: boolean }) => {
  const { client, wrapper } = shared();
  const seen: (string | undefined)[] = [];
  const hook = renderHook(
    () => {
      const map = useAssistantTreasureMap(PUB, options);
      seen.push(map.error?.message);
      return map;
    },
    { wrapper },
  );
  return { ...hook, client, seen };
};

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

  it("any other failure doesn't offer Turn off: it can't be told from one that fails Turn off too", async () => {
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
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    const { result, seen } = mountSeen();
    await waitFor(() => expect(result.current.error?.message).toBe(UNREAD), { timeout: 3000 });
    const before = h.getAssistantTreasureMap.mock.calls.length;
    const gets = holdGets();
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: false, event: null, relays: [] });
    // The press answers without waiting for the re-check.
    await act(async () => {
      await result.current.set(false);
    });
    expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(before + 1);
    await act(async () => gets[0].reject(unread()));
    // Its one retry.
    await waitFor(() => expect(gets).toHaveLength(2), { timeout: 3000 });
    await act(async () => gets[1].reject(unread()));
    await waitFor(() => expect(result.current.error?.message).toBe(UNREAD));
    expect(seen.slice(seen.indexOf(UNREAD))).not.toContain(undefined);
    // The Turn off answered, so there's nothing left for another to take off.
    expect(result.current.offUnchecked).toBe(false);
  });

  it("doesn't ask the 422 again after a Turn off: no press changes the reader's Map", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    const { result } = mount();
    await waitFor(() => expect(result.current.error?.message).toBe(TOO_MANY));
    expect(result.current.offUnchecked).toBe(true);
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: true, event: signedMap([]), relays: [] });
    await act(async () => {
      await result.current.set(false);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(1);
    expect(result.current.error?.message).toBe(TOO_MANY);
    expect(result.current.offUnchecked).toBe(false);
  });

  it("asks a 4xx again after a Turn on or Update now that got through: it read the Map", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result, client } = mountShared();
    await waitFor(() => expect(result.current.status).toBe("current"));
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(result.current.error?.message).toBe(TOO_MANY));
    const before = h.getAssistantTreasureMap.mock.calls.length;
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    h.setAssistantTreasureMap.mockResolvedValue({ on: true, published: false, event: null, relays: [] });
    await act(async () => {
      await result.current.set(true);
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(before + 1);
  });

  it("doesn't ask the 422 again after an Update now the 422 refused too", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result, client } = mountShared();
    await waitFor(() => expect(result.current.status).toBe("current"));
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(result.current.error?.message).toBe(TOO_MANY));
    const before = h.getAssistantTreasureMap.mock.calls.length;
    h.setAssistantTreasureMap.mockRejectedValue(
      new AssistantRouteError(
        "Your Treasure Map names more than 64 keys, too many to check, so nothing was published.",
        422,
        true,
      ),
    );
    await act(async () => {
      await result.current.set(true).catch(() => {});
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(before);
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

  it("shows a press's choice once it answers, which waits for the check while it stands", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = mount();
    await waitFor(() => expect(result.current.on).toBe(true));
    const gets = holdGets();
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
    await waitFor(() => expect(gets).toHaveLength(1));
    // The version is in, but the choice is the check's until the press answers: its button stays.
    await waitFor(() => expect(result.current.found).toEqual([]));
    expect(result.current.on).toBe(true);
    expect(result.current.publishing).toBe(true);
    expect(answered).toBe(false);
    await act(async () => gets[0].resolve(check(false)));
    await waitFor(() => expect(answered).toBe(true));
    expect(result.current.on).toBe(false);
  });

  it("after a Turn off whose re-check fails, shows its choice over the check from before", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("current"));
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(SCORES_502, 502, true));
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [],
    });
    await act(async () => {
      await result.current.set(false);
    });
    expect(result.current.error?.message).toBe(SCORES_502);
    expect(result.current.on).toBe(false);
    expect(result.current.found).toEqual([]);
  });

  it("a press made while a cached check is failing answers at once, and the failure stays", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result, client, seen } = mountShared();
    await waitFor(() => expect(result.current.status).toBe("current"));
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(result.current.error?.message).toBe(UNREAD), { timeout: 3000 });
    const from = seen.length;
    // The re-read hangs, as a GET whose Map read is slow does.
    h.getAssistantTreasureMap.mockImplementation(() => new Promise(() => {}));
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [],
    });
    await act(async () => {
      await result.current.set(false);
    });
    expect(result.current.on).toBe(false);
    // Not a fresh answer: the check is still failing, for the page and for /setup, which keeps
    // the cached check's status (D1 option ii).
    expect(client.getQueryState(KEY)?.status).toBe("error");
    expect(result.current.supported).toBe(true);
    expect(result.current.status).not.toBeNull();
    expect(seen.slice(from)).not.toContain(undefined);
  });

  it("a check that fails while the POST is out isn't waited for either: the press answers at once", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result, client } = mountShared();
    await waitFor(() => expect(result.current.status).toBe("current"));
    let answer!: () => void;
    h.setAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ on: true, published: false, event: null, relays: [] });
        }),
    );
    let answered = false;
    act(() => {
      void result.current.set(true).then(() => (answered = true));
    });
    await waitFor(() => expect(result.current.publishing).toBe(true));
    // Meanwhile something else (the app's resume, say) asks the check again, and it fails.
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(result.current.error?.message).toBe(UNREAD), { timeout: 3000 });
    // From here the re-read hangs, as a GET whose Map read is slow does.
    h.getAssistantTreasureMap.mockImplementation(() => new Promise(() => {}));
    await act(async () => answer());
    await waitFor(() => expect(answered).toBe(true));
    expect(result.current.error?.message).toBe(UNREAD);
  });

  it("every instance sees a press's choice: a page mounted after a Turn off doesn't offer another", async () => {
    const { wrapper } = shared();
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    const page = renderHook(() => useAssistantTreasureMap(PUB, { probeRelays: true }), { wrapper });
    const setup = renderHook(() => useAssistantTreasureMap(PUB), { wrapper });
    await waitFor(() => expect(page.result.current.offUnchecked).toBe(true));
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: true, event: signedMap([]), relays: [] });
    await act(async () => {
      await page.result.current.set(false);
    });
    expect(setup.result.current.offUnchecked).toBe(false);
    page.unmount();
    const again = renderHook(() => useAssistantTreasureMap(PUB, { probeRelays: true }), { wrapper });
    await waitFor(() => expect(again.result.current.error?.message).toBe(TOO_MANY));
    expect(again.result.current.offUnchecked).toBe(false);
  });

  for (const trigger of ["/setup opening", "a global invalidation"]) {
    it(`a Turn off made while a re-ask is out (${trigger}) drops it, so the old choice can't come back`, async () => {
      const { client, wrapper } = shared();
      h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(SCORES_502, 502, true));
      const page = renderHook(() => useAssistantTreasureMap(PUB, { probeRelays: true }), { wrapper });
      await waitFor(() => expect(page.result.current.offUnchecked).toBe(true), { timeout: 3000 });
      // A re-ask goes out, reading the choice before the press: on. Only where the step is shown does a mount ask.
      const gets = holdGets();
      if (trigger === "/setup opening") renderHook(() => useAssistantTreasureMap(PUB, { askAgain: true }), { wrapper });
      else void client.invalidateQueries();
      await waitFor(() => expect(gets).toHaveLength(1));
      expect(page.result.current.offUnchecked).toBe(true);
      h.setAssistantTreasureMap.mockResolvedValue({
        on: false,
        published: true,
        event: signedMap([], 1_790_000_100),
        relays: [],
      });
      await act(async () => {
        await page.result.current.set(false);
      });
      // Asked again after the press, not joined.
      expect(gets).toHaveLength(2);
      expect(page.result.current.offUnchecked).toBe(false);
      await act(async () => gets[0].resolve(check(true)));
      expect(page.result.current.assistant).toBeNull();
      await act(async () => gets[1].resolve(check(false)));
      await waitFor(() => expect(page.result.current.assistant).toBe(ASSISTANT));
      expect(page.result.current.on).toBe(false);
    });
  }

  it("with a check cached and a lasting 422, a Turn off made while a re-ask is out drops it too", async () => {
    const { client, wrapper } = shared();
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const page = renderHook(() => useAssistantTreasureMap(PUB, { probeRelays: true }), { wrapper });
    await waitFor(() => expect(page.result.current.status).toBe("current"));
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(page.result.current.error?.message).toBe(TOO_MANY));
    // /setup opens and asks again; that GET read the choice before the press: on.
    const gets = holdGets();
    renderHook(() => useAssistantTreasureMap(PUB, { askAgain: true }), { wrapper });
    await waitFor(() => expect(gets).toHaveLength(1));
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [],
    });
    await act(async () => {
      await page.result.current.set(false);
    });
    // The 422 isn't asked again, and the GET already out is dropped: its old choice can't undo the Turn off.
    await act(async () => gets[0].resolve(check(true)));
    await new Promise((r) => setTimeout(r, 30));
    expect(gets).toHaveLength(1);
    expect(page.result.current.on).toBe(false);
  });

  it("a Turn off made while a re-ask is out keeps its choice when the check after it fails too", async () => {
    const { wrapper } = shared();
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(SCORES_502, 502, true));
    const page = renderHook(() => useAssistantTreasureMap(PUB, { probeRelays: true }), { wrapper });
    await waitFor(() => expect(page.result.current.offUnchecked).toBe(true), { timeout: 3000 });
    const gets = holdGets();
    renderHook(() => useAssistantTreasureMap(PUB, { askAgain: true }), { wrapper });
    await waitFor(() => expect(gets).toHaveLength(1));
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: false, event: null, relays: [] });
    await act(async () => {
      await page.result.current.set(false);
    });
    await act(async () => gets[1].reject(new AssistantRouteError(SCORES_502, 502, true)));
    await waitFor(() => expect(gets).toHaveLength(3), { timeout: 3000 });
    await act(async () => gets[2].reject(new AssistantRouteError(SCORES_502, 502, true)));
    await act(async () => gets[0].resolve(check(true)));
    await waitFor(() => expect(page.result.current.error?.message).toBe(SCORES_502));
    expect(page.result.current.assistant).toBeNull();
    expect(page.result.current.offUnchecked).toBe(false);
  });

  it("after a press that changed the choice, asks no relay for it until a check after the press is back", async () => {
    const both = [...SHOULD, ["30392", LISTS]];
    const v = signedMap(both);
    h.stored = v;
    holding({ [SCORES]: v, [LISTS]: v });
    // Update now's relays: the outbox (the scores relay heads it) and the lists relay `shouldSay` names.
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES], both, [SCORES, LISTS]));
    const { result, client } = mountShared({ probeRelays: true });
    await waitFor(() => expect(result.current.status).toBe("current"));
    await waitFor(() => expect(result.current.checkingRelays).toBe(false));
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(SCORES_502, 502, true));
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(result.current.error?.message).toBe(SCORES_502), { timeout: 3000 });
    // The lists relay still holds the old version: Update now's relays would call it missed, and Turn off never reads it.
    holding({ [SCORES]: signedMap([], 1_790_000_100), [LISTS]: v });
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: signedMap([], 1_790_000_100),
      relays: [],
    });
    await act(async () => {
      await result.current.set(false);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.on).toBe(false);
    expect(result.current.missed).toEqual([]);
    expect(result.current.checkingRelays).toBe(false);
    // A check after the press names Turn off's relays: the scores relay.
    h.reach.mockClear();
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES], both, [SCORES]));
    await act(async () => {
      await client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(h.reach.mock.calls.map((c) => c[0])).toEqual([[SCORES]]));
  });

  it("after a press whose re-check a lasting 422 skips, what the relays held before it doesn't count", async () => {
    const OUTBOX = "wss://outbox.example/";
    const empty = signedMap([], 1_790_000_100);
    h.stored = empty;
    // Off: the scores relay still serves the old duties, the outbox the empty version.
    holding({ [SCORES]: signedMap(SHOULD), [OUTBOX]: empty });
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES, OUTBOX], SHOULD, [SCORES, OUTBOX]));
    const { result, client } = mountShared({ probeRelays: true });
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    // Asked again without an invalidation (a mount after its 10 minutes), the Map now names too many keys.
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    await act(async () => {
      await client.refetchQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(result.current.error?.message).toBe(TOO_MANY));
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(false);
    expect(result.current.missed).toEqual([SCORES]);
    const gets = h.getAssistantTreasureMap.mock.calls.length;
    // The repair: Turn off re-sends the empty version to the scores relay.
    h.setAssistantTreasureMap.mockResolvedValue({
      on: false,
      published: true,
      event: empty,
      relays: [{ url: SCORES, ok: true }],
    });
    await act(async () => {
      await result.current.set(false);
    });
    await new Promise((r) => setTimeout(r, 50));
    // The 422 isn't asked again, so no check comes after the press: the answer naming the scores relay is from before it.
    expect(h.getAssistantTreasureMap).toHaveBeenCalledTimes(gets);
    expect(result.current.missed).toEqual([]);
    expect(result.current.checkingRelays).toBe(false);
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

    // Signed and valid, but by a key other than the Assistant the check names: not its version.
    const other = generateSecretKey();
    const foreign = finalizeEvent({ kind: 10040, created_at: 1_790_000_200, content: "", tags: [] }, other);
    h.setAssistantTreasureMap.mockResolvedValue({ on: true, published: true, event: foreign, relays: [] });
    await act(async () => {
      await result.current.set(true);
    });
    expect(h.added).toHaveLength(1);
  });

  it("asks no relay while the check is asked again, nor after that fails: another device may have changed the choice", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const { result, client } = mountShared({ probeRelays: true });
    // The scores relay answers without a version: a press would sign one for it.
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    const asks = h.reach.mock.calls.length;
    const gets = holdGets();
    act(() => {
      void client.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(gets).toHaveLength(1));
    expect(result.current.missed).toEqual([]);
    expect(result.current.checkingRelays).toBe(false);
    await act(async () => gets[0].reject(new AssistantRouteError(SCORES_502, 502, true)));
    await waitFor(() => expect(gets).toHaveLength(2), { timeout: 3000 });
    await act(async () => gets[1].reject(new AssistantRouteError(SCORES_502, 502, true)));
    await waitFor(() => expect(result.current.error?.message).toBe(SCORES_502));
    // The cached check is shown, but its `writerRelays` may be another choice's: nothing is asked from it.
    expect(result.current.missed).toEqual([]);
    expect(h.reach).toHaveBeenCalledTimes(asks);
  });

  it("asks each writer relay for its own newest version: one that answered without it missed it", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, HINT]));
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    expect(h.reach).toHaveBeenCalledWith([SCORES], ownNewest, 5000, expect.any(Function));
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
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES], both, [SCORES, LISTS]));
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

  it("while off, asks the relays the check names for Turn off: the outbox alone", async () => {
    const OUTBOX = "wss://outbox.example/";
    const both = [...SHOULD, ["30392", LISTS]];
    const empty = signedMap([]);
    h.stored = empty;
    holding({ [OUTBOX]: empty });
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES, OUTBOX], both, [SCORES, OUTBOX]));
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    expect(h.reach.mock.calls.map((call) => call[0])).toEqual([[SCORES], [OUTBOX]]);
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
          land = () => resolve({ held: event, reach: { asked: relays, answered: relays } });
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
