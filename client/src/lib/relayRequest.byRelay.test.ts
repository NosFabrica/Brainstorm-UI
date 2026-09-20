/**
 * `requestAllByRelay` — the send side of multi-author routing.
 *
 * The pool's `FilterInput` accepts a per-relay function, which is what turns an
 * outbox map into one filter per connection. Getting this wrong is invisible:
 * a filter map whose keys don't match the pool's would hand every relay an
 * empty author list, and the read would simply come back empty.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY, of } from "rxjs";
import type { NostrEvent } from "nostr-tools";

const requestMock = vi.fn(() => EMPTY);
vi.mock("./relayPool", () => ({ pool: { request: (...a: unknown[]) => requestMock(...(a as [])) } }));
vi.mock("./eventStore", () => ({ eventStore: { add: (e: unknown) => e } }));

import { requestAllByRelay } from "./relayRequest";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const plan = {
  relays: ["wss://one.example/", "wss://two.example/"],
  outboxes: {
    "wss://one.example/": [{ pubkey: ALICE, relays: ["wss://one.example/"] }],
    "wss://two.example/": [{ pubkey: BOB, relays: ["wss://two.example/"] }],
  },
};

/** The filter the pool would hand a given relay. */
function filterFor(url: string) {
  const build = requestMock.mock.calls[0][1] as (relay: { url: string }) => Record<string, unknown>;
  return build({ url });
}

beforeEach(() => {
  vi.clearAllMocks();
  requestMock.mockReturnValue(EMPTY);
});

describe("requestAllByRelay", () => {
  it("gives each relay a filter naming only its own authors", async () => {
    await requestAllByRelay(plan, { kinds: [1] }, 10);

    expect(filterFor("wss://one.example/")).toEqual({ kinds: [1], authors: [ALICE] });
    expect(filterFor("wss://two.example/")).toEqual({ kinds: [1], authors: [BOB] });
  });

  it("opens exactly the planned connections", async () => {
    await requestAllByRelay(plan, { kinds: [1] }, 10);

    expect(requestMock.mock.calls[0][0]).toEqual(plan.relays);
  });

  /** A key miss must narrow to nothing, never widen back to every author. */
  it("asks an unplanned relay for nothing", async () => {
    await requestAllByRelay(plan, { kinds: [1] }, 10);

    expect(filterFor("wss://surprise.example/")).toEqual({ kinds: [1], authors: [] });
  });

  it("never opens a connection for an empty plan", async () => {
    expect(await requestAllByRelay({ relays: [], outboxes: {} }, { kinds: [1] }, 10)).toEqual([]);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("de-dupes events that more than one relay returns", async () => {
    const event = { id: "e".repeat(64), kind: 1, pubkey: ALICE, created_at: 1, tags: [], content: "", sig: "s" } as NostrEvent;
    requestMock.mockReturnValueOnce(of(event, event) as never);

    expect(await requestAllByRelay(plan, { kinds: [1] }, 10)).toEqual([event]);
  });
});
