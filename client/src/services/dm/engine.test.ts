// @vitest-environment node
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, type NostrEvent } from "nostr-tools";
import {
  DmEngine,
  LIVE_TAIL_SECONDS,
  type DmAccount,
  type DmTransport,
  type LiveHandlers,
  type WrapFilter,
} from "./engine";
import { CHAT_KIND, WRAP_JITTER_SECONDS, makeRumor, wrapRumor, type SealSigner } from "@/lib/dm/giftWrap";
import type { PageHandlers } from "@/lib/dm/pager";
import { wrapKey, type DmCacheBackend, type DmState, type Sealer, type StoredWrap } from "@/lib/dm/cache";
import { roomKey } from "@/lib/dm/rooms";

const NOW = 1_800_000_000;

function person() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const sealSigner: SealSigner = {
    pubkey,
    encrypt: async (to, text) => nip44.encrypt(text, nip44.getConversationKey(sk, to)),
    signSeal: async (t) => finalizeEvent(t, sk),
  };
  const account = (over: Partial<DmAccount> = {}): DmAccount => ({
    pubkey,
    decrypt: async (from, text) => nip44.decrypt(text, nip44.getConversationKey(sk, from)),
    sealSigner,
    canOpenInBackground: async () => true,
    classify: () => "broken",
    ...over,
  });
  return { sk, pubkey, sealSigner, account };
}

/** Relays in memory: what each holds, what was asked, what was published. */
function network(inboxes: Record<string, string[]>) {
  const held = new Map<string, NostrEvent[]>();
  const live = new Map<string, { filter: WrapFilter; h: LiveHandlers }>();
  const pages: { relay: string; filter: WrapFilter }[] = [];
  const published: { relay: string; event: NostrEvent }[] = [];
  const hold = (relay: string, event: NostrEvent) => held.set(relay, [...(held.get(relay) ?? []), event]);
  const matches = (e: NostrEvent, f: WrapFilter) =>
    f.kinds.includes(e.kind) &&
    e.tags.some((t) => t[0] === "p" && f["#p"].includes(t[1])) &&
    (f.since === undefined || e.created_at >= f.since) &&
    (f.until === undefined || e.created_at <= f.until);
  const transport: DmTransport = {
    live(relay, filter, h) {
      live.set(relay, { filter, h });
      for (const e of held.get(relay) ?? []) if (matches(e, filter)) h.onEvent(e);
      h.onEose();
      return () => live.delete(relay);
    },
    page(relay, filter, h: PageHandlers) {
      pages.push({ relay, filter });
      const found = (held.get(relay) ?? [])
        .filter((e) => matches(e, filter))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, filter.limit);
      queueMicrotask(() => {
        found.forEach((e) => h.onEvent(e));
        h.onEose();
      });
      return () => {};
    },
    async publish(relay, event) {
      published.push({ relay, event });
      hold(relay, event);
      const sub = live.get(relay);
      if (sub && matches(event, sub.filter)) sub.h.onEvent(event);
      return { ok: true };
    },
    onAuthenticated: () => () => {},
  };
  const loadInbox = async (pubkey: string) => ({ relays: inboxes[pubkey] ?? [], found: !!inboxes[pubkey] });
  return { transport, loadInbox, hold, held, pages, published, live };
}

function memoryCache(): DmCacheBackend & { rows: Map<string, StoredWrap>; st: Map<string, DmState> } {
  const rows = new Map<string, StoredWrap>();
  const st = new Map<string, DmState>();
  return {
    rows,
    st,
    wraps: async (owner) => [...rows.values()].filter((r) => r.owner === owner),
    putWraps: async (list) => list.forEach((r) => rows.set(r.key, r)),
    deleteWraps: async (keys) => keys.forEach((k) => rows.delete(k)),
    state: async (owner) => st.get(owner),
    putState: async (s) => void st.set(s.owner, s),
    clear: async () => {
      rows.clear();
      st.clear();
    },
  };
}

const plainSealer: Sealer = { supported: () => true, seal: async (t) => `sealed:${t}`, open: async (e) => e.slice(7) };

/** Timers the test runs by hand; the engine never sleeps on its own. */
function clock() {
  const timers: (() => void)[] = [];
  return {
    setTimer: (fn: () => void) => timers.push(fn),
    clearTimer: () => {},
    setRepeating: () => 0,
    clearRepeating: () => {},
    flush: () => timers.splice(0).forEach((fn) => fn()),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

async function wrapFrom(from: ReturnType<typeof person>, to: string, content: string, at: number, wrapAt?: number) {
  const rumor = makeRumor({ pubkey: from.pubkey, kind: CHAT_KIND, tags: [["p", to]], content, created_at: at });
  const random = wrapAt === undefined ? () => 0 : () => (at - wrapAt) / WRAP_JITTER_SECONDS;
  return wrapRumor(rumor, to, from.sealSigner, { at, random });
}

describe("DmEngine", () => {
  it("opens the live tail at sign-in and groups messages into rooms", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "hello", NOW - 60));
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();

    const live = net.live.get("wss://in.example/")!;
    expect(live.filter.since).toBe(NOW - LIVE_TAIL_SECONDS - WRAP_JITTER_SECONDS);
    expect(live.filter.until).toBeUndefined();
    const rooms = engine.store.rooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].key).toBe(roomKey([me.pubkey, ana.pubkey]));
    expect(rooms[0].last?.rumor.content).toBe("hello");
    expect(engine.state()).toMatchObject({ status: "ready", liveSynced: true, queued: 0 });
  });

  it("reports an account with no inbox relays instead of guessing", async () => {
    const me = person();
    const net = network({});
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    expect(engine.state().status).toBe("no-inbox");
    expect(net.live.size).toBe(0);
  });

  it("waits for the reader before an external signer opens anything", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "hi", NOW - 60));
    const engine = new DmEngine(me.account({ canOpenInBackground: async () => false }), {
      ...net,
      ...clock(),
      now: () => NOW,
    });
    await engine.start();
    await settle();
    expect(engine.state()).toMatchObject({ queued: 1, paused: "waiting" });
    expect(engine.store.rooms()).toHaveLength(0);
    engine.allowDecrypt();
    await settle();
    expect(engine.store.rooms()).toHaveLength(1);
  });

  it("pages history per relay below the live floor, only when asked", async () => {
    const me = person();
    const old = person();
    const net = network({ [me.pubkey]: ["wss://a.example/", "wss://b.example/"] });
    net.hold("wss://a.example/", await wrapFrom(old, me.pubkey, "from last month", NOW - 30 * 86400));
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    expect(engine.store.rooms()).toHaveLength(0);
    expect(net.pages).toHaveLength(0);

    expect(engine.advance("wss://a.example/")).toBe(true);
    await settle();
    await settle();
    expect(net.pages[0]).toMatchObject({
      relay: "wss://a.example/",
      filter: { until: NOW - LIVE_TAIL_SECONDS, limit: 500 },
    });
    expect(engine.store.rooms()[0].last?.rumor.content).toBe("from last month");
    const a = engine.state().history.relays.find((r) => r.url === "wss://a.example/")!;
    expect(a.state).toBe("idle");
    expect(a.completeTo).toBe(NOW - 30 * 86400 + WRAP_JITTER_SECONDS);
    const b = engine.state().history.relays.find((r) => r.url === "wss://b.example/")!;
    expect(b.state).toBe("idle");
    expect(b.pages).toBe(0);
  });

  it("sends one wrap per recipient to their inbox, plus a copy to the sender's", async () => {
    const me = person();
    const ana = person();
    const jun = person();
    const net = network({
      [me.pubkey]: ["wss://mine.example/"],
      [ana.pubkey]: ["wss://ana.example/"],
      [jun.pubkey]: ["wss://jun.example/"],
    });
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();

    const room = roomKey([me.pubkey, ana.pubkey, jun.pubkey]);
    const result = await engine.send(room, " Plans for Friday? ", { subject: "Friday" });
    expect(result.ok).toBe(true);
    expect(net.published.map((p) => p.relay).sort()).toEqual([
      "wss://ana.example/",
      "wss://jun.example/",
      "wss://mine.example/",
    ]);
    const toAna = net.published.find((p) => p.relay === "wss://ana.example/")!.event;
    expect(toAna.tags).toEqual([["p", ana.pubkey]]);
    expect(toAna.pubkey).not.toBe(me.pubkey);

    const sent = engine.store.room(room)!;
    expect(sent.subject).toBe("Friday");
    expect(sent.last?.outgoing?.status).toBe("sent");
    // The copy coming back on the live subscription is the same message, not a second one.
    expect(sent.messages).toHaveLength(1);
  });

  it("keeps two sends in the same second apart, and in the order they were sent", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();

    const room = roomKey([me.pubkey, ana.pubkey]);
    // The same text twice in one second used to be one rumor id: one bubble for two sends.
    await Promise.all([engine.send(room, "ok"), engine.send(room, "ok"), engine.send(room, "see you")]);
    const sent = engine.store.room(room)!.messages;
    expect(sent.map((m) => m.rumor.content)).toEqual(["ok", "ok", "see you"]);
    expect(new Set(sent.map((m) => m.id)).size).toBe(3);
    expect(sent.every((m) => m.outgoing?.status === "sent")).toBe(true);
  });

  it("won't send to someone with no inbox relays", async () => {
    const me = person();
    const stranger = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"] });
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    const result = await engine.send(roomKey([me.pubkey, stranger.pubkey]), "hi");
    expect(result).toMatchObject({ ok: false, missing: [stranger.pubkey] });
    expect(net.published).toHaveLength(0);
  });

  it("puts disappearing messages' expiration on the wire and drops them once due", async () => {
    const me = person();
    const ana = person();
    let now = NOW;
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => now });
    await engine.start();
    const room = roomKey([me.pubkey, ana.pubkey]);
    await engine.send(room, "gone tomorrow", { timer: 86400 });
    const wrap = net.published.find((p) => p.relay === "wss://ana.example/")!.event;
    expect(wrap.tags).toContainEqual(["expiration", String(NOW + 86400)]);
    now = NOW + 86401;
    expect(engine.store.sweepExpired(now)).toHaveLength(1);
    expect(engine.store.rooms()).toHaveLength(0);
  });

  it("reacts inside the room, as a wrapped kind 7", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    net.hold("wss://mine.example/", await wrapFrom(ana, me.pubkey, "lunch?", NOW - 10));
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    const target = engine.store.rooms()[0].last!;
    await engine.react(target, "+");
    const room = engine.store.room(target.room)!;
    expect(room.reactions.get(target.id)?.map((r) => r.rumor.content)).toEqual(["+"]);
    expect(room.messages).toHaveLength(1);
  });

  it("keeps opened messages sealed in the cache and catches up from the last visit", async () => {
    const me = person();
    const ana = person();
    const cache = memoryCache();
    const c = clock();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "first", NOW - 60));
    const first = new DmEngine(me.account(), { ...net, ...c, cache, sealer: plainSealer, now: () => NOW });
    await first.start();
    await settle();
    c.flush();
    first.stop();
    await settle();
    expect([...cache.rows.values()][0].envelope).toMatch(/^sealed:/);
    expect(cache.st.get(me.pubkey)?.lastSeen).toBe(NOW);

    // An hour later, a fresh tab: the message is there before any relay answers,
    // and the live subscription only asks from the last visit (minus the buffer).
    const later = NOW + 3600;
    const decrypts: string[] = [];
    const quiet = network({ [me.pubkey]: ["wss://in.example/"] });
    const second = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          decrypts.push(from);
          return nip44.decrypt(text, nip44.getConversationKey(me.sk, from));
        },
      }),
      { ...quiet, ...clock(), cache, sealer: plainSealer, now: () => later },
    );
    await second.start();
    await settle();
    expect(second.store.rooms()[0].last?.rumor.content).toBe("first");
    expect(decrypts).toHaveLength(0);
    expect(quiet.live.get("wss://in.example/")!.filter.since).toBe(NOW - WRAP_JITTER_SECONDS);
  });

  it("opens again a wrap it gave up on under older, stricter rules", async () => {
    const me = person();
    const ana = person();
    const cache = memoryCache();
    const wrap = await wrapFrom(ana, me.pubkey, "from amethyst", NOW - 60);
    // Judged broken before seals with tags were accepted: a reason, but no rules stamp.
    await cache.putWraps([
      {
        key: wrapKey(me.pubkey, wrap.id),
        owner: me.pubkey,
        wrapId: wrap.id,
        at: wrap.created_at,
        failed: true,
        reason: "broken",
      },
    ]);
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", wrap);
    const engine = new DmEngine(me.account(), { ...net, ...clock(), cache, sealer: plainSealer, now: () => NOW });
    await engine.start();
    await settle();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("from amethyst");
    engine.stop();
  });

  it("holds the queue when the signer refuses, rather than forgetting the message", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "hi", NOW - 60));
    let refuse = true;
    const base = me.account();
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          if (refuse) throw new Error("user rejected");
          return base.decrypt!(from, text);
        },
        classify: () => "refused",
      }),
      { ...net, ...clock(), now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(engine.state()).toMatchObject({ paused: "refused", queued: 1, failed: 0 });
    refuse = false;
    engine.allowDecrypt();
    await settle();
    expect(engine.store.rooms()).toHaveLength(1);
  });

  it("holds the queue on a signer error that isn't a no, quoting it, until the reader tries again", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "hi", NOW - 60));
    let locked = true;
    const base = me.account();
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          if (locked) throw new Error("Password is not set");
          return base.decrypt!(from, text);
        },
        classify: () => "failed",
        explain: (error) => (error as Error).message,
      }),
      { ...net, ...clock(), now: () => NOW },
    );
    await engine.start();
    await settle();
    engine.allowDecrypt();
    await settle();
    expect(engine.state()).toMatchObject({
      paused: "failed",
      pauseDetail: "Password is not set",
      queued: 1,
      failed: 0,
    });
    locked = false;
    engine.allowDecrypt();
    expect(engine.state().pauseDetail).toBeUndefined();
    await settle();
    expect(engine.store.rooms()).toHaveLength(1);
  });

  it("holds the queue while the signer is on another profile, and opens it once it's back", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "hi", NOW - 60));
    let switched = true;
    const base = me.account();
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          if (switched) throw new Error("Your signer extension is on a different profile.");
          return base.decrypt!(from, text);
        },
        classify: () => "wrong-account",
      }),
      { ...net, ...clock(), now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(engine.state()).toMatchObject({ paused: "wrong-account", queued: 1, failed: 0 });
    switched = false;
    engine.allowDecrypt();
    await settle();
    expect(engine.store.rooms()).toHaveLength(1);
    engine.stop();
  });

  it("sends again once a relay that wanted a login signs the sender in", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://gated.example/"] });
    const signedIn = new Set<string>();
    const onLogin = new Map<string, () => void>();
    const publish = net.transport.publish;
    const transport: DmTransport = {
      ...net.transport,
      publish: async (relay, event) =>
        relay === "wss://gated.example/" && !signedIn.has(relay)
          ? { ok: false, message: "auth-required: you must auth", auth: true }
          : publish(relay, event),
      onAuthenticated: (relay, cb) => {
        onLogin.set(relay, cb);
        return () => onLogin.delete(relay);
      },
    };
    const engine = new DmEngine(me.account(), { ...net, transport, ...clock(), now: () => NOW });
    await engine.start();
    await settle();

    const room = roomKey([me.pubkey, ana.pubkey]);
    const result = await engine.send(room, "hi");
    expect(result.ok).toBe(false);
    const refused = result.message!.outgoing!.deliveries.find((d) => d.relay === "wss://gated.example/");
    expect(refused).toMatchObject({ ok: false, auth: true });
    expect(engine.state().sendAuth).toEqual(["wss://gated.example/"]);

    signedIn.add("wss://gated.example/");
    onLogin.get("wss://gated.example/")!();
    await settle();
    await settle();
    expect(engine.state().sendAuth).toEqual([]);
    expect(net.published.some((p) => p.relay === "wss://gated.example/")).toBe(true);
    expect(engine.store.room(room)!.last?.outgoing?.status).toBe("sent");
  });

  it("holds a message sent while the inbox list is still loading, instead of failing it", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const loadInbox = async (pk: string) => {
      if (pk === me.pubkey) await gate;
      return net.loadInbox(pk);
    };
    const engine = new DmEngine(me.account(), { ...net, loadInbox, ...clock(), now: () => NOW });
    const started = engine.start();
    await settle();
    expect(engine.state().status).toBe("starting");
    const sending = engine.send(roomKey([me.pubkey, ana.pubkey]), "early");
    release();
    await started;
    expect((await sending).ok).toBe(true);
  });

  it("doesn't keep a chat loading on a relay that stopped answering", async () => {
    const me = person();
    const net = network({ [me.pubkey]: ["wss://up.example/", "wss://down.example/"] });
    const transport: DmTransport = {
      ...net.transport,
      live: (relay, f, h) => (relay === "wss://down.example/" ? () => {} : net.transport.live(relay, f, h)),
      page: (relay, f, h) => (relay === "wss://down.example/" ? () => {} : net.transport.page(relay, f, h)),
    };
    const time = clock();
    const engine = new DmEngine(me.account(), { ...net, transport, ...time, now: () => NOW });
    await engine.start();
    await settle();
    engine.advanceAll();
    await settle();
    expect(engine.state()).toMatchObject({ liveSynced: false, liveSettled: false });
    time.flush(); // history stops waiting for down.example's live answer
    engine.advanceAll();
    await settle();
    time.flush(); // the pager's silence timer: down.example has said nothing
    await settle();
    expect(engine.state()).toMatchObject({ liveSynced: false, liveSettled: true });
  });

  it("answers once everyone is reached, without waiting on a relay that never does", async () => {
    const me = person();
    const ana = person();
    const net = network({
      [me.pubkey]: ["wss://mine.example/"],
      [ana.pubkey]: ["wss://ana.example/", "wss://dead.example/"],
    });
    const transport: DmTransport = {
      ...net.transport,
      publish: (relay, event) =>
        relay === "wss://dead.example/" ? new Promise(() => {}) : net.transport.publish(relay, event),
    };
    const engine = new DmEngine(me.account(), { ...net, transport, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    const result = await engine.send(roomKey([me.pubkey, ana.pubkey]), "quick");
    expect(result).toMatchObject({ ok: true });
    expect(result.message!.outgoing!.status).toBe("sent");
  });

  it("keeps an undelivered message through a reload and sends it when the connection is back", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    const cache = memoryCache();
    let online = false;
    const offline: DmTransport = {
      ...net.transport,
      publish: async (relay, event) =>
        online ? net.transport.publish(relay, event) : { ok: false, message: "offline" },
    };
    const time = clock();
    const first = new DmEngine(me.account(), {
      ...net,
      transport: offline,
      cache,
      sealer: plainSealer,
      ...time,
      online: () => online,
      now: () => NOW,
    });
    await first.start();
    await settle();
    const room = roomKey([me.pubkey, ana.pubkey]);
    const sent = await first.send(room, "on the train");
    expect(sent.message?.outgoing?.status).toBe("queued");
    time.flush(); // persist state
    await settle();
    expect(cache.st.get(me.pubkey)?.outbox).toMatch(/^sealed:/);
    first.stop();
    await settle();

    // Next visit, still offline: the message is there, waiting.
    let reconnect!: () => void;
    const second = new DmEngine(me.account(), {
      ...net,
      transport: offline,
      cache,
      sealer: plainSealer,
      ...clock(),
      online: () => online,
      onOnline: (cb) => {
        reconnect = cb;
        return () => {};
      },
      now: () => NOW,
    });
    await second.start();
    await settle();
    expect(second.store.room(room)?.last?.rumor.content).toBe("on the train");
    expect(second.store.room(room)?.last?.outgoing?.status).toBe("queued");
    expect(net.published).toHaveLength(0);

    online = true;
    reconnect();
    await settle();
    await settle();
    expect(net.published.map((p) => p.relay).sort()).toEqual(["wss://ana.example/", "wss://mine.example/"]);
    expect(second.store.room(room)?.last?.outgoing?.status).toBe("sent");
  });

  it("discards an undelivered message on request", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    const transport: DmTransport = { ...net.transport, publish: async () => ({ ok: false, message: "blocked" }) };
    const engine = new DmEngine(me.account(), { ...net, transport, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    const room = roomKey([me.pubkey, ana.pubkey]);
    const sent = await engine.send(room, "nope");
    expect(sent.message?.outgoing?.status).toBe("failed");
    engine.discard(sent.message!.id);
    expect(engine.store.room(room)).toBeUndefined();
  });

  it("a discarded message stays gone after a reload, though the reader's own copy reached their relay", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    const cache = memoryCache();
    // Ana's relay is down; the reader's own takes their copy.
    const transport: DmTransport = {
      ...net.transport,
      publish: async (relay, event) =>
        relay === "wss://ana.example/" ? { ok: false, message: "down" } : net.transport.publish(relay, event),
    };
    const time = clock();
    const first = new DmEngine(me.account(), {
      ...net,
      transport,
      cache,
      sealer: plainSealer,
      ...time,
      now: () => NOW,
    });
    await first.start();
    await settle();
    const room = roomKey([me.pubkey, ana.pubkey]);
    const sent = await first.send(room, "never mind");
    expect(sent.message?.outgoing?.status).toBe("failed");
    first.discard(sent.message!.id);
    time.flush(); // write what discard remembered
    await settle();
    first.stop();
    await settle();

    const second = new DmEngine(me.account(), {
      ...net,
      transport,
      cache,
      sealer: plainSealer,
      ...clock(),
      now: () => NOW,
    });
    await second.start();
    await settle();
    await settle();
    expect(second.store.room(room)).toBeUndefined();
  });

  it.each([
    ["refused", "Your signer extension declined the request."],
    ["wrong-account", "Your signer extension is on a different profile."],
    ["cancelled", "Cancelled"],
  ] as const)("a send the signer didn't sign (%s) leaves no bubble, only the error", async (reason, error) => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://mine.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    const sealSigner: SealSigner = {
      ...me.sealSigner,
      signSeal: async () => {
        throw new Error(error);
      },
    };
    const engine = new DmEngine(me.account({ sealSigner, classify: () => reason }), {
      ...net,
      ...clock(),
      now: () => NOW,
    });
    await engine.start();
    await settle();
    const room = roomKey([me.pubkey, ana.pubkey]);
    const sent = await engine.send(room, "draft stays");
    // No message: the composer keeps the draft, and sending it again asks the signer again.
    expect(sent).toEqual({ ok: false, error });
    expect(engine.store.room(room)).toBeUndefined();
    expect(net.published).toEqual([]);
  });

  it.each(["refused", "failed"] as const)(
    "a wrap the signer keeps turning down (%s) can't hold the inbox shut",
    async (kind) => {
      const me = person();
      const ana = person();
      const troll = person();
      const net = network({ [me.pubkey]: ["wss://in.example/"] });
      net.hold("wss://in.example/", await wrapFrom(troll, me.pubkey, "poison", NOW - 10));
      net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "hello", NOW - 600));
      const base = me.account();
      const engine = new DmEngine(
        me.account({
          // An extension that errors on one sender's payload, opaquely.
          decrypt: async (from, text) => {
            if (from === troll.pubkey) throw new Error("something went wrong");
            return base.decrypt!(from, text);
          },
          classify: () => kind,
        }),
        { ...net, ...clock(), now: () => NOW },
      );
      await engine.start();
      await settle();
      engine.allowDecrypt();
      await settle();
      // Unlucky first: the newest wrap is the troll's, and the signer "refused".
      // The seal decrypt is the troll's; the wrap decrypt (ephemeral key) works.
      if (engine.state().paused) engine.allowDecrypt();
      await settle();
      await settle();
      expect(engine.store.rooms().map((r) => r.last?.rumor.content)).toEqual(["hello"]);
      // Set aside for this visit — not remembered as unreadable, and retried on request.
      expect(engine.state()).toMatchObject({ paused: undefined, queued: 0, failed: 0, setAside: 1 });
    },
  );

  it("never hands a malformed payload to the signer", async () => {
    const me = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const eph = generateSecretKey();
    net.hold(
      "wss://in.example/",
      finalizeEvent({ kind: 1059, created_at: NOW - 5, tags: [["p", me.pubkey]], content: "#" + "a".repeat(140) }, eph),
    );
    let asked = 0;
    const base = me.account();
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          asked++;
          return base.decrypt!(from, text);
        },
        classify: () => "refused",
      }),
      { ...net, ...clock(), now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(asked).toBe(0);
    expect(engine.state()).toMatchObject({ paused: undefined, failed: 1 });
  });

  it("drops a message that doesn't name the reader", async () => {
    const me = person();
    const ana = person();
    const bob = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const rumor = makeRumor({
      pubkey: ana.pubkey,
      kind: CHAT_KIND,
      tags: [["p", bob.pubkey]],
      content: "not for you",
      created_at: NOW - 5,
    });
    net.hold("wss://in.example/", await wrapRumor(rumor, me.pubkey, ana.sealSigner, { at: NOW - 5, random: () => 0 }));
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    expect(engine.store.rooms()).toHaveLength(0);
  });

  it("registers nothing when stopped while the inbox list is loading", async () => {
    const me = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let repeating = 0;
    const engine = new DmEngine(me.account(), {
      ...net,
      ...clock(),
      setRepeating: () => ++repeating,
      loadInbox: async (pk) => {
        await gate;
        return net.loadInbox(pk);
      },
      now: () => NOW,
    });
    const started = engine.start();
    await settle();
    engine.stop();
    release();
    await started;
    expect(repeating).toBe(0);
    expect(net.live.size).toBe(0);
  });

  it("doesn't count wraps still waiting to be opened as caught up", async () => {
    const me = person();
    const ana = person();
    const cache = memoryCache();
    const time = clock();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const waiting = await wrapFrom(ana, me.pubkey, "later", NOW - 3600, NOW - 3600);
    net.hold("wss://in.example/", waiting);
    // An extension: nothing opens until the reader opens Messages.
    const engine = new DmEngine(me.account({ canOpenInBackground: async () => false }), {
      ...net,
      ...time,
      cache,
      sealer: plainSealer,
      now: () => NOW,
    });
    await engine.start();
    await settle();
    expect(engine.state().queued).toBe(1);
    time.flush();
    await settle();
    expect(cache.st.get(me.pubkey)?.lastSeen).toBe(waiting.created_at);
  });

  it("doesn't fetch a relay's next page until the last one has been opened", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const old = NOW - LIVE_TAIL_SECONDS - 30 * 86400;
    for (let i = 0; i < 60; i++)
      net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, `old ${i}`, old - i * 60, old - i * 60));
    // An extension: nothing opens until the reader opens Messages.
    const engine = new DmEngine(me.account({ canOpenInBackground: async () => false }), {
      ...net,
      ...clock(),
      now: () => NOW,
    });
    await engine.start();
    await settle();
    expect(engine.advanceAll()).toBe(true);
    await settle();
    await settle();
    const relay = engine.state().history.relays[0];
    expect(relay).toMatchObject({ state: "idle", opening: 60 });
    const asked = net.pages.length;
    // Sealed wraps on hand: no new page, however often the marker asks.
    expect(engine.advanceAll()).toBe(false);
    expect(engine.advance("wss://in.example/")).toBe(false);
    expect(net.pages.length).toBe(asked);

    engine.allowDecrypt();
    for (let i = 0; i < 40 && engine.state().queued; i++) await settle();
    expect(engine.state().history.relays[0].opening ?? 0).toBe(0);
    expect(engine.store.rooms()[0].messages).toHaveLength(60);
    expect(engine.advanceAll()).toBe(true);
  });

  it("downloads every relay to its end on request, then stops by itself", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://a.example/", "wss://b.example/"] });
    for (const months of [1, 6, 18])
      net.hold("wss://a.example/", await wrapFrom(ana, me.pubkey, `${months} months ago`, NOW - months * 30 * 86400));
    net.hold("wss://b.example/", await wrapFrom(ana, me.pubkey, "two years ago", NOW - 730 * 86400));
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    expect(net.pages).toHaveLength(0);

    engine.downloadAll();
    expect(engine.state().downloading).toBe(true);
    for (let i = 0; i < 100 && engine.state().downloading; i++) await new Promise((r) => setTimeout(r, 20));
    expect(engine.state().downloading).toBe(false);
    expect(engine.state().history.relays.map((r) => r.state)).toEqual(["done", "done"]);
    expect(engine.store.rooms()[0].messages).toHaveLength(4);
    engine.stop();
  });

  it("stops downloading when asked", async () => {
    const me = person();
    const net = network({ [me.pubkey]: ["wss://a.example/"] });
    const engine = new DmEngine(me.account(), { ...net, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    engine.downloadAll();
    engine.stopDownload();
    expect(engine.state().downloading).toBe(false);
    const asked = net.pages.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(net.pages.length).toBe(asked);
    engine.stop();
  });

  it("pages the band a capped live window left, starting below it — not from the floor", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    // 60 wraps inside the live window; the relay answers a REQ with at most 50.
    const times: number[] = [];
    for (let i = 0; i < 60; i++) times.push(NOW - 60 - i * 7200);
    for (const t of times) net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, `m${t}`, t, t));
    const capped: DmTransport = {
      ...net.transport,
      live(relay, f, h) {
        const all = (net.held.get(relay) ?? []).filter((e) => e.created_at >= (f.since ?? 0));
        all
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 50)
          .forEach((e) => h.onEvent(e));
        h.onEose();
        return () => {};
      },
    };
    const engine = new DmEngine(me.account(), { ...net, transport: capped, ...clock(), now: () => NOW });
    await engine.start();
    for (let i = 0; i < 30 && engine.state().queued; i++) await settle();
    expect(engine.store.size).toBe(50);
    expect(engine.advanceAll()).toBe(true);
    // The first page asks from just below the live window's oldest wrap, not from the floor.
    const oldestLive = times[49];
    expect(net.pages.at(-1)!.filter.until).toBe(oldestLive);
    for (let i = 0; i < 30 && (engine.state().queued || engine.state().history.loading); i++) await settle();
    expect(engine.store.size).toBe(60);
  });

  it("opens again a wrap an older version cached as failed without a reason", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const wrap = await wrapFrom(ana, me.pubkey, "came back", NOW - 120);
    net.hold("wss://in.example/", wrap);
    const cache = memoryCache();
    cache.rows.set(`${me.pubkey}:${wrap.id}`, {
      key: `${me.pubkey}:${wrap.id}`,
      owner: me.pubkey,
      wrapId: wrap.id,
      at: wrap.created_at,
      failed: true,
    });
    cache.st.set(me.pubkey, { owner: me.pubkey, lastSeen: NOW - 30, cursors: { floor: NOW - 30, relays: {} } });
    const engine = new DmEngine(me.account(), { ...net, cache, sealer: plainSealer, ...clock(), now: () => NOW });
    await engine.start();
    await settle();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("came back");
  });

  it("resumes by itself after the signer times out", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "slow signer", NOW - 60));
    let timeouts = 1;
    const base = me.account();
    const time = clock();
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          if (timeouts-- > 0) throw new Error("request timed out");
          return base.decrypt!(from, text);
        },
        classify: () => "unreachable",
      }),
      { ...net, ...time, now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(engine.state().paused).toBe("unreachable");
    time.flush(); // the backoff elapses
    await settle();
    await settle();
    expect(engine.state().paused).toBeUndefined();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("slow signer");
  });

  it("slows down when the signer says rate limited, and carries on by itself — no notice, no refusal", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    for (let i = 0; i < 3; i++) net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, `m${i}`, NOW - 60 - i));
    let limited = 2;
    const base = me.account();
    const time = clock();
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          if (limited-- > 0) throw new Error("rate limited");
          return base.decrypt!(from, text);
        },
        classify: () => "rate-limited",
      }),
      { ...net, ...time, concurrency: 1, now: () => NOW },
    );
    await engine.start();
    await settle();
    // Backing off: still waiting, but nothing for the reader to do.
    expect(engine.state()).toMatchObject({ paused: undefined, queued: 3, failed: 0 });
    time.flush(); // the first wait elapses; asked again, limited again
    await settle();
    expect(engine.state()).toMatchObject({ paused: undefined, queued: 3 });
    time.flush();
    for (let i = 0; i < 10; i++) await settle();
    expect(engine.state()).toMatchObject({ paused: undefined, queued: 0, failed: 0, setAside: 0 });
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("m0");
  });

  it("treats a request the signer skipped — it answered later ones — as a pace, not a signer gone quiet", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const wraps = [];
    for (let i = 0; i < 3; i++) wraps.push(await wrapFrom(ana, me.pubkey, `m${i}`, NOW - 60 - i));
    wraps.forEach((w) => net.hold("wss://in.example/", w));
    const base = me.account();
    const time = clock();
    let skip = true;
    const engine = new DmEngine(
      me.account({
        // Amethyst past its limit: m1's request is never answered, m2's (asked after) is.
        decrypt: (from, text) => {
          if (skip && text === wraps[1].content) {
            skip = false;
            return new Promise<string>(() => {});
          }
          return base.decrypt!(from, text);
        },
        classify: () => "unreachable",
      }),
      { ...net, ...time, concurrency: 2, now: () => NOW },
    );
    await engine.start();
    for (let i = 0; i < 8; i++) await settle();
    expect(engine.state().queued).toBe(1);
    time.flush(); // one check later: m2 was answered after m1 was asked, so m1 was dropped
    await settle();
    expect(engine.state().paused).toBeUndefined();
    time.flush(); // the back-off passes; m1 is asked again
    for (let i = 0; i < 8; i++) await settle();
    expect(engine.state()).toMatchObject({ paused: undefined, queued: 0, failed: 0 });
  });

  it("keeps waiting on a person who approves each request in order, without asking twice", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    for (let i = 0; i < 2; i++) net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, `m${i}`, NOW - 60 - i));
    const base = me.account();
    const time = clock();
    const asked: string[] = [];
    const approve: (() => void)[] = [];
    let now = 0; // a person takes seconds per tap
    const engine = new DmEngine(
      me.account({
        // Amber, asking each time: nothing comes back until the person taps, in order.
        decrypt: (from, text) => {
          asked.push(text);
          return new Promise<string>((ok) => approve.push(() => void base.decrypt!(from, text).then(ok)));
        },
        classify: () => "unreachable",
      }),
      { ...net, ...time, concurrency: 4, clockMs: () => now, now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(asked).toHaveLength(1); // one prompt at a time until the first is answered
    time.flush(); // ten seconds pass, the person hasn't tapped: still waiting, not re-asked
    await settle();
    expect(engine.state().paused).toBeUndefined();
    expect(new Set(asked).size).toBe(asked.length);
    now += 6_000;
    approve.shift()!(); // the wrap
    for (let i = 0; i < 4; i++) await settle();
    now += 6_000;
    approve.shift()!(); // its seal
    for (let i = 0; i < 6; i++) await settle();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("m0");
    // Opened at a person's pace: the next one, waiting on its tap, is still not asked twice.
    time.flush();
    for (let i = 0; i < 4; i++) await settle();
    expect(engine.state().paused).toBeUndefined();
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("asks one at a time until the first opens, then the ceiling, and half after a pushback", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    for (let i = 0; i < 40; i++) net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, `m${i}`, NOW - 60 - i));
    const base = me.account();
    const time = clock();
    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          const n = ++calls;
          inFlight++;
          peak = Math.max(peak, inFlight);
          await settle();
          inFlight--;
          if (n === 5) throw new Error("rate limited");
          return base.decrypt!(from, text);
        },
        classify: () => "rate-limited",
      }),
      { ...net, ...time, concurrency: 8, now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(peak).toBe(1); // slow start: one request until the signer has answered
    for (let i = 0; i < 4; i++) await settle();
    expect(peak).toBe(8); // then the burst, until the signer says "rate limited"
    for (let i = 0; i < 6; i++) await settle();
    peak = 0;
    time.flush(); // the back-off passes: half as many at once
    await settle();
    expect(peak).toBe(4);
    for (let i = 0; i < 80; i++) await settle();
    expect(engine.state()).toMatchObject({ queued: 0, failed: 0 });
  });

  it("backs off once, at half the pace, for a whole burst a fast signer stopped answering", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    for (let i = 0; i < 20; i++) net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, `m${i}`, NOW - 60 - i));
    const base = me.account();
    const time = clock();
    let calls = 0;
    let asleep = true;
    let inFlight = 0;
    let peak = 0;
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          // The first wrap opens (both steps); then the phone locks mid-burst.
          if (++calls > 2 && asleep) return new Promise<string>(() => {});
          inFlight++;
          peak = Math.max(peak, inFlight);
          await settle();
          inFlight--;
          return base.decrypt!(from, text);
        },
        classify: () => "unreachable",
      }),
      { ...net, ...time, concurrency: 8, decryptTimeoutMs: 10_000, now: () => NOW },
    );
    await engine.start();
    for (let i = 0; i < 4; i++) await settle();
    time.flush(); // every request in the burst goes unanswered: a signer that was fast, gone silent
    await settle();
    expect(engine.state().paused).toBeUndefined(); // a pace, not "your signer didn't answer"
    asleep = false;
    peak = 0;
    time.flush(); // the back-off passes — half the ceiling, not one
    await settle();
    expect(peak).toBe(4);
  });

  it("reuses a seal it already opened when the rest of the wrap is asked again", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const wrap = await wrapFrom(ana, me.pubkey, "once", NOW - 60);
    net.hold("wss://in.example/", wrap);
    const base = me.account();
    const time = clock();
    let wrapAsks = 0;
    let limited = true;
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          if (text === wrap.content) wrapAsks++;
          else if (limited) {
            limited = false;
            throw new Error("rate limited"); // the seal's step, pushed back
          }
          return base.decrypt!(from, text);
        },
        classify: () => "rate-limited",
      }),
      { ...net, ...time, concurrency: 1, now: () => NOW },
    );
    await engine.start();
    await settle();
    time.flush();
    for (let i = 0; i < 6; i++) await settle();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("once");
    expect(wrapAsks).toBe(1);
  });

  it("asks nothing more of a wrap once its deadline has passed, even if the first step answers late", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    const wrap = await wrapFrom(ana, me.pubkey, "late", NOW - 60);
    net.hold("wss://in.example/", wrap);
    const base = me.account();
    const time = clock();
    let calls = 0;
    let answerLate: () => void = () => {};
    const engine = new DmEngine(
      me.account({
        decrypt: (from, text) => {
          calls++;
          if (calls === 1)
            return new Promise<string>((ok) => (answerLate = () => void base.decrypt!(from, text).then(ok)));
          return base.decrypt!(from, text);
        },
        classify: () => "unreachable",
      }),
      { ...net, ...time, concurrency: 1, decryptTimeoutMs: 10_000, now: () => NOW },
    );
    await engine.start();
    await settle();
    time.flush(); // given up on
    await settle();
    expect(engine.state().paused).toBe("unreachable");
    answerLate(); // the person taps "allow" at last
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toBe(1); // no second prompt for the seal
    time.flush(); // resuming: the seal it gave up is reused, only the rest is asked
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toBe(2);
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("late");
  });

  it("tells the reader once every back-off has passed and the signer still says rate limited", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "stuck", NOW - 60));
    const time = clock();
    const engine = new DmEngine(
      me.account({
        decrypt: async () => {
          throw new Error("rate limited");
        },
        classify: () => "rate-limited",
        explain: (e) => (e as Error).message,
      }),
      { ...net, ...time, concurrency: 1, now: () => NOW },
    );
    await engine.start();
    await settle();
    for (let round = 0; round < 4; round++) {
      expect(engine.state().paused).toBeUndefined();
      time.flush();
      await settle();
    }
    expect(engine.state()).toMatchObject({ paused: "unreachable", pauseDetail: "rate limited", queued: 1 });
  });

  it("asks again at once when the reader taps Try again during a back-off", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "now", NOW - 60));
    const base = me.account();
    let limited = true;
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          if (limited) {
            limited = false;
            throw new Error("rate limited");
          }
          return base.decrypt!(from, text);
        },
        classify: () => "rate-limited",
      }),
      { ...net, ...clock(), concurrency: 1, now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(engine.state().queued).toBe(1);
    engine.allowDecrypt(); // no timer flushed: the reader's tap is enough
    for (let i = 0; i < 6; i++) await settle();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("now");
  });

  it("opens nothing while a message is being sealed, so the send isn't the one refused", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"], [ana.pubkey]: ["wss://ana.example/"] });
    const base = me.account();
    let releaseSeal: () => void = () => {};
    let opened = 0;
    const engine = new DmEngine(
      me.account({
        decrypt: async (from, text) => {
          opened++;
          return base.decrypt!(from, text);
        },
        sealSigner: {
          ...me.sealSigner,
          signSeal: async (t) => {
            await new Promise<void>((ok) => (releaseSeal = ok));
            return me.sealSigner.signSeal(t);
          },
        },
      }),
      { ...net, ...clock(), now: () => NOW },
    );
    await engine.start();
    await settle();
    const sent = engine.send(roomKey([me.pubkey, ana.pubkey]), "hi");
    for (let i = 0; i < 4; i++) await settle();
    net.live.get("wss://in.example/")!.h.onEvent(await wrapFrom(ana, me.pubkey, "while sealing", NOW - 5));
    for (let i = 0; i < 4; i++) await settle();
    expect(opened).toBe(0);
    releaseSeal();
    for (let i = 0; i < 4; i++) await settle();
    releaseSeal(); // the sender's own copy
    expect((await sent).ok).toBe(true);
    for (let i = 0; i < 6; i++) await settle();
    expect(opened).toBeGreaterThan(0);
  });

  it("takes back a decrypt slot the signer never answers, instead of freezing every later message", async () => {
    const me = person();
    const ana = person();
    const net = network({ [me.pubkey]: ["wss://in.example/"] });
    net.hold("wss://in.example/", await wrapFrom(ana, me.pubkey, "first", NOW - 60));
    let hang = true;
    const base = me.account();
    const time = clock();
    const engine = new DmEngine(
      me.account({
        // An extension that silently drops its first requests.
        decrypt: (from, text) => (hang ? new Promise<string>(() => {}) : base.decrypt!(from, text)),
        classify: () => "refused",
      }),
      { ...net, ...time, concurrency: 1, decryptTimeoutMs: 10_000, now: () => NOW },
    );
    await engine.start();
    await settle();
    expect(engine.state().queued).toBe(1);
    hang = false;
    time.flush(); // the deadline passes: the slot is taken back and opening pauses briefly
    await settle();
    expect(engine.state().paused).toBe("unreachable");
    time.flush(); // and resumes by itself
    for (let i = 0; i < 5; i++) await settle();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("first");
    // A new message arriving live opens too.
    const later = await wrapFrom(ana, me.pubkey, "second", NOW - 5);
    net.live.get("wss://in.example/")!.h.onEvent(later);
    for (let i = 0; i < 5; i++) await settle();
    expect(engine.store.rooms()[0]?.last?.rumor.content).toBe("second");
  });
});
