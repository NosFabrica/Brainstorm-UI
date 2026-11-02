// @vitest-environment jsdom
/**
 * The relay probe over the real read (lib/relayRequest `requestHeld`), the
 * real EventStore and react-query, with only the relay pool faked: which of the
 * relays a press reads (the check's `writerRelays`) a press would send a
 * version to, set against brainstorm_server's `publish_assistant_treasure_map`
 * (read the writer relays, `nothing_to_change`, `_missing`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Observable } from "rxjs";
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools";

const SCORES = "wss://scores.example/";
const OUTBOX = "wss://outbox.example/";
const LISTS = "wss://lists.example/";
const HINT = "wss://hint.example/";

const h = vi.hoisted(() => ({
  getAssistantTreasureMap: vi.fn(),
  setAssistantTreasureMap: vi.fn(),
  read: vi.fn(),
  /** What each relay sends for the probe's REQ: its events, then EOSE. */
  held: {} as Record<string, unknown[]>,
  /** How long each relay takes; a relay in `silent` never answers. */
  delay: {} as Record<string, number>,
  silent: new Set<string>(),
  asked: [] as string[][],
}));
vi.mock("@/services/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiClient: {
    getAssistantTreasureMap: h.getAssistantTreasureMap,
    setAssistantTreasureMap: h.setAssistantTreasureMap,
  },
}));
// The hook's own read (8 s, into the store): what it brings is up to each test.
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: h.read }));
vi.mock("@/lib/relayPool", () => ({
  pool: {
    req: (relays: string[]) => {
      h.asked.push(relays);
      return new Observable((sub) => {
        const timers: ReturnType<typeof setTimeout>[] = [];
        for (const relay of relays) {
          if (h.silent.has(relay)) continue;
          timers.push(
            setTimeout(() => {
              for (const ev of h.held[relay] ?? []) sub.next({ type: "EVENT", from: relay, event: copy(ev) });
              sub.next({ type: "EOSE", from: relay });
            }, h.delay[relay] ?? 0),
          );
        }
        return () => timers.forEach(clearTimeout);
      });
    },
  },
}));

import { parseTreasureMapCheck } from "@/lib/assistantTreasureMap";
import { __resetAsks } from "@/lib/askOnce";
import { AssistantRouteError } from "@/services/api";
import { eventStore } from "@/lib/eventStore";
import { useAssistantTreasureMap } from "./useAssistantTreasureMap";

// jsdom's foreign-realm Uint8Array trips applesauce's nested @noble; the top-level nostr-tools verifies the same.
eventStore.verifyEvent = verifyEvent;
/** As a relay's frame arrives: parsed JSON, with no "verified" mark from signing it here. */
const copy = (ev: unknown) => JSON.parse(JSON.stringify(ev));

// A fresh Assistant per test: the store keeps each one's newest version for the whole file.
let sk = generateSecretKey();
let ASSISTANT = getPublicKey(sk);
let t = 1_790_000_000;
const RANK = ["30382:rank", SCORES];
const FOLLOWERS = ["30382:followers", SCORES];
const SHOULD = [RANK, FOLLOWERS];
const MAP_502 =
  "Couldn't read your Treasure Map, so your Assistant's Treasure Map couldn't be checked. Try again in a moment.";
const TOO_MANY = "Your Treasure Map names more than 64 keys, too many to check.";
const signed = (entries: string[][], at: number, key = sk) =>
  finalizeEvent(
    { kind: 10040, created_at: at, content: "", tags: entries.map(([k, r]) => [k, getPublicKey(key), r]) },
    key,
  );

const check = (on: boolean, writerRelays: string[] | undefined, shouldSay = SHOULD, relays = [SCORES, OUTBOX, HINT]) =>
  parseTreasureMapCheck({ assistant: ASSISTANT, on, duties: [], shouldSay, relays, writerRelays });

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapperFor =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const probing = (qc = client()) =>
  renderHook(() => useAssistantTreasureMap("a".repeat(64), { probeRelays: true }), { wrapper: wrapperFor(qc) });
/** Probed until every relay asked has answered. */
const settledProbe = async (qc?: QueryClient) => {
  const hook = probing(qc);
  await waitFor(() => expect(h.asked.length).toBeGreaterThan(0));
  await waitFor(() => expect(hook.result.current.checkingRelays).toBe(false));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetAsks();
  sk = generateSecretKey();
  ASSISTANT = getPublicKey(sk);
  t += 10_000;
  h.held = {};
  h.delay = {};
  h.silent = new Set();
  h.asked = [];
  h.read.mockResolvedValue([]);
});

describe("what each relay holds is its own answer, not the store's copy (V1-1)", () => {
  it("on: the scores relay kept an older version the store and the outbox have moved past", async () => {
    const v1 = signed([RANK], t);
    const v2 = signed(SHOULD, t + 100); // the press's, in the store from its answer
    eventStore.add(v2);
    h.held = { [SCORES]: [v1], [OUTBOX]: [v2] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.status).toBe("current");
    // _missing: latest is v2 (the outbox), the TA relay answered v1.
    expect(result.current.missed).toEqual([SCORES]);
  });

  it("off: the scores relay still serves the withdrawn duties, the store and the outbox the empty version", async () => {
    const old = signed(SHOULD, t);
    const empty = signed([], t + 100);
    eventStore.add(empty);
    h.held = { [SCORES]: [old], [OUTBOX]: [empty] };
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.found).toEqual([]);
    expect(result.current.missed).toEqual([SCORES]);
  });

  it("two relays holding different versions: the older is named, whichever answers first", async () => {
    for (const first of [SCORES, LISTS]) {
      __resetAsks();
      sk = generateSecretKey();
      ASSISTANT = getPublicKey(sk);
      h.asked = [];
      const both = [...SHOULD, ["30392", LISTS]];
      const v1 = signed(both, t);
      const v2 = signed(both, t + 100);
      eventStore.add(v1);
      h.held = { [SCORES]: [v1], [LISTS]: [v2] };
      h.delay = { [first]: 0, [first === SCORES ? LISTS : SCORES]: 50 };
      h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, LISTS], both));
      const { result, unmount } = await settledProbe();
      expect(result.current.published?.id).toBe(v2.id);
      expect(result.current.missed).toEqual([SCORES]);
      unmount();
    }
  });

  it("store behind: the relays' newer version joins the store, and nothing is missed", async () => {
    const v1 = signed(SHOULD, t);
    const v2 = signed(SHOULD, t + 100);
    eventStore.add(v1);
    h.held = { [SCORES]: [v2], [OUTBOX]: [v2] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    await waitFor(() => expect(result.current.published?.id).toBe(v2.id));
    expect(result.current.missed).toEqual([]);
    // The store learning v2 doesn't ask again.
    await new Promise((r) => setTimeout(r, 100));
    expect(h.asked).toEqual([[SCORES], [OUTBOX]]);
  });

  it("a relay holding nothing is named", async () => {
    const v = signed(SHOULD, t);
    eventStore.add(v);
    h.held = { [OUTBOX]: [v] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.missed).toEqual([SCORES]);
  });
});

describe("the store's copy isn't the baseline (H2-4)", () => {
  it("store ahead with the same self-entries (a version only a hint has): nothing to send, nothing offered", async () => {
    const v1 = signed(SHOULD, t);
    const v2 = signed(SHOULD, t + 100);
    eventStore.add(v2);
    h.held = { [SCORES]: [v1], [OUTBOX]: [v1] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.status).toBe("current");
    // The press reads v1 everywhere: nothing_to_change, and _missing finds none. "Nothing changed".
    expect(result.current.missed).toEqual([]);
  });

  it("store ahead with other self-entries: the press signs anew for every writer relay, so all are named", async () => {
    const v1 = signed([RANK], t);
    const v2 = signed(SHOULD, t + 100);
    eventStore.add(v2);
    h.held = { [SCORES]: [v1], [OUTBOX]: [v1] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.status).toBe("current");
    expect(result.current.missed).toEqual([SCORES, OUTBOX]);
  });

  it("off, no writer relay holds a version and the store has the empty one: nothing to send", async () => {
    eventStore.add(signed([], t));
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.missed).toEqual([]);
  });

  it("on, no writer relay holds a version the store found: a press signs one, so all are named", async () => {
    eventStore.add(signed(SHOULD, t));
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.missed).toEqual([SCORES, OUTBOX]);
  });
});

describe("only the Assistant's own kind 10040, verified, counts (V1-3)", () => {
  it("a later forged copy, or another author's, is nothing that relay holds", async () => {
    const v = signed(SHOULD, t);
    eventStore.add(v);
    const forged = { ...signed(SHOULD, t + 500), sig: "0".repeat(128) };
    const foreign = signed(SHOULD, t + 600, generateSecretKey());
    h.held = { [SCORES]: [forged, foreign], [OUTBOX]: [v] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    // As is_own reads it: the scores relay holds none, so the press re-sends v there, and only there.
    expect(result.current.missed).toEqual([SCORES]);
    expect(eventStore.getEvent(forged.id)).toBeUndefined();
    expect(eventStore.getEvent(foreign.id)).toBeUndefined();
  });

  it("a newer forged copy beside the genuine one: the relay holds none, as is_own reads its newest (B11)", async () => {
    const v = signed(SHOULD, t);
    eventStore.add(v);
    // v's signature over a later time: the relay's newest, and not the Assistant's own.
    const forged = { ...copy(v), created_at: t + 50 };
    h.held = { [SCORES]: [v, forged], [OUTBOX]: [v] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    // The press reads the scores relay's newest, finds it isn't the Assistant's own, and re-sends v there.
    expect(result.current.missed).toEqual([SCORES]);
  });
});

describe("when the probe asks", () => {
  it("never with no version found (H2-6)", async () => {
    h.getAssistantTreasureMap.mockResolvedValue(check(false, [SCORES, OUTBOX]));
    const { result } = probing();
    await waitFor(() => expect(result.current.status).toBe("missing"));
    await new Promise((r) => setTimeout(r, 100));
    expect(h.asked).toEqual([]);
    expect(result.current.checkingRelays).toBe(false);
  });

  it("never from a check that doesn't name the relays a press reads, which still loads (H2-10)", async () => {
    eventStore.add(signed(SHOULD, t));
    h.getAssistantTreasureMap.mockResolvedValue(check(true, undefined));
    const { result } = probing();
    await waitFor(() => expect(result.current.status).toBe("current"));
    await new Promise((r) => setTimeout(r, 100));
    expect(result.current.supported).toBe(true);
    expect(h.asked).toEqual([]);
    expect(result.current.missed).toEqual([]);
  });

  it("exactly the writer relays, never a hint", async () => {
    eventStore.add(signed(SHOULD, t));
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    await settledProbe();
    expect(h.asked).toEqual([[SCORES], [OUTBOX]]);
  });

  it("not where a page doesn't ask for it, nor while a press would sign anyway", async () => {
    eventStore.add(signed([RANK], t));
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const stale = probing();
    await waitFor(() => expect(stale.result.current.status).toBe("out-of-date"));
    const plain = renderHook(() => useAssistantTreasureMap("a".repeat(64)), { wrapper: wrapperFor(client()) });
    await waitFor(() => expect(plain.result.current.status).toBe("out-of-date"));
    await new Promise((r) => setTimeout(r, 100));
    expect(h.asked).toEqual([]);
  });

  it("an answer that a later version outdates stops counting: the version found is then out of date", async () => {
    const v1 = signed(SHOULD, t);
    eventStore.add(v1);
    h.held = { [OUTBOX]: [v1] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = await settledProbe();
    expect(result.current.missed).toEqual([SCORES]);
    await act(async () => {
      eventStore.add(signed([RANK], t + 100));
    });
    await waitFor(() => expect(result.current.status).toBe("out-of-date"));
    expect(result.current.missed).toEqual([]);
  });

  it("an answer being asked again doesn't count till it's back (on a page opened after its minute, say)", async () => {
    const v = signed(SHOULD, t);
    eventStore.add(v);
    h.held = { [OUTBOX]: [v] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const qc = client();
    const { result } = await settledProbe(qc);
    expect(result.current.missed).toEqual([SCORES]);
    h.held = { [SCORES]: [v], [OUTBOX]: [v] };
    h.delay = { [SCORES]: 300, [OUTBOX]: 300 };
    act(() => {
      void qc.invalidateQueries({ queryKey: ["assistant-treasure-map-held"] });
    });
    await waitFor(() => expect(result.current.checkingRelays).toBe(true));
    expect(result.current.missed).toEqual([]);
    await waitFor(() => expect(result.current.checkingRelays).toBe(false));
    expect(result.current.missed).toEqual([]);
  });

  it("asks nothing, and counts no miss, while the check is asked again, nor after that fails (A5)", async () => {
    const v = signed(SHOULD, t);
    eventStore.add(v);
    h.held = { [OUTBOX]: [v] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const qc = client();
    const { result } = await settledProbe(qc);
    expect(result.current.missed).toEqual([SCORES]);
    const asked = h.asked.length;
    // Asked again without an invalidation, as a mount after its 10 minutes or a reconnect asks it:
    // another device may have changed the choice, and with it the relays a press reads.
    let fail!: (e: unknown) => void;
    h.getAssistantTreasureMap.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    act(() => {
      void qc.refetchQueries({ queryKey: ["assistant-treasure-map", "a".repeat(64)] });
    });
    await waitFor(() => expect(result.current.missed).toEqual([]));
    await act(async () => fail(new AssistantRouteError(TOO_MANY, 422, true)));
    await waitFor(() => expect(result.current.error?.message).toBe(TOO_MANY));
    expect(result.current.missed).toEqual([]);
    expect(h.asked).toHaveLength(asked);
  });

  it("an answer stands a minute: a second visit asks again only after it (H2-12)", async () => {
    eventStore.add(signed(SHOULD, t));
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES]));
    const qc = client();
    const first = await settledProbe(qc);
    first.unmount();
    const second = probing(qc);
    await waitFor(() => expect(second.result.current.missed).toEqual([SCORES]));
    expect(h.asked).toEqual([[SCORES]]);
  });
});

describe("while the relays are being asked", () => {
  it("names a relay as soon as its answer shows the miss, and says it's still asking the rest (H2-3)", async () => {
    const v = signed(SHOULD, t);
    eventStore.add(v);
    h.held = { [SCORES]: [] };
    h.silent.add(OUTBOX);
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([SCORES]));
    expect(result.current.checkingRelays).toBe(true);
    // The silent one is given the press's 5 s, then left alone.
    await waitFor(() => expect(result.current.checkingRelays).toBe(false), { timeout: 7000 });
    expect(result.current.missed).toEqual([SCORES]);
  }, 10_000);

  it("never says nothing was missed before every relay has answered, though the read is still landing (V1-2)", async () => {
    const v1 = signed(SHOULD, t);
    const v2 = signed(SHOULD, t + 100); // an outbox relay's, same entries
    h.held = { [SCORES]: [v1], [OUTBOX]: [v2] };
    h.delay = { [OUTBOX]: 300 };
    h.read.mockImplementation(async () => {
      eventStore.add(copy(v1));
      await new Promise((r) => setTimeout(r, 600));
      eventStore.add(copy(v2));
      return [];
    });
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const seen: string[] = [];
    const { result } = renderHook(
      () => {
        const map = useAssistantTreasureMap("a".repeat(64), { probeRelays: true });
        seen.push(`status=${map.status} checking=${map.checkingRelays} missed=[${map.missed.join(",")}]`);
        return map;
      },
      { wrapper: wrapperFor(client()) },
    );
    await waitFor(() => expect(result.current.settled).toBe(true), { timeout: 3000 });
    expect(result.current.missed).toEqual([SCORES]);
    expect(seen).not.toContain("status=current checking=false missed=[]");
  });
});

describe("after a press", () => {
  const scoresMissed = async (on: boolean, writer: string[], should = SHOULD) => {
    const v = signed(on ? should : [], t);
    eventStore.add(v);
    h.held = Object.fromEntries(writer.filter((r) => r !== SCORES).map((r) => [r, [v]]));
    h.getAssistantTreasureMap.mockResolvedValue(check(on, writer, should));
    const hook = await settledProbe();
    expect(hook.result.current.missed).toEqual([SCORES]);
    h.asked = [];
    return { ...hook, v };
  };

  it("asks again once the check is back, and the answer doesn't wait for the relays", async () => {
    const { result, v } = await scoresMissed(true, [SCORES, OUTBOX]);
    h.setAssistantTreasureMap.mockResolvedValue({
      on: true,
      published: true,
      event: v,
      relays: [{ url: SCORES, ok: true }],
    });
    // The repair landed, but the relay answers only after the press has.
    h.held = { [SCORES]: [v], [OUTBOX]: [v] };
    h.delay = { [SCORES]: 300 };
    await act(async () => {
      await result.current.set(true);
    });
    await waitFor(() => expect(result.current.checkingRelays).toBe(true));
    // An answer from before the press isn't shown while it's asked again.
    expect(result.current.missed).toEqual([]);
    await waitFor(() => expect(result.current.checkingRelays).toBe(false));
    expect(result.current.missed).toEqual([]);
    expect(h.asked).toEqual([[SCORES], [OUTBOX]]);
  });

  it("asks nothing while the check is being asked again: its relays may be the other choice's (H2-2)", async () => {
    const both = [...SHOULD, ["30392", LISTS]];
    const { result } = await scoresMissed(true, [SCORES, OUTBOX, LISTS], both);
    let back!: () => void;
    h.getAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          back = () => resolve(check(false, [SCORES, OUTBOX], both));
        }),
    );
    const empty = signed([], t + 100);
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: true, event: empty, relays: [] });
    h.held = { [SCORES]: [empty], [OUTBOX]: [empty], [LISTS]: [] };
    // The press waits for the check it stood on; the relays aren't asked meanwhile.
    let answered = false;
    act(() => {
      void result.current.set(false).then(() => (answered = true));
    });
    // Its version is in, but its choice shows only once it answers, with the page it was made from.
    await waitFor(() => expect(result.current.found).toEqual([]));
    await new Promise((r) => setTimeout(r, 100));
    expect(answered).toBe(false);
    expect(result.current.on).toBe(true);
    expect(h.asked).toEqual([]);
    expect(result.current.missed).toEqual([SCORES]);
    expect(result.current.checkingRelays).toBe(false);
    await act(async () => back());
    await waitFor(() => expect(answered).toBe(true));
    expect(result.current.on).toBe(false);
    await waitFor(() => expect(h.asked.length).toBe(2));
    await waitFor(() => expect(result.current.checkingRelays).toBe(false));
    // Turn off's relays only: the lists relay, which Update now reads, isn't asked again (V1-4).
    expect(h.asked).toEqual([[SCORES], [OUTBOX]]);
    expect(result.current.missed).toEqual([]);
  });

  it("asks nothing after a Turn off whose check fails to come back: the cached one names Update now's relays (H2-2)", async () => {
    const both = [...SHOULD, ["30392", LISTS]];
    const v = signed(both, t);
    eventStore.add(v);
    h.held = { [SCORES]: [v], [OUTBOX]: [v], [LISTS]: [v] };
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX, LISTS], both));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 10 } } });
    const { result } = await settledProbe(qc);
    expect(result.current.missed).toEqual([]);
    h.asked = [];
    // Turn off publishes the empty version where Turn off reads; the lists relay keeps the old one.
    const empty = signed([], t + 100);
    h.held = { [SCORES]: [empty], [OUTBOX]: [empty], [LISTS]: [v] };
    h.setAssistantTreasureMap.mockResolvedValue({ on: false, published: true, event: empty, relays: [] });
    h.getAssistantTreasureMap.mockRejectedValue(new AssistantRouteError(MAP_502, 502, true));
    await act(async () => {
      await result.current.set(false).catch(() => {});
    });
    await waitFor(() => expect(result.current.error?.message).toBe(MAP_502));
    expect(result.current.on).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    // Asked, the lists relay would read as missed, and Turn off, which never reads it, as the repair.
    expect(h.asked).toEqual([]);
    expect(result.current.missed).toEqual([]);
  });

  it("while a press is under way, the miss it was made for stands, and nothing is asked", async () => {
    const { result, v } = await scoresMissed(true, [SCORES, OUTBOX]);
    let answer!: () => void;
    h.setAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ on: true, published: true, event: v, relays: [{ url: SCORES, ok: true }] });
        }),
    );
    let back!: () => void;
    h.getAssistantTreasureMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          back = () => resolve(check(true, [SCORES, OUTBOX]));
        }),
    );
    let answered = false;
    act(() => {
      void result.current.set(true).then(() => (answered = true));
    });
    await waitFor(() => expect(result.current.publishing).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.missed).toEqual([SCORES]);
    expect(result.current.checkingRelays).toBe(false);
    h.held = { [SCORES]: [v], [OUTBOX]: [v] };
    await act(async () => answer());
    // The POST has answered and the press waits on the check: the page is still the one it was made
    // from, so its button stays; nothing is asked.
    await new Promise((r) => setTimeout(r, 50));
    expect(answered).toBe(false);
    expect(result.current.missed).toEqual([SCORES]);
    expect(result.current.checkingRelays).toBe(false);
    expect(h.asked).toEqual([]);
    await act(async () => back());
    await waitFor(() => expect(answered).toBe(true));
    // Answered: what the relays held before the press is outdated by it, and they're asked anew.
    await waitFor(() => expect(h.asked.length).toBe(2));
    await waitFor(() => expect(result.current.checkingRelays).toBe(false));
    expect(result.current.missed).toEqual([]);
  });

  it("an answer still on its way when the press answered is asked again, not kept", async () => {
    const v = signed(SHOULD, t);
    eventStore.add(v);
    h.held = { [OUTBOX]: [v] };
    h.delay = { [SCORES]: 400 }; // still answering when the press lands
    h.getAssistantTreasureMap.mockResolvedValue(check(true, [SCORES, OUTBOX]));
    const { result } = probing();
    await waitFor(() => expect(result.current.missed).toEqual([]));
    await waitFor(() => expect(h.asked.length).toBe(2));
    h.setAssistantTreasureMap.mockResolvedValue({
      on: true,
      published: true,
      event: v,
      relays: [{ url: SCORES, ok: true }],
    });
    await act(async () => {
      await result.current.set(true);
    });
    // The repair reached it: what it sends from now on holds v.
    h.held = { [SCORES]: [v], [OUTBOX]: [v] };
    await waitFor(() => expect(h.asked.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(result.current.checkingRelays).toBe(false), { timeout: 3000 });
    expect(result.current.missed).toEqual([]);
  });
});
