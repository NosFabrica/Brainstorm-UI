/**
 * Trusted Lists (server PR #86): an admin publishes one observer's lists —
 * kind-30392 events computed from that observer's web of trust and signed by
 * their assistant key — and reads back what the run did.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stubAccount } from "@/test/accountStub";

const active = vi.hoisted(() => ({ account: undefined as unknown }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => active.account }));

import { apiClient, TrustedListsUnavailableError } from "@/services/api";

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

const OBSERVER = "b".repeat(64);

describe("apiClient.publishTrustedLists", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /admin/trustedLists/{observer} with no body and returns what the run did", async () => {
    const run = {
      observer: OBSERVER,
      signing_pubkey: "c".repeat(64),
      taggings_in_store: 12,
      qualifying_asserters: 4,
      dictionary_size: 1,
      published: 1,
      failed: 0,
      retracted: 0,
      empty_reason: null,
      tags: [
        {
          slug: "podcaster",
          d_tag: "tl-tag-bbbbbbbb-aaaaaaaa-podcaster",
          tag_event_id: "e".repeat(64),
          status: "published",
          taggings_considered: 5,
          member_count: 3,
          error: null,
        },
      ],
    };
    const fetchMock = mockFetchOnce({ code: 200, message: null, data: run });

    const result = await apiClient.publishTrustedLists(OBSERVER);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://test.local/admin/trustedLists/${OBSERVER}`);
    expect(options.method).toBe("POST");
    expect(options.body).toBeUndefined();
    expect(result).toEqual(run);
  });

  it("surfaces the server's refusal in its own words", async () => {
    mockFetchOnce({ detail: "observer_pubkey is not a valid hex pubkey or npub" }, { ok: false, status: 400 });

    await expect(apiClient.publishTrustedLists("nope")).rejects.toThrow(/not a valid hex pubkey or npub/);
  });

  // PR #86 may not be deployed where this UI runs. "Not on this server yet"
  // is a different thing to tell an admin than "the run failed".
  it("tells a server without trusted lists apart from a failed run", async () => {
    mockFetchOnce({ detail: "Not Found" }, { ok: false, status: 404 });

    await expect(apiClient.publishTrustedLists(OBSERVER)).rejects.toBeInstanceOf(TrustedListsUnavailableError);
  });
});

describe("apiClient.getSetupRows", () => {
  beforeEach(() => {
    active.account = stubAccount("test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Which key signs what, on which relay — where an observer's lists live.
  it("GETs /setup/{pubkey} and returns its rows", async () => {
    const rows = [["30382:rank", "c".repeat(64), "wss://ta.example"], ["30392", "c".repeat(64), "wss://tl.example"]];
    const fetchMock = mockFetchOnce({ code: 200, message: null, data: rows });

    const result = await apiClient.getSetupRows(OBSERVER);

    expect(fetchMock.mock.calls[0][0]).toBe(`http://test.local/setup/${OBSERVER}`);
    expect(result).toEqual(rows);
  });
});
