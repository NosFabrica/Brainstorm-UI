import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stubAccount } from "@/test/accountStub";

const active = vi.hoisted(() => ({ account: undefined as unknown }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => active.account }));

import { apiClient } from "@/services/api";

const PK = "a".repeat(64);

const SCHEDULED = {
  pubkey: PK,
  subscription_id: "7d3b",
  // The trap, on the wire: Flash accepted the cancellation and still reports
  // them active, because the account cancels at period end.
  flash_status: "active",
  cancel_effective_date: "2026-09-20",
  cancellation_scheduled: true,
  applied: false,
  reason: "held",
};

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

describe("the admin's writes to a subscription", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cancels through the subscription's own cancel path, carrying the reason", async () => {
    const fetchMock = mockFetchOnce(SCHEDULED);

    const out = await apiClient.cancelAdminBillingSubscription(PK, "Duplicate signup");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://test.local/admin/billing/subscriptions/${PK}/cancel`,
    );
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ reason: "Duplicate signup" });
    expect(out.cancellation_scheduled).toBe(true);
    expect(out.cancel_effective_date).toBe("2026-09-20");
  });

  it("sends no reason when the operator gave none", async () => {
    const fetchMock = mockFetchOnce(SCHEDULED);

    await apiClient.cancelAdminBillingSubscription(PK, "   ");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it("pauses and resumes through the same status endpoint", async () => {
    const fetchMock = mockFetchOnce({ ...SCHEDULED, flash_status: "paused" });

    await apiClient.setAdminBillingSubscriptionStatus(PK, "paused");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://test.local/admin/billing/subscriptions/${PK}/status`,
    );
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ status: "paused" });
  });

  it("says the key cannot manage subscriptions rather than that Flash is down", async () => {
    mockFetchOnce(
      {
        detail:
          "Flash refused our credentials, so nothing was changed. The API key may not carry the scope needed to manage subscriptions; retrying will not help.",
      },
      { ok: false, status: 502 },
    );

    await expect(
      apiClient.cancelAdminBillingSubscription(PK),
    ).rejects.toThrow(/scope needed to manage subscriptions/);
  });

  it("keeps an unreachable Flash apart from a refused one", async () => {
    mockFetchOnce(
      { detail: "Could not reach Flash, so we do not know what it says. Nothing was changed." },
      { ok: false, status: 503 },
    );

    await expect(
      apiClient.setAdminBillingSubscriptionStatus(PK, "paused"),
    ).rejects.toThrow(/Could not reach Flash/);
  });

  it("still fails legibly when the server says nothing useful", async () => {
    mockFetchOnce(null, { ok: false, status: 500 });

    await expect(
      apiClient.cancelAdminBillingSubscription(PK),
    ).rejects.toThrow(/500/);
  });
});

// ---------------------------------------------------------------------------
// Resolving a signup that named nobody
//
// These are keyed by the Flash subscription id, not a pubkey: an unresolved
// signup has no person on it, which is the whole reason it is unresolved.
// ---------------------------------------------------------------------------
const RESOLVED = {
  subscription_id: "01a01f88-0d7f-734b-b724-13e32b482f57",
  resolution: "attributed",
  pubkey: PK,
  applied: true,
  entitlement_reason: "granted",
  events_settled: 1,
};

describe("resolving an unresolved signup", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attributes by subscription id, sending only the hex key the server validates", async () => {
    const fetchMock = mockFetchOnce(RESOLVED);

    const out = await apiClient.attributeAdminBillingUnresolved(
      "01a01f88-0d7f-734b-b724-13e32b482f57",
      PK,
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://test.local/admin/billing/unresolved/01a01f88-0d7f-734b-b724-13e32b482f57/attribute",
    );
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ pubkey: PK });
    expect(out.applied).toBe(true);
    expect(out.entitlement_reason).toBe("granted");
  });

  it("escapes the id rather than letting it shape the path", async () => {
    const fetchMock = mockFetchOnce({ ...RESOLVED, resolution: "dismissed" });

    await apiClient.dismissAdminBillingUnresolved("sub/../subscriptions");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://test.local/admin/billing/unresolved/sub%2F..%2Fsubscriptions/dismiss",
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("passes the server's refusal through as the sentence it is", async () => {
    mockFetchOnce(
      {
        detail:
          "This user already holds subscription 7d3b. Resolve that one first.",
      },
      { ok: false, status: 409 },
    );

    await expect(
      apiClient.attributeAdminBillingUnresolved("7d3b", PK),
    ).rejects.toThrow(/already holds subscription 7d3b/);
  });
});

describe("the checkout return's refresh", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the server the subscriptionId the redirect named", async () => {
    const fetchMock = mockFetchOnce({ data: { status: "active" } });

    await apiClient.refreshSubscription("7d3b");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/user/subscription/refresh");
    expect(JSON.parse(options.body)).toEqual({ subscription_id: "7d3b" });
  });

  it("sends no body at all when there is no id — the pending poll's shape", async () => {
    const fetchMock = mockFetchOnce({ data: { status: "pending" } });

    await apiClient.refreshSubscription();

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });
});
