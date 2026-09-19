// @vitest-environment node
/**
 * Where a search-box pill's face comes from. Two sources asked at once — the search relay under
 * `include:spam`, and the person's own write relays — with the newer kind-0 winning.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { Observable } from "rxjs";

const reqMock = vi.fn();
vi.mock("@/lib/searchRelay", () => ({ searchRelay: () => ({ req: (...a: unknown[]) => reqMock(...a) }) }));

const storeGet = vi.fn<() => NostrEvent | undefined>(() => undefined);
const storeAdd = vi.fn();
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: () => storeGet(), add: (e: NostrEvent) => storeAdd(e) },
}));

const loadReplaceableMock = vi.fn<() => Promise<NostrEvent | undefined>>(() => Promise.resolve(undefined));
vi.mock("@/lib/loaders", () => ({ loadReplaceable: (...a: unknown[]) => loadReplaceableMock(...(a as [])) }));

const outboxMock = vi.fn<(pk: string, fallback: string[]) => string[]>((_pk, fallback) => fallback);
vi.mock("@/services/nostr", () => ({
  loadOutboxRelayListFromDb: (pk: string, fallback: string[]) => outboxMock(pk, fallback),
}));
vi.mock("@/lib/relays", () => ({ PROFILE_RELAYS: ["wss://default.example/"] }));

import { fetchPillProfiles } from "./searchFaces";

const JOE = "e".repeat(64);
const profile = (name: string, at: number, pubkey = JOE): NostrEvent =>
  ({ id: `${name}${at}`, kind: 0, pubkey, tags: [], created_at: at, sig: "s", content: JSON.stringify({ display_name: name }) }) as NostrEvent;

/** One REQ answering with these events, then EOSE. */
const answers = (events: NostrEvent[]) =>
  new Observable((sub) => {
    for (const event of events) sub.next({ type: "EVENT", event });
    sub.next({ type: "EOSE" });
    return () => {};
  });

beforeEach(() => {
  vi.clearAllMocks();
  storeGet.mockReturnValue(undefined);
  loadReplaceableMock.mockResolvedValue(undefined);
  outboxMock.mockImplementation((_pk, fallback) => fallback);
  reqMock.mockImplementation(() => answers([]));
});

describe("fetchPillProfiles", () => {
  it("asks the search relay for the kind-0s, waiving the lens", async () => {
    reqMock.mockImplementation(() => answers([profile("Joe Martin", 100)]));
    const found = await fetchPillProfiles([JOE]);
    // `include:spam` is not optional: the relay refuses a read that names no lens, and an
    // observer is by definition somebody the reader's own web of trust may rank at nothing.
    expect(reqMock).toHaveBeenCalledWith({ kinds: [0], authors: [JOE], search: "include:spam", limit: 1 });
    expect(found.get(JOE)?.displayName).toBe("Joe Martin");
  });

  it("asks their own write relays too, from the kind-10002 the store holds", async () => {
    outboxMock.mockReturnValue(["wss://joes-own-relay.example/"]);
    loadReplaceableMock.mockResolvedValue(profile("Joe Martin", 100));
    await fetchPillProfiles([JOE]);
    expect(outboxMock).toHaveBeenCalledWith(JOE, ["wss://default.example/"]);
    expect(loadReplaceableMock).toHaveBeenCalledWith(0, JOE, expect.objectContaining({
      relays: ["wss://joes-own-relay.example/"],
    }));
  });

  it("the newer kind-0 wins — their own relays carry what they last published", async () => {
    reqMock.mockImplementation(() => answers([profile("Old Name", 100)]));
    loadReplaceableMock.mockResolvedValue(profile("New Name", 200));
    expect((await fetchPillProfiles([JOE])).get(JOE)?.displayName).toBe("New Name");
  });

  it("…and the search relay's wins when it is the newer one", async () => {
    reqMock.mockImplementation(() => answers([profile("New Name", 200)]));
    loadReplaceableMock.mockResolvedValue(profile("Old Name", 100));
    expect((await fetchPillProfiles([JOE])).get(JOE)?.displayName).toBe("New Name");
  });

  it("what the store already holds is the starting point, and every answer goes back into it", async () => {
    storeGet.mockReturnValue(profile("Held Already", 300));
    const found = await fetchPillProfiles([JOE]);
    expect(found.get(JOE)?.displayName).toBe("Held Already");
    expect(storeAdd).toHaveBeenCalled();
  });

  // A pill whose profile is already in hand must not sit on its skeleton while two network
  // reads run out. `loadReplaceable` only settles at its own timeout for somebody with no
  // kind-0 on their relays, which is exactly the common case for an `observer:` key.
  it("answers from the store without asking anything at all", async () => {
    storeGet.mockReturnValue(profile("Held Already", 300));
    const found = await fetchPillProfiles([JOE]);
    expect(found.get(JOE)?.displayName).toBe("Held Already");
    expect(reqMock).not.toHaveBeenCalled();
    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });

  it("does not wait on the slower source once it has a face for everybody", async () => {
    reqMock.mockImplementation(() => answers([profile("Joe Martin", 100)]));
    // Their own relays never answer — the read that would otherwise hold the pill.
    loadReplaceableMock.mockImplementation(() => new Promise(() => {}));
    const found = await Promise.race([
      fetchPillProfiles([JOE]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("waited on the hung source")), 1000)),
    ]);
    expect((found as Map<string, { displayName?: string }>).get(JOE)?.displayName).toBe("Joe Martin");
  });

  it("a key nobody has a kind-0 for is simply absent — no throw, no empty face", async () => {
    const found = await fetchPillProfiles([JOE]);
    expect(found.size).toBe(0);
  });

  it("asks nothing at all for a malformed key", async () => {
    expect((await fetchPillProfiles(["not-a-key", ""])).size).toBe(0);
    expect(reqMock).not.toHaveBeenCalled();
  });

  it("a relay that errors does not take the other source down with it", async () => {
    reqMock.mockImplementation(() => new Observable((sub) => { sub.error(new Error("closed")); return () => {}; }));
    loadReplaceableMock.mockResolvedValue(profile("Joe Martin", 100));
    expect((await fetchPillProfiles([JOE])).get(JOE)?.displayName).toBe("Joe Martin");
  });
});
