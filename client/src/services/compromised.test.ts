import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetCompromised, lookupCompromised, replacedCompromised, settledCompromised } from "./compromised";

// The real lookup: test/setup.ts answers "nobody" for every other suite.
vi.unmock("@/services/compromised");

const A = "a".repeat(64);
const B = "b".repeat(64);
const PROOF = "c".repeat(64);
const NEW_KEY = "d".repeat(64);
const POST = "e".repeat(64);

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function answer(results: unknown[], status = 200): Response {
  return new Response(JSON.stringify({ data: { results } }), { status });
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetCompromised();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("compromised accounts", () => {
  it("accounts looked up together go out as one request, and the marked one comes back compromised", async () => {
    fetchMock.mockResolvedValue(
      answer([
        {
          pubkey: A,
          compromised: true,
          since: "2026-11-16T19:00:00Z",
          proof_event_id: PROOF,
          proof_event: { id: PROOF, pubkey: A, kind: 1, created_at: 1794847395, content: "my key leaked", tags: [] },
          successor_pubkey: NEW_KEY,
          successor_event_id: POST,
        },
        { pubkey: B, compromised: false },
      ]),
    );

    const a = lookupCompromised(A);
    const b = lookupCompromised(B);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/compromised$/);
    expect(JSON.parse(String(init?.body))).toEqual({ pubkeys: [A, B] });
    expect(await a).toEqual({
      pubkey: A,
      // Marked at 19:00, but the owner's proof was posted at 16:43 with the key already
      // taken: content from then on may be anyone's, so the earlier moment starts it.
      since: 1794847395,
      proofEventId: PROOF,
      proofEvent: { id: PROOF, pubkey: A, kind: 1, created_at: 1794847395, content: "my key leaked", tags: [] },
      successorPubkey: NEW_KEY,
      successorEventId: POST,
    });
    expect(await b).toBeNull();
    expect(settledCompromised(A)?.pubkey).toBe(A);
    expect(settledCompromised(B)).toBeNull();
  });

  it("an account nobody has answered for yet is undefined, never clean", () => {
    expect(settledCompromised(A)).toBeUndefined();
  });

  it("a server without the check is asked once, then left alone", async () => {
    fetchMock.mockResolvedValue(new Response('{"detail":"Not Found"}', { status: 404 }));

    const a = lookupCompromised(A);
    await vi.runAllTimersAsync();
    expect(await a).toBeNull();

    const b = lookupCompromised(B);
    await vi.runAllTimersAsync();
    expect(await b).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads the server's offset-less timestamps as UTC", async () => {
    fetchMock.mockResolvedValue(answer([{ pubkey: A, compromised: true, since: "2026-11-16T19:00:00.123456" }]));
    const found = lookupCompromised(A);
    await vi.runAllTimersAsync();
    expect((await found)?.since).toBe(1794855600);
  });

  it("an account the server hasn't marked reads as not compromised, whoever it is", async () => {
    // Once known to the UI from a hard-coded list; the server is the only record now.
    const derek = "3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24";
    expect(settledCompromised(derek)).toBeUndefined();
    fetchMock.mockResolvedValue(answer([{ pubkey: derek, compromised: false }]));
    const found = lookupCompromised(derek);
    await vi.runAllTimersAsync();
    expect(await found).toBeNull();
  });

  it("an owner's new account learns from its own answer which account it replaces", async () => {
    expect(replacedCompromised(NEW_KEY)).toBeNull();
    fetchMock.mockResolvedValue(
      answer([
        {
          pubkey: NEW_KEY,
          compromised: false,
          replaces: { pubkey: A, compromised: true, since: "2026-11-16T00:00:00", successor_pubkey: NEW_KEY },
        },
      ]),
    );
    const found = lookupCompromised(NEW_KEY);
    await vi.runAllTimersAsync();

    expect(await found).toBeNull();
    expect(replacedCompromised(NEW_KEY)).toMatchObject({ pubkey: A, since: 1794787200, successorPubkey: NEW_KEY });
    expect(replacedCompromised(B)).toBeNull();
  });

  it("knows the new account from the old account's record, too", async () => {
    fetchMock.mockResolvedValue(answer([{ pubkey: A, compromised: true, successor_pubkey: NEW_KEY }]));
    void lookupCompromised(A);
    await vi.runAllTimersAsync();
    expect(replacedCompromised(NEW_KEY)?.pubkey).toBe(A);
  });
});
