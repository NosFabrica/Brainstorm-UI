// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, type NostrEvent } from "nostr-tools";
import { CHAT_KIND, makeRumor, wrapRumor, type SealSigner } from "@/lib/dm/giftWrap";
import type { DmMessage } from "@/lib/dm/store";
import { WrapOpener, openFirst, type Queued, type WrapOpenerHost } from "./wrapOpener";
import type { DmAccount } from "./engine";
import { coreFor, NOW, settle } from "./test-fakes";

function person() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const sealSigner: SealSigner = {
    pubkey,
    encrypt: async (to, text) => nip44.encrypt(text, nip44.getConversationKey(sk, to)),
    signSeal: async (t) => finalizeEvent(t, sk),
  };
  const decrypt = async (from: string, text: string) => nip44.decrypt(text, nip44.getConversationKey(sk, from));
  const account = (over: Partial<DmAccount> = {}): DmAccount => ({
    pubkey,
    decrypt,
    sealSigner,
    canOpenInBackground: async () => true,
    classify: () => "broken",
    ...over,
  });
  return { pubkey, sealSigner, account };
}

async function wrapFrom(from: ReturnType<typeof person>, to: string, content: string, at: number, tags = [["p", to]]) {
  const rumor = makeRumor({ pubkey: from.pubkey, kind: CHAT_KIND, tags, content, created_at: at });
  return wrapRumor(rumor, to, from.sealSigner, { at, random: () => 0 });
}

function host() {
  const failed: [string, string][] = [];
  const kept: DmMessage[] = [];
  let drained = 0;
  const h: WrapOpenerHost = {
    keepFailed: (wrapId, _at, reason) => void failed.push([wrapId, reason]),
    keepOpened: async (m) => void kept.push(m),
    onDrained: () => void drained++,
  };
  return { h, failed, kept, drained: () => drained };
}

const eventually = (check: () => void) => vi.waitFor(check, { timeout: 5000, interval: 5 });

describe("openFirst", () => {
  const q = (at: number, refusals = 0): Queued => ({
    wrap: { created_at: at } as NostrEvent,
    relays: new Set(),
    refusals,
    openedAtRefusal: 0,
  });
  it("puts the newest first, and a wrap the signer turned down behind the rest", () => {
    expect(openFirst(q(2), q(1))).toBe(true);
    expect(openFirst(q(1), q(2))).toBe(false);
    expect(openFirst(q(9, 1), q(1))).toBe(false);
  });
});

describe("WrapOpener", () => {
  it("waits for the reader before asking the signer, then opens newest first", async () => {
    const me = person();
    const ana = person();
    const decrypt = vi.fn(me.account().decrypt!);
    const { core } = coreFor(me.pubkey);
    const { h, kept, drained } = host();
    const opener = new WrapOpener(core, me.account({ decrypt }), {}, h);

    opener.enqueue(await wrapFrom(ana, me.pubkey, "older", NOW - 20), "wss://in.example/");
    opener.enqueue(await wrapFrom(ana, me.pubkey, "newer", NOW - 10), "wss://in.example/");
    expect(opener.pause).toBe("waiting");
    expect(opener.waiting).toBe(2);
    expect(decrypt).not.toHaveBeenCalled();

    opener.permit();
    await eventually(() => expect(kept).toHaveLength(2));
    // One at a time until the first opens, so "newer" went first.
    expect(kept.map((m) => m.rumor.content)).toEqual(["newer", "older"]);
    expect(opener.opened).toBe(2);
    expect(opener.waiting).toBe(0);
    expect(opener.pause).toBeUndefined();
    expect(drained()).toBeGreaterThan(0);
  });

  it("opens unasked only when the signer can", async () => {
    const me = person();
    const { core } = coreFor(me.pubkey);
    const quiet = new WrapOpener(core, me.account({ canOpenInBackground: async () => false }), {}, host().h);
    quiet.start();
    const silent = new WrapOpener(core, me.account(), {}, host().h);
    silent.start();
    await settle();
    const ana = person();
    const wrap = await wrapFrom(ana, me.pubkey, "hi", NOW);
    quiet.enqueue(wrap, "wss://in.example/");
    expect(quiet.pause).toBe("waiting");
    silent.enqueue(wrap, "wss://in.example/");
    expect(silent.pause).toBeUndefined();
  });

  it("holds without NIP-44", () => {
    const me = person();
    const { core } = coreFor(me.pubkey);
    const opener = new WrapOpener(core, me.account({ decrypt: undefined }), {}, host().h);
    opener.start();
    expect(opener.pause).toBe("no-nip44");
    opener.permit();
    expect(opener.pause).toBe("no-nip44");
  });

  it("counts a copy that arrives while queued once, with both relays", async () => {
    const me = person();
    const ana = person();
    const { core } = coreFor(me.pubkey);
    const opener = new WrapOpener(core, me.account(), {}, host().h);
    const wrap = await wrapFrom(ana, me.pubkey, "hi", NOW);
    opener.enqueue(wrap, "wss://a.example/");
    opener.enqueue(wrap, "wss://b.example/");
    expect(opener.waiting).toBe(1);
    expect(Object.fromEntries(opener.unopenedByRelay())).toEqual({ "wss://a.example/": 1, "wss://b.example/": 1 });
  });

  it("opens nothing while a message is being sealed to send", async () => {
    const me = person();
    const ana = person();
    const { core } = coreFor(me.pubkey);
    const { h, kept } = host();
    const opener = new WrapOpener(core, me.account(), {}, h);
    opener.permit();
    opener.beginSeal();
    opener.enqueue(await wrapFrom(ana, me.pubkey, "hi", NOW), "wss://in.example/");
    await settle();
    expect(opener.waiting).toBe(1);
    opener.endSeal();
    await eventually(() => expect(kept).toHaveLength(1));
  });

  it("remembers a wrap that isn't for the reader as skipped, and a broken one as broken", async () => {
    const me = person();
    const ana = person();
    const jun = person();
    const { core } = coreFor(me.pubkey);
    const { h, failed } = host();
    const opener = new WrapOpener(core, me.account(), {}, h);
    opener.permit();
    // Wrapped to me, but the rumor names someone else: not a room the reader is in.
    const stray = await wrapFrom(ana, me.pubkey, "not yours", NOW, [["p", jun.pubkey]]);
    const broken: NostrEvent = { ...(await wrapFrom(ana, me.pubkey, "x", NOW - 1)), content: "garbage" };
    opener.enqueue(stray, "wss://in.example/");
    opener.enqueue(broken, "wss://in.example/");
    await eventually(() => expect(failed).toHaveLength(2));
    expect(failed).toContainEqual([stray.id, "skipped"]);
    expect(failed).toContainEqual([broken.id, "broken"]);
    expect(opener.failedCount).toBe(1);
    expect(core.seen.has(broken.id)).toBe(true);
  });

  it("holds everything when the signer says no, with its words, until the reader asks again", async () => {
    const me = person();
    const ana = person();
    let refuse = true;
    const real = me.account().decrypt!;
    const account = me.account({
      decrypt: (from, text) => (refuse ? Promise.reject(new Error("permission denied")) : real(from, text)),
      classify: () => "refused",
      explain: (e) => (e as Error).message,
    });
    const { core } = coreFor(me.pubkey);
    const { h, kept } = host();
    const opener = new WrapOpener(core, account, {}, h);
    opener.permit();
    opener.enqueue(await wrapFrom(ana, me.pubkey, "hi", NOW), "wss://in.example/");
    await eventually(() => expect(opener.pause).toBe("refused"));
    expect(opener.detail).toBe("permission denied");
    expect(opener.waiting).toBe(1);

    refuse = false;
    opener.permit();
    await eventually(() => expect(kept).toHaveLength(1));
  });

  it("takes the slot back from a signer that never answers, and resumes by itself", async () => {
    const me = person();
    const ana = person();
    let answer = false;
    const real = me.account().decrypt!;
    const account = me.account({
      decrypt: (from, text) => (answer ? real(from, text) : new Promise<string>(() => {})),
    });
    const { core, timers } = coreFor(me.pubkey);
    const { h, kept } = host();
    const opener = new WrapOpener(core, account, { decryptTimeoutMs: 10_000 }, h);
    opener.permit();
    opener.enqueue(await wrapFrom(ana, me.pubkey, "hi", NOW), "wss://in.example/");
    await settle();
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([10_000]);

    timers.flush(); // the deadline
    await eventually(() => expect(opener.pause).toBe("unreachable"));
    expect(opener.waiting).toBe(1);
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([5_000]);

    answer = true;
    timers.flush(); // the resume
    await eventually(() => expect(kept).toHaveLength(1));
    expect(opener.pause).toBeUndefined();
  });

  it("backs off after 'rate limited' without bothering the reader", async () => {
    const me = person();
    const ana = person();
    let limited = true;
    const real = me.account().decrypt!;
    const account = me.account({
      decrypt: (from, text) => (limited ? Promise.reject(new Error("rate limited")) : real(from, text)),
      classify: () => "rate-limited",
    });
    const { core, timers } = coreFor(me.pubkey);
    const { h, kept } = host();
    const opener = new WrapOpener(core, account, {}, h);
    opener.permit();
    opener.enqueue(await wrapFrom(ana, me.pubkey, "hi", NOW), "wss://in.example/");
    await eventually(() => expect([...timers.pending.values()].map((t) => t.ms)).toContain(2_000));
    expect(opener.pause).toBeUndefined();
    expect(opener.waiting).toBe(1);

    limited = false;
    for (const [id, t] of timers.pending) {
      if (t.ms !== 2_000) continue;
      timers.pending.delete(id);
      t.fn();
    }
    await eventually(() => expect(kept).toHaveLength(1));
  });

  it("names the oldest wrap not opened yet", async () => {
    const me = person();
    const ana = person();
    const { core } = coreFor(me.pubkey);
    const opener = new WrapOpener(core, me.account(), {}, host().h);
    opener.enqueue(await wrapFrom(ana, me.pubkey, "a", NOW - 50), "wss://in.example/");
    opener.enqueue(await wrapFrom(ana, me.pubkey, "b", NOW - 5), "wss://in.example/");
    expect(opener.oldestWaiting(NOW)).toBe(NOW - 50);
    expect(opener.oldestWaiting(NOW - 100)).toBe(NOW - 100);
  });

  it("stops: the queue is dropped and nothing more opens", async () => {
    const me = person();
    const ana = person();
    const decrypt = vi.fn(me.account().decrypt!);
    const { core } = coreFor(me.pubkey);
    const opener = new WrapOpener(core, me.account({ decrypt }), {}, host().h);
    opener.enqueue(await wrapFrom(ana, me.pubkey, "hi", NOW), "wss://in.example/");
    core.stopped = true;
    opener.stop();
    opener.permit();
    await settle();
    expect(opener.waiting).toBe(0);
    expect(decrypt).not.toHaveBeenCalled();
  });
});
