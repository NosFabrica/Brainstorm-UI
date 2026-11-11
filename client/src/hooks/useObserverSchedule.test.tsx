/**
 * The schedule's decrypt asks the user (an extension prompt, a bunker round trip), so it
 * happens once per event and only when they ask, and a signer that failed can be asked
 * again. Reviewers' repro: the ask settling while the first decrypt was out started a
 * second one, with nobody having asked for either.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";

const SECRET = new Uint8Array(32).fill(7);
const PUBKEY = getPublicKey(SECRET);
const ck = nip44.getConversationKey(SECRET, PUBKEY);
const unasked = vi.fn();
let decryptCalls = 0;
let failNext = false;
let release: (() => void)[] = [];
// An extension- or bunker-like account (not a LocalAccount): every decrypt is a prompt or a round trip.
const account = {
  pubkey: PUBKEY,
  nip44: {
    encrypt: async (_: string, p: string) => nip44.encrypt(p, ck),
    decrypt: (_: string, c: string) => {
      decryptCalls++;
      const fail = failNext;
      failNext = false;
      return new Promise<string>((res, rej) =>
        release.push(() => (fail ? rej(new Error("bunker went quiet")) : res(nip44.decrypt(c, ck)))),
      );
    },
  },
};
vi.mock("applesauce-react/hooks", async (o) => ({
  ...(await o<typeof import("applesauce-react/hooks")>()),
  useActiveAccount: () => account,
}));
vi.mock("@/accounts/signing", async (o) => ({
  ...(await o<typeof import("@/accounts/signing")>()),
  canSignUnasked: (...a: unknown[]) => unasked(...a),
}));
let held: { event: unknown; loading: boolean; settled: boolean } = { event: undefined, loading: true, settled: false };
vi.mock("@/hooks/useStoreReplaceable", () => ({ useStoreReplaceable: () => held }));
const load = vi.fn();
vi.mock("@/services/observerSchedule", async (o) => ({
  ...(await o<typeof import("@/services/observerSchedule")>()),
  loadObserverSchedule: (...a: unknown[]) => load(...a),
}));

let useObserverSchedule: typeof import("./useObserverSchedule").useObserverSchedule;

const event = (createdAt = 2_000_000_000) =>
  finalizeEvent(
    {
      kind: 34817,
      created_at: createdAt,
      tags: [["d", "observer"]],
      content: nip44.encrypt(
        JSON.stringify([
          ["task", "observer"],
          ["cron", "0 6 * * *", "UTC"],
        ]),
        ck,
      ),
    },
    SECRET,
  );

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
const releaseAll = () =>
  act(async () => {
    const pending = release;
    release = [];
    pending.forEach((r) => r());
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  vi.resetModules();
  decryptCalls = 0;
  release = [];
  failNext = false;
  held = { event: undefined, loading: true, settled: false };
  load.mockReset().mockResolvedValue(undefined);
  ({ useObserverSchedule } = await import("./useObserverSchedule"));
});

describe("useObserverSchedule", () => {
  it("decrypts nothing for an extension or bunker until asked, then once, even as the ask settles", async () => {
    unasked.mockResolvedValue(false);
    const ev = event();
    const { result, rerender } = renderHook(() => useObserverSchedule());
    expect(result.current.status).toBe("loading");
    held = { event: ev, loading: false, settled: false };
    rerender();
    await flush();
    expect(result.current.status).toBe("locked");
    expect(decryptCalls).toBe(0);

    act(() => result.current.reveal());
    await flush();
    // EOSE while the decrypt is still out (the extension prompt is open).
    held = { event: ev, loading: false, settled: true };
    rerender();
    await flush();
    await releaseAll();
    expect(result.current.status).toBe("ready");
    expect(decryptCalls).toBe(1);
  });

  it("decrypts a key held here once on load, even when the ask settles while it is out", async () => {
    unasked.mockResolvedValue(true);
    const ev = event(2_000_000_001);
    const { result, rerender } = renderHook(() => useObserverSchedule());
    held = { event: ev, loading: false, settled: false };
    rerender();
    await flush();
    held = { event: ev, loading: false, settled: true };
    rerender();
    await flush();
    await releaseAll();
    expect(result.current).toMatchObject({ status: "ready", eventId: ev.id, createdAt: ev.created_at });
    expect(decryptCalls).toBe(1);
  });

  it("offers a retry when the signer fails, and asks again only then", async () => {
    unasked.mockResolvedValue(true);
    failNext = true;
    const ev = event(2_000_000_002);
    const { result, rerender } = renderHook(() => useObserverSchedule());
    held = { event: ev, loading: false, settled: true };
    rerender();
    await flush();
    await releaseAll();
    expect(result.current.status).toBe("failed");
    expect(decryptCalls).toBe(1);

    act(() => result.current.reveal());
    await flush();
    await releaseAll();
    expect(result.current.status).toBe("ready");
    expect(decryptCalls).toBe(2);
  });

  it("asks the relays again when the page is shown again, at most once a minute", async () => {
    unasked.mockResolvedValue(true);
    held = { event: undefined, loading: false, settled: true };
    const { result } = renderHook(() => useObserverSchedule());
    await flush();
    expect(result.current.status).toBe("none");
    expect(result.current.checkedAt).not.toBeNull();
    const shown = () =>
      act(async () => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((r) => setTimeout(r, 0));
      });
    await shown();
    expect(load).toHaveBeenCalledTimes(1);
    await shown();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps its answer's identity until something in it changes", async () => {
    unasked.mockResolvedValue(true);
    held = { event: event(), loading: false, settled: true };
    const { result, rerender } = renderHook(() => useObserverSchedule());
    await flush();
    await releaseAll();
    expect(result.current.status).toBe("ready");
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);

    held = { event: undefined, loading: true, settled: false };
    rerender();
    const loading = result.current;
    expect(loading.status).toBe("loading");
    rerender();
    expect(result.current).toBe(loading);
  });
});
