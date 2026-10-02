// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { RelayCursors } from "./cursors";
import { BackwardPager, type PageHandlers } from "./pager";
import { WRAP_JITTER_SECONDS } from "./giftWrap";

const FLOOR = 1_000_000;
const ev = (created_at: number, id = String(created_at)) => ({ id, created_at }) as NostrEvent;

/** A transport whose pages the test answers by hand. */
function harness(opts: { silenceMs?: number } = {}) {
  const pending = new Map<string, { until: number; limit: number; h: PageHandlers; cancelled: boolean }>();
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const wraps: [number, string][] = [];
  const pager = new BackwardPager({
    cursors: new RelayCursors(FLOOR),
    limit: 3,
    silenceMs: opts.silenceMs ?? 1000,
    fetchPage: (relay, filter, h) => {
      const page = { ...filter, h, cancelled: false };
      pending.set(relay, page);
      return () => {
        page.cancelled = true;
      };
    },
    onWrap: (e, relay) => wraps.push([e.created_at, relay]),
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  });
  const answer = (relay: string, times: number[]) => {
    const page = pending.get(relay)!;
    for (const t of times) page.h.onEvent(ev(t));
    page.h.onEose();
  };
  const fireTimers = () => timers.filter((t) => !t.cleared).forEach((t) => t.fn());
  const state = (url: string) => pager.snapshot().relays.find((r) => r.url === url)!;
  return { pager, pending, answer, fireTimers, state, wraps };
}

describe("RelayCursors", () => {
  it("starts at the floor and steps older, the oldest second included", () => {
    const c = new RelayCursors(FLOOR);
    expect(c.advance("r")).toBe(true);
    expect(c.requestedUntil("r")).toBe(FLOOR);
    c.onEvent("r", FLOOR - 50);
    c.onEvent("r", FLOOR - 10);
    expect(c.onEose("r")).toEqual({ done: false, count: 2 });
    expect(c.reachedUntil("r")).toBe(FLOOR - 50);
    c.advance("r");
    // Inclusive: wraps that share the oldest second with a full page aren't skipped.
    expect(c.requestedUntil("r")).toBe(FLOOR - 50);
  });

  it("moves past a second shared across two pages, and is done when only it comes back", () => {
    const c = new RelayCursors(FLOOR);
    c.advance("r");
    c.onEvent("r", FLOOR - 7);
    c.onEvent("r", FLOOR - 7); // the page was cut inside this second
    c.onEose("r");
    c.advance("r");
    c.onEvent("r", FLOOR - 7); // the rest of that second
    c.onEvent("r", FLOOR - 9);
    expect(c.onEose("r").done).toBe(false);
    expect(c.reachedUntil("r")).toBe(FLOOR - 9);
    c.advance("r");
    c.onEvent("r", FLOOR - 9); // nothing older: the relay is finished
    expect(c.onEose("r").done).toBe(true);
  });

  it("starts paging below what a capped live subscription reached", () => {
    const c = new RelayCursors(FLOOR);
    c.startBelow("capped", FLOOR + 3600);
    c.advance("capped");
    expect(c.requestedUntil("capped")).toBe(FLOOR + 3600);
    c.startBelow("other", FLOOR - 10); // below the floor: nothing to fill
    c.advance("other");
    expect(c.requestedUntil("other")).toBe(FLOOR);
  });

  it("is done on an empty page, and on a page that brought nothing older", () => {
    const c = new RelayCursors(FLOOR);
    c.advance("empty");
    expect(c.onEose("empty").done).toBe(true);
    expect(c.advance("empty")).toBe(false);

    c.advance("echo");
    c.onEvent("echo", FLOOR - 5);
    c.onEose("echo");
    c.advance("echo");
    c.onEvent("echo", FLOOR - 5);
    expect(c.onEose("echo").done).toBe(true);
  });

  it("is only guaranteed complete two days above the oldest wrap it delivered", () => {
    const c = new RelayCursors(FLOOR);
    expect(c.completeTo("r")).toBe(FLOOR);
    c.advance("r");
    c.onEvent("r", FLOOR - 10 * WRAP_JITTER_SECONDS);
    c.onEose("r");
    expect(c.completeTo("r")).toBe(FLOOR - 9 * WRAP_JITTER_SECONDS);
  });

  it("survives a reload, parked", () => {
    const c = new RelayCursors(FLOOR);
    c.advance("a");
    c.onEvent("a", FLOOR - 100);
    c.onEose("a");
    c.advance("b");
    c.onEose("b");
    const back = RelayCursors.restore(JSON.parse(JSON.stringify(c.snapshot())));
    expect(back.reachedUntil("a")).toBe(FLOOR - 100);
    expect(back.isDone("b")).toBe(true);
    expect(back.armed(["a", "b"])).toEqual([]);
  });
});

describe("BackwardPager", () => {
  it("pages each relay independently, parking after every page", () => {
    const { pager, answer, state, pending, wraps } = harness();
    pager.setRelays(["fast", "slow"]);
    expect(pager.advanceAll()).toBe(true);
    expect(pending.get("fast")!.until).toBe(FLOOR);
    expect(pending.get("fast")!.limit).toBe(3);

    answer("fast", [FLOOR - 10, FLOOR - 20]);
    expect(state("fast").state).toBe("idle");
    expect(state("slow").state).toBe("loading");
    expect(pending.get("fast")!.cancelled).toBe(true);

    // The fast relay moves on without waiting for the slow one.
    expect(pager.advance("fast")).toBe(true);
    expect(pending.get("fast")!.until).toBe(FLOOR - 20);
    expect(pager.advance("slow")).toBe(false);
    expect(wraps).toEqual([
      [FLOOR - 10, "fast"],
      [FLOOR - 20, "fast"],
    ]);
  });

  it("marks a relay done on an empty page and reports the whole history in", () => {
    const { pager, answer, state } = harness();
    pager.setRelays(["a"]);
    pager.advance("a");
    answer("a", []);
    expect(state("a").state).toBe("done");
    expect(state("a").completeTo).toBe(0);
    expect(pager.snapshot()).toMatchObject({ exhausted: true, complete: true, loading: false });
    expect(pager.advance("a")).toBe(false);
  });

  it("stalls a relay that goes silent, and resumes it on retry", () => {
    const { pager, fireTimers, state, answer } = harness();
    pager.setRelays(["quiet"]);
    pager.advance("quiet");
    fireTimers();
    expect(state("quiet")).toMatchObject({ state: "stalled", reason: "no answer — trying again" });
    expect(pager.snapshot()).toMatchObject({ exhausted: true, complete: false });
    expect(pager.retry("quiet")).toBe(true);
    answer("quiet", [FLOOR - 1]);
    expect(state("quiet").state).toBe("idle");
  });

  it("asks a stalled relay again by itself, with smaller pages, then leaves it to the reader", () => {
    const pending = new Map<string, { limit: number }>();
    const timers: { fn: () => void; cleared: boolean }[] = [];
    const pager = new BackwardPager({
      cursors: new RelayCursors(FLOOR),
      limit: 400,
      silenceMs: 1000,
      fetchPage: (relay, filter) => {
        pending.set(relay, filter);
        return () => {};
      },
      onWrap: () => {},
      setTimer: (fn) => {
        const t = { fn, cleared: false };
        timers.push(t);
        return t;
      },
      clearTimer: (t) => void ((t as { cleared: boolean }).cleared = true),
    });
    const tick = () => {
      const due = timers.filter((t) => !t.cleared);
      due.forEach((t) => (t.cleared = true));
      due.forEach((t) => t.fn());
    };
    pager.setRelays(["slow"]);
    pager.advance("slow");
    const limits = [pending.get("slow")!.limit];
    for (let i = 0; i < 3; i++) {
      tick(); // goes silent: stalled, a retry scheduled
      tick(); // the retry asks again
      limits.push(pending.get("slow")!.limit);
    }
    expect(limits).toEqual([400, 200, 100, 100]);
    tick(); // silent a fourth time: no more automatic tries
    expect(timers.filter((t) => !t.cleared)).toHaveLength(0);
    expect(pager.snapshot().relays[0]).toMatchObject({ state: "stalled", reason: "no answer" });
  });

  it("waits for a login when the relay asks for one", () => {
    const { pager, pending, state, answer } = harness();
    const listener = vi.fn();
    pager.subscribe(listener);
    pager.setRelays(["walled"]);
    pager.advance("walled");
    pending.get("walled")!.h.onClosed("auth-required: sign in", true);
    expect(state("walled").state).toBe("auth");
    pager.retryAuth();
    expect(state("walled").state).toBe("loading");
    answer("walled", [FLOOR - 3]);
    expect(state("walled").reachedUntil).toBe(FLOOR - 3);
    expect(listener).toHaveBeenCalled();
  });

  it("ignores a late answer from a page it already gave up on", () => {
    const { pager, pending, fireTimers, state } = harness();
    pager.setRelays(["r"]);
    pager.advance("r");
    const stale = pending.get("r")!;
    fireTimers();
    stale.h.onEvent(ev(FLOOR - 1));
    stale.h.onEose();
    expect(state("r").state).toBe("stalled");
    expect(state("r").reachedUntil).toBe(FLOOR);
  });
});
