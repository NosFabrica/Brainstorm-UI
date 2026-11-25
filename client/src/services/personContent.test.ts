// @vitest-environment jsdom
/**
 * One question per person about what they publish, on the search relay,
 * remembered for the session. The relay is faked at the transport edge, the
 * way services/search.test.ts fakes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

interface ReqFrame {
  type: "OPEN" | "EVENT" | "EOSE" | "CLOSED";
  from: string;
  id: string;
  event?: NostrEvent;
  reason?: string;
}

const reqMock = vi.fn();
let relayOn = true;
const releaseMock = vi.fn();
vi.mock("@/lib/searchRelay", () => ({
  // The shared side socket: asked on, and given back once the question is settled.
  leaseSideSearchRelay: () =>
    relayOn ? { relay: { req: (...args: unknown[]) => reqMock(...args) }, release: () => releaseMock() } : null,
}));

import { __resetPersonContent, fetchPersonContent, peekPersonContent } from "./personContent";
import { eventStore } from "@/lib/eventStore";

/** What the store answers an add with: the event, kept, unless a case says otherwise. */
const storeAdd = vi.fn((e: NostrEvent): NostrEvent | null => e);

const STACI = "5".repeat(64);
const NOW = Math.floor(Date.now() / 1000);
const ev = (kind: number, tags: string[][] = []): NostrEvent =>
  ({
    id: `${kind}-${tags.length}`,
    kind,
    pubkey: STACI,
    tags,
    content: "",
    created_at: NOW - 60,
    sig: "s",
  }) as NostrEvent;
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
  localStorage.clear();
  __resetPersonContent();
  reqMock.mockReset();
  releaseMock.mockReset();
  relayOn = true;
  storeAdd.mockImplementation((e) => e);
  vi.spyOn(eventStore, "add").mockImplementation((e) => storeAdd(e as NostrEvent));
});
afterEach(() => vi.useRealTimers());

describe("fetchPersonContent", () => {
  it("asks once, with eight lensed filters for the person", () => {
    controllable();
    fetchPersonContent(STACI).catch(() => {});
    expect(reqMock).toHaveBeenCalledTimes(1);
    const filters = reqMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(filters).toHaveLength(8);
    for (const f of filters) expect(f).toEqual(expect.objectContaining({ authors: [STACI], search: "include:spam" }));
  });

  it("settles on EOSE with what arrived, and lets the subscription go", async () => {
    const { subject, torndown } = controllable();
    const p = fetchPersonContent(STACI);
    subject.next(frame(ev(30402)));
    subject.next(
      frame(
        ev(30311, [
          ["title", "Show"],
          ["status", "live"],
        ]),
      ),
    );
    subject.next(EOSE);
    expect(await p).toEqual({
      chips: [
        { key: "shop", label: "Shop", tab: "shop", liveNow: false },
        { key: "live", label: "Live", tab: "live", liveNow: true },
      ],
    });
    expect(torndown.count).toBe(1);
  });

  // A chip says what this person publishes: never from an event the store
  // refused, or one someone else signed.
  it("reads chips only from the person's own events the store kept", async () => {
    const { subject } = controllable();
    storeAdd.mockImplementation((e) => (e.kind === 30402 ? null : e));
    const p = fetchPersonContent(STACI);
    subject.next(frame(ev(30402)));
    subject.next(frame({ ...ev(30311, [["status", "live"]]), pubkey: "6".repeat(64) }));
    subject.next(EOSE);
    expect(await p).toEqual({ chips: [] });
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

// Benjamin (2026-09-24): recents wore their chips a beat late on every visit. A day's
// worth of answers lives in local storage, so a returning searcher sees them at once.
describe("fetchPersonContent — remembered across visits", () => {
  it("an answer from an earlier visit paints at once and is not asked again within a day", async () => {
    const { subject } = controllable();
    const p = fetchPersonContent(STACI);
    subject.next(frame(ev(30402)));
    subject.next(EOSE);
    await p;
    __resetPersonContent({ keepStored: true });
    expect(peekPersonContent(STACI)).toEqual({ chips: [{ key: "shop", label: "Shop", tab: "shop", liveNow: false }] });
    expect(await fetchPersonContent(STACI)).toEqual({
      chips: [{ key: "shop", label: "Shop", tab: "shop", liveNow: false }],
    });
    expect(reqMock).toHaveBeenCalledTimes(1);
  });

  it("a day later the person is asked about again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));
    const { subject } = controllable();
    const p = fetchPersonContent(STACI);
    subject.next(frame(ev(30402)));
    subject.next(EOSE);
    await p;
    __resetPersonContent({ keepStored: true });
    vi.setSystemTime(new Date("2026-09-25T10:00:01Z"));
    expect(peekPersonContent(STACI)).toBeUndefined();
    void fetchPersonContent(STACI).catch(() => {});
    expect(reqMock).toHaveBeenCalledTimes(2);
  });

  it("nothing to say is remembered too, and a broken store is no store", async () => {
    const { subject } = controllable();
    const p = fetchPersonContent(STACI);
    subject.next(EOSE);
    await p;
    __resetPersonContent({ keepStored: true });
    expect(peekPersonContent(STACI)).toEqual({ chips: [] });
    localStorage.setItem("brainstorm_person_content:v1", "{not json");
    __resetPersonContent({ keepStored: true });
    expect(peekPersonContent(STACI)).toBeUndefined();
  });

  // Every suggested row peeks per render: the whole map was parsed for each of them.
  it("reads the store once, however many people are peeked, and keeps it in step with what it writes", async () => {
    const { subject } = controllable();
    const p = fetchPersonContent(STACI);
    subject.next(frame(ev(30402)));
    subject.next(EOSE);
    await p;
    __resetPersonContent({ keepStored: true });
    const parse = vi.spyOn(JSON, "parse");
    try {
      for (let i = 0; i < 20; i++) peekPersonContent(String(i).padStart(64, "0"));
      expect(peekPersonContent(STACI)?.chips.map((c) => c.key)).toEqual(["shop"]);
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      parse.mockRestore();
    }
  });

  it("another tab's write is read again", () => {
    expect(peekPersonContent(STACI)).toBeUndefined();
    const at = Date.now();
    localStorage.setItem("brainstorm_person_content:v1", JSON.stringify({ [STACI]: { at, chips: [] } }));
    window.dispatchEvent(new StorageEvent("storage", { key: "brainstorm_person_content:v1" }));
    expect(peekPersonContent(STACI)).toEqual({ chips: [] });
  });
});

describe("fetchPersonContent — the side socket", () => {
  it("gives the shared side socket back once the question is settled", async () => {
    const { subject } = controllable();
    const p = fetchPersonContent(STACI);
    expect(releaseMock).not.toHaveBeenCalled();
    subject.next(EOSE);
    await p;
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
