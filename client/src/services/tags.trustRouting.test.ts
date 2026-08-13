import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRUST_RELAYS, NIP85_AUTHOR_PUBKEYS, Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { conceptNostrUserTag } from "@/lib/tagging-sdk/profile-tagging.js";

/**
 * WHERE the trust read goes — issue #41 B1-proper.
 *
 * This is the regression that started it all. Tags read kind-30382 from a
 * hardcoded relay + author pair in `tagging.config.json` belonging to the
 * Tapestry reference deployment. Measured 2026-08-11: 500 events, all signed by
 * a RETIRED key, all stamped 2026-05-26. Ten weeks stale, someone else's
 * instance, identical for every viewer.
 *
 * So the assertion here is deliberately about ROUTING rather than about scores:
 * if the trust query is ever addressed to `TRUST_RELAYS` or filtered by
 * `NIP85_AUTHOR_PUBKEYS` again, these go red — whatever the numbers happen to be
 * that day.
 */

const OBSERVER = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";
const OBSERVER_TA = "78ed0837eba0ba24" + "0".repeat(48);
const OBSERVER_RELAY = "wss://scores.brainstorm.world";
const ASSERTER = "e5272de914bd" + "1".repeat(52);
const TARGET = "2aa46e1f18c8" + "2".repeat(52);

const h = vi.hoisted(() => ({
  fetchEventsByFilter: vi.fn(),
  fetchTrustProviderList: vi.fn(),
  /** Every (filter, relays) pair the service asked for. */
  reads: [] as Array<{ filter: Record<string, unknown>; relays: string[] }>,
}));

vi.mock("./nostr", () => ({
  pool: { publish: async () => [] },
  fetchEventsByFilter: (filter: Record<string, unknown>, relays: string[]) => {
    h.reads.push({ filter, relays });
    return h.fetchEventsByFilter(filter, relays);
  },
  fetchTrustProviderList: (pk: string) => h.fetchTrustProviderList(pk),
  signEventLocally: async (e: unknown) => e,
  loadOutboxRelayListFromDb: () => [],
  getCurrentUser: () => null,
  publishToRelays: async () => ({ success: true }),
  PROFILE_RELAYS: ["wss://purplepag.es/"],
}));

/**
 * A tagging: ASSERTER says TARGET is a `musician`.
 *
 * The `z` handle has to be one the reader honors or `normalizeAssertions` drops
 * it before trust is ever consulted — so it comes from the real config rather
 * than a made-up string.
 */
const tagging = () => ({
  id: "a".repeat(64),
  kind: 39999,
  pubkey: ASSERTER,
  created_at: 1_700_000_000,
  content: "",
  tags: [
    ["d", "musician"],
    ["a", `39999:${"b".repeat(64)}:musician`],
    ["z", conceptNostrUserTag(Z_HANDLE_PUBKEYS[0])],
    ["p", TARGET],
    ["polarity", "1"],
  ],
});

const trustAssertion = (subject: string, rank: number, author: string) => ({
  id: "c".repeat(64),
  kind: 30382,
  pubkey: author,
  created_at: 1_760_000_000,
  content: "",
  tags: [
    ["d", subject],
    ["rank", String(rank)],
  ],
});

/** Which reads were kind-30382 lookups? */
const trustReads = () => h.reads.filter((r) => (r.filter.kinds as number[])?.includes(30382));

beforeEach(async () => {
  vi.resetModules();
  h.reads.length = 0;
  h.fetchEventsByFilter.mockReset();
  h.fetchTrustProviderList.mockReset();
  const { __resetTrustSourceCaches } = await import("./trustSource");
  __resetTrustSourceCaches();
});

describe("trust reads are addressed by the observer's kind-10040", () => {
  beforeEach(() => {
    h.fetchTrustProviderList.mockResolvedValue({
      kind: 10040,
      tags: [["30382:rank", OBSERVER_TA, OBSERVER_RELAY]],
    });
    h.fetchEventsByFilter.mockImplementation(
      async (filter: Record<string, unknown>) => {
        const kinds = (filter.kinds as number[]) || [];
        if (kinds.includes(30382)) return [trustAssertion(ASSERTER, 96, OBSERVER_TA)];
        if (kinds.includes(39999)) return [tagging()];
        return [];
      },
    );
  });

  it("queries the relay the declaration names", async () => {
    const { fetchProfileTags } = await import("./tags");
    await fetchProfileTags(TARGET, undefined, OBSERVER);

    const reads = trustReads();
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r.relays).toEqual([OBSERVER_RELAY]);
  });

  it("never addresses the configured TRUST_RELAYS for scores", async () => {
    // `wss://tags.brainstorm.world/relay` — the stale Tapestry corpus.
    const { fetchProfileTags } = await import("./tags");
    await fetchProfileTags(TARGET, undefined, OBSERVER);

    for (const r of trustReads()) {
      for (const configured of TRUST_RELAYS) {
        expect(r.relays).not.toContain(configured);
      }
    }
  });

  it("filters by the declaration's TA, never by the vendored author list", async () => {
    const { fetchProfileTags } = await import("./tags");
    await fetchProfileTags(TARGET, undefined, OBSERVER);

    const reads = trustReads();
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) {
      expect(r.filter.authors).toEqual([OBSERVER_TA]);
      for (const stale of NIP85_AUTHOR_PUBKEYS) {
        expect(r.filter.authors as string[]).not.toContain(stale);
      }
    }
  });

  it("counts a tagging whose author the declared TA scores", async () => {
    const { fetchProfileTags } = await import("./tags");
    const res = await fetchProfileTags(TARGET, undefined, OBSERVER);
    expect(res.tags.map((t) => t.slug)).toContain("musician");
    expect(res.trustUnverified).toBe(false);
  });
});

describe("an observer with no declaration", () => {
  it("trusts nobody and says so, rather than counting everyone", async () => {
    // The dangerous failure mode: no scorer resolved → predicate defaults to
    // permissive → every throwaway account counts again, silently. That is the
    // bug #41 B1 was filed about, reached by a different road.
    h.fetchTrustProviderList.mockResolvedValue(undefined);
    h.fetchEventsByFilter.mockImplementation(async (filter: Record<string, unknown>) =>
      ((filter.kinds as number[]) || []).includes(39999) ? [tagging()] : [],
    );

    const { fetchProfileTags } = await import("./tags");
    const res = await fetchProfileTags(TARGET, undefined, OBSERVER);

    expect(res.tags).toHaveLength(0);
    // An empty list must not read as a fact about the person.
    expect(res.trustUnverified).toBe(true);
    expect(trustReads()).toHaveLength(0);
  });

  it("falls back to the house when a personalized observer has none", async () => {
    // A signed-in account that hasn't activated has no assistant. It should see
    // the house view, not an empty page and not an unfiltered one.
    const NEWCOMER = "5a85b27920d0" + "3".repeat(52);
    h.fetchTrustProviderList.mockImplementation(async (pk: string) =>
      pk === NEWCOMER
        ? undefined
        : { kind: 10040, tags: [["30382:rank", OBSERVER_TA, OBSERVER_RELAY]] },
    );
    h.fetchEventsByFilter.mockImplementation(async (filter: Record<string, unknown>) => {
      const kinds = (filter.kinds as number[]) || [];
      if (kinds.includes(30382)) return [trustAssertion(ASSERTER, 96, OBSERVER_TA)];
      if (kinds.includes(39999)) return [tagging()];
      return [];
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: { _: OBSERVER } }) }),
    );

    const { fetchProfileTags } = await import("./tags");
    const res = await fetchProfileTags(TARGET, NEWCOMER, NEWCOMER);

    expect(res.tags.map((t) => t.slug)).toContain("musician");
    for (const r of trustReads()) expect(r.relays).toEqual([OBSERVER_RELAY]);
    vi.unstubAllGlobals();
  });
});
