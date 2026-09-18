/** A caller can abort a profile text search mid-flight; the timeout still applies. */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/accounts/signing", () => ({ activeAccount: () => undefined }));

import { apiClient } from "@/services/api";

function hangingFetch() {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiClient.searchByText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aborts the request when the caller aborts", async () => {
    const fetchMock = hangingFetch();
    const controller = new AbortController();

    const pending = apiClient.searchByText("vitor", true, false, 60_000, 10, controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it("still gives up on its own after the timeout, as a timeout the API-down check counts", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiClient.searchByText("vitor", true, false, 20, 10, new AbortController().signal)).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
