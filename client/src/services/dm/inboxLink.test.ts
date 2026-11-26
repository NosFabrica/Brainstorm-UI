// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { GIFT_WRAP_KIND, WRAP_JITTER_SECONDS } from "@/lib/dm/giftWrap";
import type { PageHandlers } from "@/lib/dm/pager";
import { InboxLink, LIVE_TAIL_SECONDS, type InboxLinkDeps, type InboxLinkHost } from "./inboxLink";
import type { LiveHandlers, WrapFilter } from "./engine";
import { coreFor, NOW, settle } from "./test-fakes";

const ME = "a".repeat(64);
const IN = "wss://in.example/";

const wrap = (id: string, at: number): NostrEvent => ({
  id,
  kind: GIFT_WRAP_KIND,
  pubkey: "c".repeat(64),
  created_at: at,
  tags: [["p", ME]],
  content: "",
  sig: "",
});

function setup(relays: string[] = [IN]) {
  const live = new Map<string, { filter: WrapFilter; h: LiveHandlers; stopped: boolean }>();
  const pages: { relay: string; filter: WrapFilter; h: PageHandlers }[] = [];
  const lookups: { fresh?: boolean }[] = [];
  let inbox = relays;
  const deps: InboxLinkDeps = {
    transport: {
      live: (relay, filter, h) => {
        const sub = { filter, h, stopped: false };
        live.set(relay, sub);
        return () => void (sub.stopped = true);
      },
      page: (relay, filter, h) => {
        pages.push({ relay, filter, h });
        return () => {};
      },
      onAuthenticated: () => () => {},
    },
    loadInbox: async (_pk, opts) => {
      lookups.push(opts ?? {});
      return { relays: inbox, found: inbox.length > 0 };
    },
  };
  const ingested: [string, string][] = [];
  let saves = 0;
  let unopened = new Map<string, number>();
  let oldest: number | undefined;
  const host: InboxLinkHost = {
    ingest: (w, relay) => void ingested.push([w.id, relay]),
    unopenedByRelay: () => unopened,
    oldestWaiting: (at) => (oldest !== undefined && oldest < at ? oldest : at),
    scheduleState: () => void saves++,
  };
  const { core, timers } = coreFor(ME);
  const link = new InboxLink(core, deps, host);
  return {
    core,
    timers,
    link,
    live,
    pages,
    lookups,
    ingested,
    saves: () => saves,
    setInbox: (r: string[]) => (inbox = r),
    setUnopened: (m: Map<string, number>) => (unopened = m),
    setOldest: (at: number) => (oldest = at),
  };
}

describe("InboxLink", () => {
  it("opens the live tail a week back, two days below the floor, on each inbox relay", async () => {
    const t = setup([IN, "wss://two.example/"]);
    await t.link.connect();
    expect(t.link.status).toBe("ready");
    expect(t.link.state().floor).toBe(NOW - LIVE_TAIL_SECONDS);
    expect([...t.live.keys()]).toEqual([IN, "wss://two.example/"]);
    expect(t.live.get(IN)!.filter).toEqual({
      kinds: [GIFT_WRAP_KIND],
      "#p": [ME],
      since: NOW - LIVE_TAIL_SECONDS - WRAP_JITTER_SECONDS,
    });
    expect(t.link.state().live).toEqual({ [IN]: "connecting", "wss://two.example/": "connecting" });
  });

  it("starts from the last catch-up when the device has been here recently", async () => {
    const t = setup();
    t.core.seen.add("held");
    t.link.restoreSync(NOW - 3600, undefined);
    await t.link.connect();
    expect(t.link.state().floor).toBe(NOW - 3600);
  });

  it("hands every wrap to the engine and marks the catch-up once every relay answers", async () => {
    const t = setup();
    await t.link.connect();
    const sub = t.live.get(IN)!;
    sub.h.onEvent(wrap("w1", NOW - 10));
    expect(t.ingested).toEqual([["w1", IN]]);
    expect(t.link.state().liveSynced).toBe(false);

    t.setOldest(NOW - 10);
    sub.h.onEose();
    expect(t.link.state().liveSynced).toBe(true);
    expect(t.link.state().liveSettled).toBe(true);
    // Caught up only to the oldest wrap still unopened.
    expect(t.link.syncState().lastSeen).toBe(NOW - 10);
    expect(t.saves()).toBeGreaterThan(0);

    sub.h.onDisconnected?.();
    expect(t.link.state().live[IN]).toBe("connecting");
  });

  it("shows a relay that wants a login, and lets history go ahead without waiting on it", async () => {
    const t = setup();
    await t.link.connect();
    expect(t.link.advance(IN)).toBe(false); // waiting for the live answer
    t.live.get(IN)!.h.onAuthRequired(true);
    expect(t.link.state().live[IN]).toBe("auth");
    expect(t.link.advance(IN)).toBe(true);
    expect(t.pages.map((p) => p.relay)).toEqual([IN]);
  });

  it("holds history back while a relay's last page is still being opened", async () => {
    const t = setup();
    await t.link.connect();
    t.live.get(IN)!.h.onEose();
    t.setUnopened(new Map([[IN, 50]]));
    expect(t.link.advance(IN)).toBe(false);
    expect(t.link.state().history.relays[0].opening).toBe(50);
    t.setUnopened(new Map([[IN, 49]]));
    expect(t.link.advance(IN)).toBe(true);
  });

  it("stops waiting for a slow live answer after a while", async () => {
    const t = setup();
    await t.link.connect();
    expect(t.link.state().history.relays[0].waiting).toBe(true);
    t.timers.flush();
    expect(t.link.state().history.relays[0].waiting).toBeUndefined();
  });

  it("looks for an inbox list twice more before believing there is none", async () => {
    const t = setup([]);
    await t.link.connect();
    expect(t.link.status).toBe("no-inbox");
    expect([...t.timers.pending.values()].map((x) => x.ms)).toEqual([20_000]);

    t.setInbox([IN]);
    t.timers.flush();
    await settle();
    expect(t.lookups).toEqual([{}, { fresh: true }]);
    expect(t.link.status).toBe("ready");
  });

  it("keeps only the latest lookup", async () => {
    const t = setup();
    const first = t.link.connect();
    t.setInbox(["wss://new.example/"]);
    const second = t.link.connect({ fresh: true });
    await Promise.all([first, second]);
    expect(t.link.inbox).toEqual(["wss://new.example/"]);
    expect([...t.live.keys()]).toEqual(["wss://new.example/"]);
  });

  it("keeps history's position across a stop, for the final save", async () => {
    const t = setup();
    await t.link.connect();
    const before = t.link.syncState().cursors;
    expect(before).toBeDefined();
    t.core.stopped = true;
    t.link.stop();
    expect(t.link.status).toBe("stopped");
    expect(t.live.get(IN)!.stopped).toBe(true);
    expect(t.link.syncState().cursors).toEqual(before);
    expect(await t.link.refresh()).toBeUndefined();
    expect(t.lookups).toHaveLength(1);
  });
});
