// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, type NostrEvent } from "nostr-tools";
import type { SealSigner } from "@/lib/dm/giftWrap";
import type { DmMessage } from "@/lib/dm/store";
import { Outbox, type OutboxDeps, type OutboxHost } from "./outbox";
import type { DmEngineState, PublishResult } from "./engine";
import { coreFor, plainSealer, settle } from "./test-fakes";

function person() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const sealSigner: SealSigner = {
    pubkey,
    encrypt: async (to, text) => nip44.encrypt(text, nip44.getConversationKey(sk, to)),
    signSeal: async (t) => finalizeEvent(t, sk),
  };
  return { pubkey, sealSigner };
}

const MINE = "wss://mine.example/";
const ANAS = "wss://ana.example/";

function setup(opts: { inboxes?: Record<string, string[]>; answer?: (relay: string) => PublishResult } = {}) {
  const me = person();
  const ana = person();
  const inboxes = opts.inboxes ?? { [ana.pubkey]: [ANAS] };
  const published: { relay: string; event: NostrEvent }[] = [];
  const authWatchers = new Map<string, () => void>();
  const stopped: string[] = [];
  const deps: OutboxDeps = {
    transport: {
      publish: async (relay, event) => {
        published.push({ relay, event });
        return opts.answer?.(relay) ?? { ok: true };
      },
      onAuthenticated: (relay, cb) => {
        authWatchers.set(relay, cb);
        return () => void stopped.push(relay);
      },
    },
    loadInbox: async (pk) => ({ relays: inboxes[pk] ?? [], found: !!inboxes[pk] }),
    sealer: plainSealer,
  };
  const calls: string[] = [];
  const kept: DmMessage[] = [];
  const failed: string[] = [];
  let status: DmEngineState["status"] = "ready";
  let inbox = [MINE];
  const host: OutboxHost = {
    status: () => status,
    whenStarted: () => undefined,
    inbox: () => inbox,
    beginSeal: () => void calls.push("beginSeal"),
    endSeal: () => void calls.push("endSeal"),
    keepOpened: async (m) => void kept.push(m),
    keepFailed: (wrapId) => void failed.push(wrapId),
    scheduleState: () => void calls.push("scheduleState"),
  };
  const { core } = coreFor(me.pubkey);
  const account = { sealSigner: me.sealSigner, classify: () => "refused" as const };
  const outbox = new Outbox(core, account, deps, host);
  return {
    me,
    ana,
    core,
    deps,
    host,
    outbox,
    published,
    authWatchers,
    stopped,
    calls,
    kept,
    failed,
    room: [me.pubkey, ana.pubkey].sort().join(","),
    setStatus: (s: DmEngineState["status"]) => (status = s),
    setInbox: (relays: string[]) => (inbox = relays),
  };
}

describe("Outbox", () => {
  it("sends one wrap per recipient and one to the reader's own inbox", async () => {
    const t = setup();
    const result = await t.outbox.send(t.room, " hello ");
    expect(result.ok).toBe(true);
    expect(result.message?.rumor.content).toBe("hello");
    expect(result.message?.outgoing?.status).toBe("sent");
    expect(t.published.map((p) => p.relay).sort()).toEqual([ANAS, MINE].sort());
    // The reader's copy is the one the engine already knows, so it isn't opened again.
    const mine = t.published.find((p) => p.relay === MINE)!.event;
    expect(t.core.seen.has(mine.id)).toBe(true);
    expect(t.core.wrapToMessage.get(mine.id)).toBe(result.message!.id);
    expect(t.calls.slice(0, 2)).toEqual(["beginSeal", "endSeal"]);
    await settle();
    expect(t.kept.map((m) => m.id)).toEqual([result.message!.id]);
  });

  it("refuses what it can't send", async () => {
    const t = setup({ inboxes: {} });
    expect(await t.outbox.send(t.room, "  ")).toEqual({ ok: false, error: "Nothing to send" });
    expect(await t.outbox.send(t.room, "hi")).toEqual({
      ok: false,
      missing: [t.ana.pubkey],
      error: "Some people have no inbox relays yet.",
    });
    t.setInbox([]);
    expect((await t.outbox.send(t.room, "hi")).error).toBe("Set up your inbox relays first.");
    const unsigned = new Outbox(t.core, { sealSigner: undefined, classify: () => "refused" }, t.deps, t.host);
    expect((await unsigned.send(t.room, "hi")).error).toBe("Your signer can't encrypt private messages (NIP-44).");
    expect(t.published).toHaveLength(0);
  });

  it("gives every message a later created_at than the last", async () => {
    const t = setup();
    const a = await t.outbox.send(t.room, "same");
    const b = await t.outbox.send(t.room, "same");
    expect(b.message!.createdAt).toBe(a.message!.createdAt + 1);
    expect(b.message!.id).not.toBe(a.message!.id);
  });

  it("keeps an undelivered message, seals it for the device, and brings it back", async () => {
    const t = setup({ answer: (relay) => (relay === ANAS ? { ok: false, message: "down" } : { ok: true }) });
    const result = await t.outbox.send(t.room, "later");
    await settle();
    expect(t.core.store.message(result.message!.id)?.outgoing?.status).toBe("failed");
    expect(t.calls).toContain("scheduleState");

    const sealed = await t.outbox.seal();
    expect(sealed).toMatch(/^sealed:/);

    const again = coreFor(t.me.pubkey);
    const restored = new Outbox(again.core, { sealSigner: t.me.sealSigner, classify: () => "refused" }, t.deps, t.host);
    await restored.restore(sealed!);
    const back = again.core.store.message(result.message!.id);
    expect(back?.rumor.content).toBe("later");
    expect(back?.outgoing?.status).toBe("failed");
    expect(again.core.seen.has(back!.wrapId)).toBe(true);
    expect(await restored.seal()).toBe(sealed);
  });

  it("retries the outbox only once the engine is ready, a bounded number of times", async () => {
    const t = setup({ answer: (relay) => (relay === ANAS ? { ok: false, message: "down" } : { ok: true }) });
    await t.outbox.send(t.room, "later");
    await settle();
    const resend = vi.spyOn(t.outbox, "resend");

    t.setStatus("starting");
    t.outbox.flushOutbox();
    expect(resend).not.toHaveBeenCalled();

    t.setStatus("ready");
    for (let i = 0; i < 12; i++) {
      t.outbox.flushOutbox();
      await settle();
    }
    expect(resend).toHaveBeenCalledTimes(10);

    t.outbox.resetAttempts();
    t.outbox.flushOutbox();
    expect(resend).toHaveBeenCalledTimes(11);
  });

  it("discards a failed message, and remembers its wrap so it doesn't come back", async () => {
    const t = setup({ answer: (relay) => (relay === ANAS ? { ok: false, message: "down" } : { ok: true }) });
    const { message } = await t.outbox.send(t.room, "oops");
    await settle();
    t.outbox.discard(message!.id);
    expect(t.core.store.message(message!.id)).toBeUndefined();
    expect(message!.wrapId).not.toBe("");
    expect(t.failed).toEqual([message!.wrapId]);
    expect(await t.outbox.seal()).toBeUndefined();
  });

  it("resends what a relay refused for want of a login once it signs the reader in", async () => {
    let gated = true;
    const t = setup({
      answer: (relay) => (relay === ANAS && gated ? { ok: false, auth: true, message: "auth-required" } : { ok: true }),
    });
    const { message } = await t.outbox.send(t.room, "let me in");
    await settle();
    expect(t.outbox.sendAuth()).toEqual([ANAS]);
    expect(t.core.store.message(message!.id)?.outgoing?.status).toBe("failed");

    gated = false;
    t.authWatchers.get(ANAS)!();
    await vi.waitFor(() => expect(t.core.store.message(message!.id)?.outgoing?.status).toBe("sent"));
    expect(t.outbox.sendAuth()).toEqual([]);
    expect(t.stopped).toEqual([ANAS]);
  });

  it("stops watching every relay's login on stop", async () => {
    const t = setup({ answer: (relay) => (relay === ANAS ? { ok: false, auth: true } : { ok: true }) });
    await t.outbox.send(t.room, "hi");
    await settle();
    t.core.stopped = true;
    t.outbox.stop();
    expect(t.stopped).toEqual([ANAS]);
    expect(t.outbox.sendAuth()).toEqual([]);
  });
});
