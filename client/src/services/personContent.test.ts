// @vitest-environment jsdom
/**
 * One question per person about what they publish, on the search relay,
 * remembered for the session. The relay is faked at the transport edge, the
 * way services/search.test.ts fakes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

interface ReqFrame { type: "OPEN" | "EVENT" | "EOSE" | "CLOSED"; from: string; id: string; event?: NostrEvent; reason?: string }

const reqMock = vi.fn();
let relayOn = true;
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => (relayOn ? { req: (...args: unknown[]) => reqMock(...args) } : null),
}));

import { __resetPersonContent, fetchPersonContent, peekPersonContent } from "./personContent";

const STACI = "5".repeat(64);
const NOW = Math.floor(Date.now() / 1000);
const ev = (kind: number, tags: string[][] = []): NostrEvent => ({ id: `${kind}-${tags.length}`, kind, pubkey: STACI, tags, content: "", created_at: NOW - 60, sig: "s" }) as NostrEvent;
const frame = (event: NostrEvent): ReqFrame => ({ type: "EVENT", from: "wss://x", id: "s", event });
const EOSE: ReqFrame = { type: "EOSE", from: "wss://x", id: "s" };
const CLOSED: ReqFrame = { type: "CLOSED", from: "wss://x", id: "s", reason: "auth-required" };

function controllable() {
  const subject = new Subject<ReqFrame>();
  const torndown = { count: 0 };
  reqMock.mockImplementation(
    () =>
      new Observable<ReqFrame>((subscriber) => {
        const inner = subject.subscribe(subscriber);
        return () => {
          torndown.count++;
          inner.unsubscribe();
        };
      }),
  );
  return { subject, torndown };
}

beforeEach(() => {
  __resetPersonContent();
  reqMock.mockReset();
  relayOn = true;
});
afterEach(() => vi.useRealTimers());

describe("fetchPersonContent", () => {
  it("asks once, with seven lensed filters for the person", () => {
    controllable();
    fetchPersonContent(STACI).catch(() => {});
    expect(reqMock).toHaveBeenCalledTimes(1);
    const filters = reqMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(filters).toHaveLength(7);
    for (const f of filters) expect(f).toEqual(expect.objectContaining({ authors: [STACI], limit: 1, search: "include:spam" }));
  });

  it("settles on EOSE with what arrived, and lets the subscription go", async () => {
    const { subject, torndown } = controllable();
    const p = fetchPersonContent(STACI);
    subject.next(frame(ev(30402)));
    subject.next(frame(ev(30311, [["title", "Show"], ["status", "live"]])));
    subject.next(EOSE);
    expect(await p).toEqual({ chips: [{ key: "shop", label: "Shop", tab: "shop", liveNow: false }, { key: "live", label: "Live", tab: "live", liveNow: true }] });
    expect(torndown.count).toBe(1);
  });

  it("one ask per person: a second caller shares the first, and the answer is remembered", async () => {
    const { subject } = controllable();
    const p1 = fetchPersonContent(STACI);
    const p2 = fetchPersonContent(STACI);
    expect(p2).toBe(p1);
    expect(reqMock).toHaveBeenCalledTimes(1);
    expect(peekPersonContent(STACI)).toBeUndefined();
    subject.next(frame(ev(30402)));
    subject.next(EOSE);
    const answer = await p1;
    expect(peekPersonContent(STACI)).toBe(answer);
    expect(await fetchPersonContent(STACI)).toBe(answer);
    expect(reqMock).toHaveBeenCalledTimes(1);
  });

  it("a refused ask is not remembered — the next caller asks again", async () => {
    const { subject } = controllable();
    const p = fetchPersonContent(STACI);
    subject.next(CLOSED);
    await expect(p).rejects.toThrow();
    expect(peekPersonContent(STACI)).toBeUndefined();
    fetchPersonContent(STACI).catch(() => {});
    expect(reqMock).toHaveBeenCalledTimes(2);
  });

  it("a broken stream is not remembered either", async () => {
    const { subject } = controllable();
    const p = fetchPersonContent(STACI);
    subject.error(new Error("boom"));
    await expect(p).rejects.toThrow();
    fetchPersonContent(STACI).catch(() => {});
    expect(reqMock).toHaveBeenCalledTimes(2);
  });

  it("gives up at the deadline and forgets", async () => {
    vi.useFakeTimers();
    const { torndown } = controllable();
    const p = fetchPersonContent(STACI, 4000);
    const rejected = expect(p).rejects.toThrow();
    vi.advanceTimersByTime(4000);
    await rejected;
    expect(torndown.count).toBe(1);
    fetchPersonContent(STACI, 4000).catch(() => {});
    expect(reqMock).toHaveBeenCalledTimes(2);
  });

  it("no relay configured: nothing to say, nothing asked", async () => {
    relayOn = false;
    expect(await fetchPersonContent(STACI)).toEqual({ chips: [] });
    expect(reqMock).not.toHaveBeenCalled();
  });
});
