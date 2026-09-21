/** Trust signals for many authors in one unauthenticated POST; never throws. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { stubAccount } from "@/test/accountStub";

const active = vi.hoisted(() => ({ account: undefined as unknown }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => active.account }));

import { apiClient } from "@/services/api";

const A = "a".repeat(64);
const B = "b".repeat(64);

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiClient.getTrustSignals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    active.account = undefined;
  });

  it("posts the pubkeys without a session token, even when signed in", async () => {
    active.account = stubAccount("session-token");
    const fetchMock = mockFetch({ json: async () => ({ code: 200, data: { results: [] } }) });

    await apiClient.getTrustSignals([A, B]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/user/trustSignals");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ pubkeys: [A, B] });
    expect((init.headers as Record<string, string>).access_token).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("maps each result to its author's influence and flag", async () => {
    mockFetch({
      json: async () => ({
        code: 200,
        data: {
          results: [
            { pubkey: A, influence: 0.42, verified: true, flagged: false },
            { pubkey: B, influence: null, verified: false, flagged: true },
          ],
        },
      }),
    });

    const signals = await apiClient.getTrustSignals([A, B]);

    expect(signals.get(A)).toEqual({ influence: 0.42, flagged: false });
    expect(signals.get(B)).toEqual({ influence: null, flagged: true });
  });

  it("answers an empty map when the server errors or the network fails", async () => {
    mockFetch({ ok: false, status: 503, json: async () => ({}) });
    expect((await apiClient.getTrustSignals([A])).size).toBe(0);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect((await apiClient.getTrustSignals([A])).size).toBe(0);
  });
});
