// @vitest-environment jsdom
/**
 * fetchLiveStreams feeds the public profile's "Live now" block and the live
 * badge on the avatar. Benjamin, over Channel 59's profile while it was
 * streaming: "when I click on their public profiles I can't see that they
 * are live streaming." The stream is a platform-authored kind 30311 that
 * names the channel in a `p` tag — and it sits on the search relay, which
 * this fetch never asked. Now it does, for both shapes (authored and hosted).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

const requestAllMock = vi.fn<() => Promise<NostrEvent[]>>(() => Promise.resolve([]));
vi.mock("@/lib/relayRequest", () => ({
  requestAll: (...args: unknown[]) => requestAllMock(...(args as [])),
  requestNewest: vi.fn(),
  requestNewestRaw: vi.fn(),
  requestOne: vi.fn(),
}));
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getEvent: () => undefined, getReplaceable: () => undefined, add: (e: NostrEvent) => e },
}));
const subjects: Subject<{ type: string; event?: NostrEvent }>[] = [];
const searchReqMock = vi.fn((_filter: unknown) => {
  const subj = new Subject<{ type: string; event?: NostrEvent }>();
  subjects.push(subj);
  return new Observable((subscriber) => {
    const inner = subj.subscribe(subscriber);
    return () => inner.unsubscribe();
  });
});
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({ req: (filter: unknown) => searchReqMock(filter) }),
}));

import { fetchLiveStreams } from "./nostr";

const CHANNEL = "d2b53661a56dfe3e2d1cb2a882d3897411c772a6e6f41981c62cd5e52ad6543a";
const BRIDGE = "b".repeat(64);
const stream = (id: string, d: string, status: string, created_at: number): NostrEvent =>
  ({ id, kind: 30311, pubkey: BRIDGE, created_at, content: "", sig: "s", tags: [["d", d], ["title", "Community Made Videos"], ["status", status], ["p", CHANNEL, "", "host"]] }) as NostrEvent;

beforeEach(() => {
  vi.clearAllMocks();
  subjects.length = 0;
});

describe("fetchLiveStreams", () => {
  it("asks the search relay for hosted and authored streams and merges them in", async () => {
    requestAllMock.mockResolvedValue([]);
    const p = fetchLiveStreams(CHANNEL, { timeoutMs: 500 });
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(2));
    const filters = searchReqMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kinds: [30311], "#p": [CHANNEL], search: "include:spam" }),
        expect.objectContaining({ kinds: [30311], authors: [CHANNEL], search: "include:spam" }),
      ]),
    );
    const hostedIdx = filters.findIndex((f) => "#p" in f);
    subjects[hostedIdx].next({ type: "EVENT", event: stream("old", "ch59", "live", 100) });
    subjects[hostedIdx].next({ type: "EVENT", event: stream("new", "ch59", "live", 200) }); // same coordinate, newer
    subjects.forEach((s) => s.next({ type: "EOSE" }));
    const out = await p;
    expect(out.map((e) => e.id)).toEqual(["new"]);
  });
});
