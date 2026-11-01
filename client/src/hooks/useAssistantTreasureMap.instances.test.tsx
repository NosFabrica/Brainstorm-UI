// @vitest-environment jsdom
/**
 * A failing check across hook instances, over the real react-query: /setup's
 * row, the header's banner and the page each mount their own instance, and
 * all of them read one kept failure. A check that never loaded goes back to
 * pending when asked again (query-core's fetchState), so the failure is kept
 * with the query until an answer arrives. Only where the step is shown
 * (`askAgain`) does a mount ask again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

const sk = generateSecretKey();
const ASSISTANT = getPublicKey(sk);
const SCORES = "wss://scores.example/";
const SHOULD = [["30382:rank", SCORES]];
const signedMap = (entries: string[][], created_at = 1_790_000_000) =>
  finalizeEvent({ kind: 10040, created_at, content: "", tags: entries.map(([k, r]) => [k, ASSISTANT, r]) }, sk);

const h = vi.hoisted(() => ({
  getAssistantTreasureMap: vi.fn(),
  setAssistantTreasureMap: vi.fn(),
  reach: vi.fn(),
  stored: undefined as unknown,
  listeners: new Set<() => void>(),
}));
vi.mock("@/services/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiClient: {
    getAssistantTreasureMap: h.getAssistantTreasureMap,
    setAssistantTreasureMap: h.setAssistantTreasureMap,
  },
}));
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
      h.stored = ev;
      h.listeners.forEach((listener) => listener());
    },
  },
}));
vi.mock("@/lib/relayRequest", () => ({ requestHeld: h.reach }));

import { parseTreasureMapCheck } from "@/lib/assistantTreasureMap";
import { AssistantRouteError, TreasureMapUnavailableError } from "@/services/api";
import { useAssistantTreasureMap } from "./useAssistantTreasureMap";

const A = "a".repeat(64);
const B = "b".repeat(64);
// As a server since the field answers: the page's mounts probe when there's a version to ask about.
const check = (on: boolean) =>
  parseTreasureMapCheck({
    assistant: ASSISTANT,
    on,
    duties: [],
    shouldSay: SHOULD,
    relays: [SCORES],
    writerRelays: [SCORES],
  });
const UNREAD =
  "Couldn't read your Treasure Map, so your Assistant's Treasure Map couldn't be checked. Try again in a moment.";
const unread = () => new AssistantRouteError(UNREAD, 502, true);
const TOO_MANY = "Your Treasure Map names more than 64 keys, too many to check.";
const OFF = { on: false, published: true, event: null, relays: [{ url: SCORES, ok: true }] };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
/** An instance, with every render's error kept: `{ askAgain: true }` is /setup or the page. */
const mount = (options?: { probeRelays?: boolean; askAgain?: boolean }, pubkey = A) => {
  const seen: (string | undefined)[] = [];
  const hook = renderHook(
    () => {
      const map = useAssistantTreasureMap(pubkey, options);
      seen.push(map.error?.message);
      return map;
    },
    { wrapper },
  );
  return { ...hook, seen };
};
/** The next GETs, held: each one's `fail` or `answer` settles it. */
const held = () => {
  const pending: { fail: (e: Error) => void; answer: (v: unknown) => void }[] = [];
  h.getAssistantTreasureMap.mockImplementation(
    () => new Promise((resolve, reject) => pending.push({ fail: reject, answer: resolve })),
  );
  return pending;
};
const gets = () => h.getAssistantTreasureMap.mock.calls.length;
const fetchStatus = (pubkey = A) => client.getQueryState(["assistant-treasure-map", pubkey])?.fetchStatus;

beforeEach(() => {
  vi.clearAllMocks();
  h.stored = undefined;
  // The hook decides what is retried; a short delay keeps its one retry quick here.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 10 } } });
  h.reach.mockImplementation(async (relays: string[]) => ({
    held: undefined,
    reach: { asked: relays, answered: relays },
  }));
});

describe("a failing check, across instances", () => {
  it("a page mounted after the failure shows it from its first render, through its own re-ask", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    const setup = mount();
    await waitFor(() => expect(setup.result.current.error?.message).toBe(UNREAD));
    expect(gets()).toBe(2); // the first ask and its one retry
    const next = held();
    const page = mount({ probeRelays: true, askAgain: true });
    // The page asks again as it opens...
    await waitFor(() => expect(gets()).toBe(3));
    // ...and keeps the failure, and its Turn off, meanwhile.
    expect(page.seen.every((m) => m === UNREAD)).toBe(true);
    expect(page.result.current.offUnchecked).toBe(true);
    expect(setup.result.current.error?.message).toBe(UNREAD);
    await act(async () => next[0].fail(unread()));
    await waitFor(() => expect(gets()).toBe(4));
    await act(async () => next[1].fail(unread()));
    await waitFor(() => expect(fetchStatus()).toBe("idle"));
    expect(page.seen).not.toContain(undefined);
    expect(setup.seen.slice(setup.seen.indexOf(UNREAD))).not.toContain(undefined);
  });

  it("an instance where the step isn't shown reads the failure as it stands, without asking again", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError("Too many keys.", 422, true));
    const first = mount();
    await waitFor(() => expect(first.result.current.error).not.toBeNull());
    expect(gets()).toBe(1); // a 4xx isn't retried
    // Each page's header, the account menu, the dashboard card.
    for (let i = 0; i < 3; i++) {
      const header = mount();
      expect(header.seen[0]).toBe("Too many keys.");
      header.unmount();
    }
    await new Promise((r) => setTimeout(r, 30));
    expect(gets()).toBe(1);
  });

  it("on a server without the route, a page view's header doesn't ask again; /setup and the page do", async () => {
    // GET /user/{pubkey} answers the path: a profile, not a check.
    h.getAssistantTreasureMap.mockRejectedValue(new TreasureMapUnavailableError());
    const first = mount();
    await waitFor(() => expect(first.result.current.supported).toBe(false));
    for (let i = 0; i < 3; i++) mount().unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(gets()).toBe(1);
    const page = mount({ askAgain: true });
    await waitFor(() => expect(gets()).toBe(2));
    // Asked again, it still reads as no route: no "Asking…" in between.
    expect(page.result.current.supported).toBe(false);
  });

  it("a failure that came while nothing was mounted is kept for the next mount", async () => {
    const first = held();
    const setup = mount();
    await waitFor(() => expect(gets()).toBe(1));
    setup.unmount();
    // Unmounted, the attempt still settles (no retry once nothing observes it).
    await act(async () => first[0].fail(unread()));
    await new Promise((r) => setTimeout(r, 20));
    const next = held();
    const page = mount({ probeRelays: true, askAgain: true });
    await waitFor(() => expect(gets()).toBe(2));
    expect(page.seen.every((m) => m === UNREAD)).toBe(true);
    await act(async () => next[0].answer(check(false)));
    await waitFor(() => expect(page.result.current.supported).toBe(true));
    expect(page.result.current.error).toBeNull();
  });

  it("an answer clears it for every instance: a later re-ask shows no old failure", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    const header = mount();
    await waitFor(() => expect(header.result.current.error?.message).toBe(UNREAD));
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const page = mount({ askAgain: true });
    await waitFor(() => expect(page.result.current.supported).toBe(true));
    await waitFor(() => expect(header.result.current.error).toBeNull());
    held();
    const before = header.seen.length;
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["assistant-treasure-map", A] });
    });
    await waitFor(() => expect(fetchStatus()).toBe("fetching"));
    expect(header.seen.slice(before)).not.toContain(UNREAD);
    expect(page.result.current.error).toBeNull();
  });

  it("another account's failure isn't shown while that account's check is asked", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    const { result, rerender } = renderHook(({ pk }) => useAssistantTreasureMap(pk), {
      wrapper,
      initialProps: { pk: A },
    });
    await waitFor(() => expect(result.current.error?.message).toBe(UNREAD));
    held();
    rerender({ pk: B });
    await waitFor(() => expect(gets()).toBe(3));
    expect(result.current.error).toBeNull();
    expect(result.current.offUnchecked).toBe(false);
  });

  it("shows nothing while the first ask's retry is under way", async () => {
    let calls = 0;
    h.getAssistantTreasureMap.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(unread()) : new Promise(() => {});
    });
    const page = mount({ askAgain: true });
    await waitFor(() => expect(calls).toBe(2));
    // A render during the retry (the store, the page's own state) mustn't show the first attempt's failure.
    page.rerender();
    await new Promise((r) => setTimeout(r, 20));
    expect(page.seen.filter((m) => m !== undefined)).toEqual([]);
  });

  it("with a check cached, a failed re-check isn't asked again by a mount where the step isn't shown", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const first = mount();
    await waitFor(() => expect(first.result.current.supported).toBe(true));
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["assistant-treasure-map", A] });
    });
    await waitFor(() => expect(first.result.current.error?.message).toBe(UNREAD));
    // The server has answered a check: still supported, so /setup keeps that check's status.
    expect(first.result.current.supported).toBe(true);
    expect(first.result.current.status).toBe("missing");
    const n = gets();
    const header = mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(gets()).toBe(n);
    expect(header.seen[0]).toBe(UNREAD);
    // Where it's shown, it is.
    mount({ askAgain: true });
    await waitFor(() => expect(gets()).toBeGreaterThan(n));
  });

  it("with a check cached, a re-check that finds no route hides the step", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const page = mount({ askAgain: true });
    await waitFor(() => expect(page.result.current.supported).toBe(true));
    h.getAssistantTreasureMap.mockRejectedValue(new TreasureMapUnavailableError());
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["assistant-treasure-map", A] });
    });
    await waitFor(() => expect(page.result.current.supported).toBe(false));
    expect(page.result.current.error).toBeNull();
  });

  it("a press over a cached check whose re-check failed answers at once, and the failure stays meanwhile", async () => {
    h.stored = signedMap(SHOULD);
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const page = mount({ probeRelays: true, askAgain: true });
    await waitFor(() => expect(page.result.current.status).toBe("current"));
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["assistant-treasure-map", A] });
    });
    await waitFor(() => expect(page.result.current.error?.message).toBe(UNREAD));
    held(); // the press's re-read hangs
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: false, event: null, relays: [] });
    const before = page.seen.length;
    let answered = false;
    act(() => {
      void page.result.current.set(false).then(() => (answered = true));
    });
    await waitFor(() => expect(answered).toBe(true));
    expect(page.result.current.on).toBe(false);
    expect(page.result.current.error?.message).toBe(UNREAD);
    expect(page.seen.slice(before)).not.toContain(undefined);
  });

  it("a Turn off pressed while a re-ask is out gets a GET sent after it, not the one already out", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    const setup = mount();
    await waitFor(() => expect(setup.result.current.error?.message).toBe(UNREAD));
    // The page opens and asks again; that GET read the old choice, on, and will answer late.
    const out = held();
    const page = mount({ probeRelays: true, askAgain: true });
    await waitFor(() => expect(gets()).toBe(3));
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
    // The press's re-check is a GET of its own, and the failure stands meanwhile (dropping the old GET isn't one).
    await waitFor(() => expect(gets()).toBe(4));
    expect(page.result.current.error?.message).toBe(UNREAD);
    expect(page.seen).not.toContain("CancelledError");
    await act(async () => out[0].answer(check(true))); // the stale one, dropped
    await act(async () => out[1].answer(check(false)));
    await waitFor(() => expect(page.result.current.supported).toBe(true));
    expect(page.result.current.on).toBe(false);
    expect(setup.result.current.on).toBe(false);
  });
});

describe("a press, across views and accounts", () => {
  it("a press under way shows on every view, and its answer on a view opened after it (A1)", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const page = mount({ askAgain: true, probeRelays: true });
    await waitFor(() => expect(page.result.current.supported).toBe(true));
    let answer!: (v: unknown) => void;
    h.setAssistantTreasureMap.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    let pressed!: Promise<unknown>;
    act(() => {
      pressed = page.result.current.set(false);
    });
    // The page is left and opened again before the POST answers.
    page.unmount();
    const again = mount({ askAgain: true, probeRelays: true });
    await waitFor(() => expect(again.result.current.pressing).toBe("off"));
    expect(again.result.current.publishing).toBe(true);
    expect(again.result.current.lastPress).toBeNull();
    await act(async () => {
      answer(OFF);
      await pressed;
    });
    await waitFor(() => expect(again.result.current.pressing).toBeNull());
    expect(again.result.current.lastPress).toEqual({ result: OFF, error: null });
    expect(h.setAssistantTreasureMap).toHaveBeenCalledTimes(1);
  });

  it("a press settles against the account it was made for, not the one active when it answers (A2)", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const hook = renderHook(({ pubkey }) => useAssistantTreasureMap(pubkey, { askAgain: true }), {
      wrapper,
      initialProps: { pubkey: A },
    });
    await waitFor(() => expect(hook.result.current.supported).toBe(true));
    let answer!: (v: unknown) => void;
    h.setAssistantTreasureMap.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    let pressed!: Promise<unknown>;
    act(() => {
      pressed = hook.result.current.set(false);
    });
    await waitFor(() => expect(hook.result.current.pressing).toBe("off"));
    // The account menu switches to B before the POST answers.
    hook.rerender({ pubkey: B });
    await waitFor(() => expect(hook.result.current.supported).toBe(true));
    expect(hook.result.current.pressing).toBeNull();
    const before = gets();
    await act(async () => {
      answer(OFF);
      await pressed;
    });
    // A's check is asked again (when it's next shown) and A keeps the choice; B is left as it was.
    expect(client.getQueryState(["assistant-treasure-map", A])?.isInvalidated).toBe(true);
    expect(client.getQueryData(["assistant-treasure-map-choice", A])).toMatchObject({ on: false });
    expect(client.getQueryState(["assistant-treasure-map", B])?.isInvalidated).toBe(false);
    expect(client.getQueryData(["assistant-treasure-map-choice", B])).toBeUndefined();
    expect(gets()).toBe(before);
    expect(hook.result.current.on).toBe(true);
    expect(hook.result.current.lastPress).toBeNull();
  });

  it("a Turn off over a kept 422, made while a re-ask is out, asks again: a Map trimmed meanwhile loads (A3)", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(TOO_MANY, 422, true));
    const header = mount();
    await waitFor(() => expect(header.result.current.error?.message).toBe(TOO_MANY));
    // The reader trims their Map and opens the page: its re-ask is out when they press Turn off.
    const pending = held();
    const page = mount({ askAgain: true });
    await waitFor(() => expect(pending).toHaveLength(1));
    h.setAssistantTreasureMap.mockResolvedValue(OFF);
    await act(async () => {
      await page.result.current.set(false);
    });
    // The GET already out is dropped, and one asked after the press takes its place.
    expect(pending).toHaveLength(2);
    await act(async () => pending[1].answer(check(false)));
    await waitFor(() => expect(page.result.current.assistant).toBe(ASSISTANT));
    expect(page.result.current.error).toBeNull();
    expect(header.result.current.error).toBeNull();
  });

  it("a re-ask that waits for the network keeps the failure on every view, its Turn off included (A4)", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(unread());
    const header = mount();
    await waitFor(() => expect(header.result.current.error?.message).toBe(UNREAD), { timeout: 3000 });
    onlineManager.setOnline(false);
    try {
      const page = mount({ askAgain: true });
      await waitFor(() => expect(fetchStatus()).toBe("paused"));
      expect(page.result.current.error?.message).toBe(UNREAD);
      expect(page.result.current.offUnchecked).toBe(true);
      expect(header.result.current.error?.message).toBe(UNREAD);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("a 429 is asked once more, and a Turn off over it asks the check again: only the 422 lasts (A7)", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const page = mount({ askAgain: true });
    await waitFor(() => expect(page.result.current.supported).toBe(true));
    const limited = new AssistantRouteError("Couldn't check your Assistant's Treasure Map (429)", 429, false);
    h.getAssistantTreasureMap.mockRejectedValue(limited);
    await act(async () => {
      await client.refetchQueries({ queryKey: ["assistant-treasure-map", A] });
    });
    await waitFor(() => expect(page.result.current.error).toBe(limited));
    expect(gets()).toBe(3);
    h.setAssistantTreasureMap.mockResolvedValue(OFF);
    h.getAssistantTreasureMap.mockResolvedValue(check(false));
    await act(async () => {
      await page.result.current.set(false);
    });
    await waitFor(() => expect(page.result.current.error).toBeNull());
    expect(gets()).toBe(4);
    expect(page.result.current.on).toBe(false);
  });

  it("a 2xx that isn't JSON, over a check from before, is a failure shown above it, not 'no route' (A8)", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(true));
    const page = mount({ askAgain: true });
    await waitFor(() => expect(page.result.current.supported).toBe(true));
    h.getAssistantTreasureMap.mockRejectedValue(new TreasureMapUnavailableError({ notJson: true }));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["assistant-treasure-map", A] });
    });
    await waitFor(() => expect(page.result.current.error).toBeInstanceOf(TreasureMapUnavailableError));
    expect(page.result.current.supported).toBe(true);
    expect(page.result.current.assistant).toBe(ASSISTANT);
    // Asked once more first: a proxy's page may pass.
    expect(gets()).toBe(3);
  });

  it("with no check, a 2xx that isn't JSON is asked once more, then means no route (A8)", async () => {
    h.getAssistantTreasureMap.mockRejectedValue(new TreasureMapUnavailableError({ notJson: true }));
    const page = mount({ askAgain: true });
    await waitFor(() => expect(page.result.current.supported).toBe(false));
    expect(gets()).toBe(2);
    expect(page.result.current.error).toBeNull();
  });
});
