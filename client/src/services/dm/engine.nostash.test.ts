// @vitest-environment node
/**
 * The inbox over Nostash, end to end: the real extension account and engine options
 * (services/dm), Nostash's background page as it behaves (accounts/nostash-fake: a
 * failed decrypt is never answered, one reply slot), and Web Locks shared by tabs.
 * The PR #188 audit found what only this whole path shows: a second wrap waiting
 * behind a silent one ran out the engine's deadline before it was asked, paused the
 * inbox as "unreachable", and the extension's verdict on the wrap was thrown away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, type NostrEvent } from "nostr-tools";

import { BrainstormExtensionAccount } from "@/accounts/extension";
import { fakeLockManager, fakeNostash } from "@/accounts/nostash-fake";
import { CHAT_KIND, GIFT_WRAP_KIND, makeRumor, wrapRumor, type SealSigner } from "@/lib/dm/giftWrap";
import { dmAccountFor, engineOptionsFor } from "@/services/dm";
import { DmEngine, type DmTransport, type WrapFilter } from "./engine";

vi.mock("@/lib/queryClient", () => ({ queryClient: { clear: () => {} } }));
vi.mock("@/services/api", () => ({ apiClient: {} }));

const RELAY = "wss://inbox.example/";

function person() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const sealSigner: SealSigner = {
    pubkey,
    encrypt: async (to, text) => nip44.encrypt(text, nip44.getConversationKey(sk, to)),
    signSeal: async (t) => finalizeEvent(t, sk),
  };
  return { sk, pubkey, sealSigner };
}

/** A wrap addressed to `to` that its key can't open: sealed for someone else (spam, a broken client). */
function unreadableWrap(to: string, at: number): NostrEvent {
  const throwaway = generateSecretKey();
  const content = nip44.encrypt(
    "x".repeat(200),
    nip44.getConversationKey(throwaway, getPublicKey(generateSecretKey())),
  );
  return finalizeEvent({ kind: GIFT_WRAP_KIND, created_at: at, tags: [["p", to]], content }, throwaway);
}

function relayHolding(events: NostrEvent[]): DmTransport {
  const matches = (e: NostrEvent, f: WrapFilter) =>
    f.kinds.includes(e.kind) &&
    e.tags.some((t) => t[0] === "p" && f["#p"].includes(t[1])) &&
    (f.since === undefined || e.created_at >= f.since) &&
    (f.until === undefined || e.created_at <= f.until);
  return {
    live(_relay, filter, h) {
      for (const e of events) if (matches(e, filter)) h.onEvent(e);
      h.onEose();
      return () => {};
    },
    page(_relay, _filter, h) {
      queueMicrotask(() => h.onEose());
      return () => {};
    },
    publish: async () => ({ ok: true }),
    onAuthenticated: () => () => {},
  };
}

async function inbox(me: ReturnType<typeof person>) {
  const ana = person();
  const now = Math.floor(Date.now() / 1000);
  const good = [];
  for (let i = 0; i < 3; i++) {
    const rumor = makeRumor({
      pubkey: ana.pubkey,
      kind: CHAT_KIND,
      tags: [["p", me.pubkey]],
      content: `hi ${i}`,
      created_at: now - 30 - i,
    });
    good.push(await wrapRumor(rumor, me.pubkey, ana.sealSigner, { at: now - 30 - i, random: () => 0 }));
  }
  // Older than the good ones: the engine opens newest first, so the signer has answered quickly by then.
  const bad = [unreadableWrap(me.pubkey, now - 120), unreadableWrap(me.pubkey, now - 121)];
  return [...good, ...bad];
}

function tab(me: ReturnType<typeof person>, wraps: NostrEvent[]) {
  const account = new BrainstormExtensionAccount(me.pubkey);
  const engine = new DmEngine(dmAccountFor(account), {
    ...engineOptionsFor(account),
    transport: relayHolding(wraps),
    loadInbox: async () => ({ relays: [RELAY], found: true }),
  });
  const pauses: string[] = [];
  engine.subscribe(() => {
    const p = engine.state().paused;
    if (p && p !== "waiting") pauses.push(p);
  });
  return { engine, pauses };
}

/** A window with the extension in it, and the bits the engine listens on. */
const stubWindow = (nostr: unknown) =>
  vi.stubGlobal("window", { nostr, addEventListener: () => {}, removeEventListener: () => {} });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as { window?: unknown }).window;
});

async function run(ms: number) {
  for (let t = 0; t < ms; t += 1_000) await vi.advanceTimersByTimeAsync(1_000);
}

describe("an inbox over Nostash with wraps it can't open", () => {
  it("opens every message and sets each unreadable wrap aside, without pausing", async () => {
    const me = person();
    stubWindow(fakeNostash(me.sk).nostr);
    vi.stubGlobal("navigator", { locks: fakeLockManager() });
    const { engine, pauses } = tab(me, await inbox(me));
    await engine.start();
    engine.allowDecrypt();
    await run(3 * 60_000);
    expect(pauses).toEqual([]);
    expect(engine.state()).toMatchObject({ queued: 0, failed: 2, paused: undefined });
    expect(
      engine.store
        .rooms()[0]
        ?.messages.map((m) => m.rumor.content)
        .sort(),
    ).toEqual(["hi 0", "hi 1", "hi 2"]);
    engine.stop();
  });

  it("does the same in two tabs at once, sharing the extension through the lock", async () => {
    const me = person();
    stubWindow(fakeNostash(me.sk).nostr);
    vi.stubGlobal("navigator", { locks: fakeLockManager() });
    const wraps = await inbox(me);
    const tabs = [tab(me, wraps), tab(me, wraps)];
    for (const t of tabs) {
      await t.engine.start();
      t.engine.allowDecrypt();
    }
    await run(5 * 60_000);
    for (const { engine, pauses } of tabs) {
      expect(pauses).toEqual([]);
      expect(engine.state()).toMatchObject({ queued: 0, failed: 2 });
      expect(engine.store.rooms()[0]?.messages).toHaveLength(3);
      engine.stop();
    }
  });

  it("never sets aside a good message whose request was lost once", async () => {
    const me = person();
    let lost = 0;
    const wraps = await inbox(me);
    // The 3rd request to reach Nostash (a good wrap's) vanishes, as when Safari unloads the extension.
    stubWindow(fakeNostash(me.sk, { lose: () => ++lost === 3 }).nostr);
    vi.stubGlobal("navigator", { locks: fakeLockManager() });
    const { engine } = tab(me, wraps.slice(0, 3));
    await engine.start();
    engine.allowDecrypt();
    await run(2 * 60_000);
    expect(engine.state()).toMatchObject({ queued: 0, failed: 0 });
    expect(engine.store.rooms()[0]?.messages).toHaveLength(3);
    engine.stop();
  });
});
