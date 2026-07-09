import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    localStorage.setItem("brainstorm_session_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a resync with the target query and unwraps the wrapped result", async () => {
    const created = { id: 5, algorithm: "graperank", pubkey: PK };
    const fetchMock = mockFetchOnce({ code: 200, message: "ok", data: created });

    const result = await apiClient.resyncObserver(PK, "both");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://test.local/admin/users/${PK}/resync?target=both`);
    expect(options.method).toBe("POST");
    expect(result).toEqual(created);
  });

  it("surfaces the backend detail on a 422", async () => {
    mockFetchOnce({ detail: "invalid resync target 'nope'" }, { ok: false, status: 422 });

    await expect(apiClient.resyncObserver(PK, "nope")).rejects.toThrow(
      /invalid resync target/i,
    );
  });
});
