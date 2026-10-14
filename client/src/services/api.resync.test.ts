import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stubAccount } from "@/test/accountStub";

const active = vi.hoisted(() => ({ account: undefined as unknown }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => active.account }));

import { apiClient } from "@/services/api";

const PK = "a".repeat(64);

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiClient.resyncObserver", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a resync with the target query and unwraps the wrapped result", async () => {
    const created = { id: 5, algorithm: "graperank", pubkey: PK };
    const fetchMock = mockFetchOnce({ code: 200, message: "ok", data: created });

    const result = await apiClient.resyncObserver(PK, "both");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://test.invalid/admin/users/${PK}/resync?target=both`);
    expect(options.method).toBe("POST");
    expect(result).toEqual(created);
  });

  it("surfaces the backend detail on a 422", async () => {
    mockFetchOnce({ detail: "invalid resync target 'nope'" }, { ok: false, status: 422 });

    await expect(apiClient.resyncObserver(PK, "nope")).rejects.toThrow(/invalid resync target/i);
  });
});

describe("apiClient.relayAudit", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the observer's relay audit and unwraps it", async () => {
    const data = { observer: PK, published: 3, on_relay: 2, missing: 1, orphans: 0, needs_resync: true };
    const fetchMock = mockFetchOnce({ code: 200, data });

    const result = await apiClient.relayAudit(PK);

    expect(fetchMock.mock.calls[0][0]).toBe(`http://test.invalid/admin/users/${PK}/relay-audit`);
    expect(result).toEqual(data);
  });
});
