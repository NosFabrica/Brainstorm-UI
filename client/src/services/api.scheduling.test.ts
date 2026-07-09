import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "@/services/api";

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

describe("apiClient.getSchedulingPolicies", () => {
  beforeEach(() => {
    localStorage.setItem("brainstorm_session_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /admin/scheduling with the access_token header and returns the policy list", async () => {
    const policies = [
      { id: 1, name: "Weekly", schedule_interval_seconds: 604800, priority: 0, enabled: true, is_default: true, manual_quota_limit: 20, manual_quota_window_seconds: 604800 },
      { id: 2, name: "Daily", schedule_interval_seconds: 86400, priority: 10, enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400 },
    ];
    const fetchMock = mockFetchOnce(policies);

    const result = await apiClient.getSchedulingPolicies();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/admin/scheduling");
    expect((options.headers as Record<string, string>).access_token).toBe("test-token");
    expect(result).toEqual(policies);
  });

  it("unwraps a legacy {code,data,message} envelope", async () => {
    const policies = [
      { id: 1, name: "Weekly", schedule_interval_seconds: 604800, priority: 0, enabled: true, is_default: true, manual_quota_limit: 20, manual_quota_window_seconds: 604800 },
    ];
    mockFetchOnce({ code: 200, message: "ok", data: policies });

    const result = await apiClient.getSchedulingPolicies();

    expect(result).toEqual(policies);
  });

  it("throws the backend 'detail' message on a non-ok response", async () => {
    mockFetchOnce({ detail: "scheduler is on fire" }, { ok: false, status: 500 });

    await expect(apiClient.getSchedulingPolicies()).rejects.toThrow(
      "scheduler is on fire",
    );
  });
});

describe("apiClient scheduling policy mutations", () => {
  beforeEach(() => {
    localStorage.setItem("brainstorm_session_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a new policy and returns the created item", async () => {
    const body = {
      name: "Hourly", schedule_interval_seconds: 3600, priority: 5,
      enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400,
    };
    const created = { id: 3, ...body };
    const fetchMock = mockFetchOnce(created, { status: 201 });

    const result = await apiClient.createSchedulingPolicy(body);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/admin/scheduling");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body as string)).toEqual(body);
    expect(result).toEqual(created);
  });

  it("PATCHes only the provided fields of a policy", async () => {
    const updated = {
      id: 2, name: "Renamed", schedule_interval_seconds: 86400, priority: 10,
      enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400,
    };
    const fetchMock = mockFetchOnce(updated);

    const result = await apiClient.updateSchedulingPolicy(2, { name: "Renamed" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/admin/scheduling/2");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ name: "Renamed" });
    expect(result).toEqual(updated);
  });

  it("DELETEs a policy by id", async () => {
    const fetchMock = mockFetchOnce(null, { status: 204 });

    await apiClient.deleteSchedulingPolicy(2);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/admin/scheduling/2");
    expect(options.method).toBe("DELETE");
  });

  it("surfaces the 409 reason when a policy can't be deleted", async () => {
    mockFetchOnce({ detail: "Cannot delete the default policy" }, { ok: false, status: 409 });

    await expect(apiClient.deleteSchedulingPolicy(1)).rejects.toThrow(
      /default policy/,
    );
  });
});

describe("apiClient.assignUserScheduling", () => {
  const PK = "a".repeat(64);
  beforeEach(() => {
    localStorage.setItem("brainstorm_session_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs a user's scheduling assignment and returns the detail", async () => {
    const detail = { pubkey: PK, scheduling_id: 2, scheduling_name: "Daily" };
    const fetchMock = mockFetchOnce(detail);

    const result = await apiClient.assignUserScheduling(PK, 2);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://test.local/admin/users/${PK}/scheduling`);
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ scheduling_id: 2 });
    expect(result).toEqual(detail);
  });

  it("surfaces a 422 for an unknown policy id", async () => {
    mockFetchOnce({ detail: "Unknown scheduling policy id 99" }, { ok: false, status: 422 });

    await expect(apiClient.assignUserScheduling(PK, 99)).rejects.toThrow(
      /unknown scheduling policy/i,
    );
  });
});

describe("apiClient.getSchedulingStats", () => {
  beforeEach(() => {
    localStorage.setItem("brainstorm_session_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /admin/scheduling/stats and returns the stats", async () => {
    const stats = {
      throughput_per_day: 12.5,
      demand_per_day: 8,
      median_publish_seconds: 620,
      lane_depths: { "sched:admin": 0, message_queue: 3 },
      tier_slip_seconds: { Weekly: 0 },
    };
    const fetchMock = mockFetchOnce(stats);

    const result = await apiClient.getSchedulingStats();

    expect(fetchMock.mock.calls[0][0]).toBe("http://test.local/admin/scheduling/stats");
    expect(result).toEqual(stats);
  });
});

describe("apiClient scheduling policy users", () => {
  beforeEach(() => {
    localStorage.setItem("brainstorm_session_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs a paginated user page for a policy", async () => {
    const page = {
      items: [{ pubkey: "a".repeat(64), last_time_published_graperank: null }],
      total: 1, page: 1, size: 20, pages: 1,
    };
    const fetchMock = mockFetchOnce(page);

    const result = await apiClient.getSchedulingPolicyUsers(2, { page: 1, size: 20 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/admin/scheduling/2/users?page=1&size=20");
    expect(result).toEqual(page);
  });

  it("PUTs pubkeys to assign users to a policy and returns the count", async () => {
    const pubkeys = ["a".repeat(64), "b".repeat(64)];
    const fetchMock = mockFetchOnce({ assigned: 2 });

    const result = await apiClient.assignPolicyUsers(2, pubkeys);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/admin/scheduling/2/users");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ pubkeys });
    expect(result).toEqual({ assigned: 2 });
  });
});
