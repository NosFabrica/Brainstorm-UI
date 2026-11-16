import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KNOWN_COMPROMISED } from "@/config/compromised";
import { __resetCompromised, lookupCompromised, settledCompromised } from "./compromised";

// The real lookup: test/setup.ts answers "nobody" for every other suite.
vi.unmock("@/services/compromised");

const A = "a".repeat(64);
const B = "b".repeat(64);
const PROOF = "c".repeat(64);
const NEW_KEY = "d".repeat(64);

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
      since: 1794855600,
      proofEventId: PROOF,
      proofEvent: { id: PROOF, pubkey: A, kind: 1, created_at: 1794847395, content: "my key leaked", tags: [] },
      successorPubkey: NEW_KEY,
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

  it("an account we already know is compromised answers at once, and the server cannot clear it", async () => {
    const known = KNOWN_COMPROMISED[0];
    expect(settledCompromised(known.pubkey)).toEqual(known);

    fetchMock.mockResolvedValue(answer([{ pubkey: known.pubkey, compromised: false }]));
    const found = lookupCompromised(known.pubkey);
    await vi.runAllTimersAsync();
    expect(await found).toEqual(known);
  });

  it("the server's record of a known account replaces ours", async () => {
    const known = KNOWN_COMPROMISED[0];
    fetchMock.mockResolvedValue(
      answer([{ pubkey: known.pubkey, compromised: true, since: "2026-11-16T19:00:00Z", successor_pubkey: NEW_KEY }]),
    );
    const found = lookupCompromised(known.pubkey);
    await vi.runAllTimersAsync();
    expect((await found)?.successorPubkey).toBe(NEW_KEY);
    // The proof we hold survives a record that has lost its own.
    expect((await found)?.proofEventId).toBe(known.proofEventId);
  });
});
