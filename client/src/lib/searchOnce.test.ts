// @vitest-environment node
/**
 * The one-shot search-relay question: only answers to what was asked, only
 * what the store keeps, and the store's copy of it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools";

vi.mock("./searchRelay", () => ({ searchRelay: () => null }));

import { eventStore } from "./eventStore";
import { searchOnce } from "./searchOnce";

type Frame = { type: string; event?: NostrEvent };
function fakeRelay() {
  const frames = new Subject<Frame>();
  const req = vi.fn(() => frames);
  return { relay: { req } as never, frames, req };
}

const key = generateSecretKey();
const me = getPublicKey(key);
const other = generateSecretKey();
const sign = (k: Uint8Array, created_at: number, kind = 0) =>
  finalizeEvent({ kind, content: "{}", tags: [], created_at }, k);

beforeEach(() => {
  for (const e of eventStore.getByFilters([{}])) eventStore.remove(e);
});

describe("searchOnce", () => {
  it("keeps only events that answer the filters and that the store lets in, as the store's copy", async () => {
    const { relay, frames } = fakeRelay();
    const seen: NostrEvent[] = [];
    const newer = sign(key, 200);
    eventStore.add(newer);
    const pending = searchOnce({ kinds: [0], authors: [me] }, { relay, timeoutMs: 1000, onEvent: (e) => seen.push(e) });
    frames.next({ type: "EVENT", event: sign(other, 300) }); // not asked for
    frames.next({ type: "EVENT", event: { ...sign(key, 250), content: "forged" } }); // bad signature
    frames.next({ type: "EVENT", event: sign(key, 100) }); // older: the store's newer copy stands
    frames.next({ type: "EOSE" });
    const { events, answered } = await pending;
    expect(answered).toBe(true);
    expect(events.map((e) => e.id)).toEqual([newer.id]);
    expect(events[0]).toBe(eventStore.getReplaceable(0, me));
    expect(seen).toEqual(events);
  });

  it("is unanswered on a refusal, the deadline or stop, keeping what arrived", async () => {
    vi.useFakeTimers();
    try {
      const a = fakeRelay();
      const refused = searchOnce({ kinds: [0], authors: [me] }, { relay: a.relay, timeoutMs: 1000 });
      a.frames.next({ type: "EVENT", event: sign(key, 10) });
      a.frames.next({ type: "CLOSED" });
      expect(await refused).toMatchObject({ answered: false, events: [{ pubkey: me }] });

      const b = fakeRelay();
      const late = searchOnce({ kinds: [0], authors: [me] }, { relay: b.relay, timeoutMs: 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await late).toEqual({ answered: false, events: [] });

      const c = fakeRelay();
      const stop = new Subject<void>();
      const stopped = searchOnce({ kinds: [0], authors: [me] }, { relay: c.relay, timeoutMs: 1000, stop });
      stop.next();
      expect(await stopped).toEqual({ answered: false, events: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers nothing, unanswered, without a search relay", async () => {
    expect(await searchOnce({ kinds: [0] }, { timeoutMs: 1000 })).toEqual({ answered: false, events: [] });
  });
});
