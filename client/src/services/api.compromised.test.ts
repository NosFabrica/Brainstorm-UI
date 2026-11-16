import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stubAccount } from "@/test/accountStub";

const active = vi.hoisted(() => ({ account: undefined as unknown }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => active.account }));

import { apiClient } from "@/services/api";

const PK = "3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24";
const NPUB = "npub18ams6ewn5aj2n3wt2qawzglx9mr4nzksxhvrdc4gzrecw7n5tvjqctp424";

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
    clone() {
      return this;
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the public compromised check", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GETs one account without a session and unwraps it", async () => {
    const status = { pubkey: PK, compromised: true, since: "2026-11-16T17:00:00" };
    const fetchMock = mockFetch({ code: 200, data: status });

    expect(await apiClient.getCompromisedStatus(PK)).toEqual(status);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://test.invalid/compromised/${PK}`);
    expect(options?.headers?.Authorization).toBeUndefined();
  });

  it("reads a failed check as unknown, never as an error", async () => {
    mockFetch({}, { ok: false, status: 503 });
    expect(await apiClient.getCompromisedStatus(PK)).toBeNull();
  });
});

describe("the admin compromised calls", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("PUTs a mark with the body as given", async () => {
    const row = { pubkey: PK, proof_event_id: "x" };
    const fetchMock = mockFetch(row);

    expect(await apiClient.markCompromised(NPUB, { proof_event_id: "nevent1x", reason: "leak" })).toEqual(row);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://test.invalid/admin/compromised/${NPUB}`);
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ proof_event_id: "nevent1x", reason: "leak" });
  });

  it("turns a validation 422 into a sentence", async () => {
    mockFetch(
      { detail: [{ loc: ["body", "successor_pubkey"], msg: "Value error, 'npub1nope' is not a pubkey" }] },
      { ok: false, status: 422 },
    );
    await expect(apiClient.markCompromised(PK, { successor_pubkey: "npub1nope" })).rejects.toThrow(
      "'npub1nope' is not a pubkey",
    );
  });

  it("surfaces the server's sentence", async () => {
    mockFetch({ detail: "A new account needs proof_event or proof_event_id." }, { ok: false, status: 422 });
    await expect(apiClient.markCompromised(PK, {})).rejects.toThrow(/needs proof_event/);
  });

  it("PATCHes only the successor and note", async () => {
    const fetchMock = mockFetch({ pubkey: PK });
    await apiClient.updateCompromisedMetadata(PK, { successor_pubkey: null });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://test.invalid/admin/compromised/${PK}`);
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ successor_pubkey: null });
  });

  it("DELETEs to unmark, answering nothing on a 204", async () => {
    const fetchMock = mockFetch(undefined, { status: 204 });
    await expect(apiClient.unmarkCompromised(PK)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});
