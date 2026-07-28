/**
 * The three public read endpoints send no client-supplied verified threshold —
 * the server resolves the observer's saved trust preset instead. The frontend's
 * job is to ask for "verified" and render what comes back.
 *
 * Issue: .scratch/preset-verified-counts/issues/04-frontend-render-backend-truth.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "@/services/api";

const PK = "a".repeat(64);

function mockFetch(body: unknown = { code: 200, data: {} }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The URL of the single request the mock recorded, parsed. */
function requestedUrl(fetchMock: ReturnType<typeof mockFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0] as string);
}

function sentAuthHeader(fetchMock: ReturnType<typeof mockFetch>): unknown {
  const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
  return (init?.headers as Record<string, unknown> | undefined)?.access_token;
}

describe("public read endpoints send no threshold", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getUserOverview asks for nothing but the profile", async () => {
    const fetchMock = mockFetch();

    await apiClient.getUserOverview(PK);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe(`/user/${PK}/overview`);
    expect(url.search).toBe("");
  });

  it("getUserStats sends no threshold and no tier bands", async () => {
    // The bands are fixed server-side constants and the verified line comes
    // from the observer's saved preset, so there is nothing to ask for.
    const fetchMock = mockFetch();

    await apiClient.getUserStats(PK);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe(`/user/${PK}/stats`);
    expect(url.search).toBe("");
  });

  it("getUserConnections asks for verified_only, never a threshold", async () => {
    const fetchMock = mockFetch();

    await apiClient.getUserConnections(PK, "muted_by", {
      limit: 20,
      verified_only: true,
    });

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("verified_only")).toBe("true");
    expect(url.searchParams.get("min_influence")).toBeNull();
    expect(url.searchParams.get("verified_threshold")).toBeNull();
  });

  it("getUserConnections omits verified_only when it isn't asked for", async () => {
    const fetchMock = mockFetch();

    await apiClient.getUserConnections(PK, "followed_by", { limit: 20 });

    expect(requestedUrl(fetchMock).searchParams.get("verified_only")).toBeNull();
  });
});

describe("the house perspective bypasses the session", () => {
  beforeEach(() => {
    // A signed-in viewer: without `house`, these calls would attach the token
    // and return that viewer's personalized numbers.
    localStorage.setItem("brainstorm_session_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getUserStats with house:true sends no auth, so a shared link is identical for everyone", async () => {
    const fetchMock = mockFetch();

    await apiClient.getUserStats(PK, { house: true });

    expect(sentAuthHeader(fetchMock)).toBeUndefined();
  });

  it("getUserStats without house sends the viewer's token", async () => {
    const fetchMock = mockFetch();

    await apiClient.getUserStats(PK);

    expect(sentAuthHeader(fetchMock)).toBe("test-token");
  });

  it("getUserConnections with house:true sends no auth", async () => {
    const fetchMock = mockFetch();

    await apiClient.getUserConnections(PK, "followed_by", {
      verified_only: true,
      house: true,
    });

    expect(sentAuthHeader(fetchMock)).toBeUndefined();
  });
});
