import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Resolving whose scores decide a tagging — issue #41 B1-proper.
 *
 * The defect this replaces: tags read one hardcoded relay + author pair out of
 * `tagging.config.json`, pointed at the Tapestry reference deployment. Measured
 * 2026-08-11, that relay held 500 kind-30382 events, every one signed by a
 * RETIRED key and stamped 2026-05-26. Every viewer got the same day-old-by-ten-
 * weeks snapshot, from someone else's instance, and the Brainstorm /
 * My-perspective toggle had no effect on tags at all.
 *
 * These tests pin the mechanism, not the values: an observer names its scorer in
 * its own kind-10040, and we honor that.
 */

const nostr = vi.hoisted(() => ({ fetchTrustProviderList: vi.fn() }));
vi.mock("./nostr", () => nostr);

const HOUSE = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";
const HOUSE_TA = "78ed0837eba0ba24" + "0".repeat(48);
const USER = "db12289ceb3c10adc9c85a15b518f0f5c9aa31db7509426e77a9c657f1184578";
const USER_TA = "eb0f3fa9fded4b4c" + "0".repeat(48);
const RELAY = "wss://scores.brainstorm.world";

/** A kind-10040 as the client itself publishes it (`signNip85`). */
const declaration = (ta: string, relay: string) => ({
  kind: 10040,
  tags: [
    ["30382:rank", ta, relay],
    ["30382:followers", ta, relay],
  ],
});

async function load() {
  const mod = await import("./trustSource");
  mod.__resetTrustSourceCaches();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  nostr.fetchTrustProviderList.mockReset();
  vi.unstubAllGlobals();
});

describe("resolveTrustSource", () => {
  it("honors the TA and relay the observer's own 10040 names", async () => {
    nostr.fetchTrustProviderList.mockResolvedValue(declaration(USER_TA, RELAY));
    const { resolveTrustSource } = await load();
    expect(await resolveTrustSource(USER)).toEqual({ taPubkey: USER_TA, relay: RELAY });
  });

  it("gives different observers different sources", async () => {
    // The whole point of a per-observer trust graph: the same asserter can be
    // rank 100 to one assistant and unknown to another. Resolving every viewer
    // to one scorer is what made the PoV toggle inert for tags.
    nostr.fetchTrustProviderList.mockImplementation(async (pk: string) =>
      pk === HOUSE ? declaration(HOUSE_TA, RELAY) : declaration(USER_TA, RELAY),
    );
    const { resolveTrustSource } = await load();
    const house = await resolveTrustSource(HOUSE);
    const user = await resolveTrustSource(USER);
    expect(house?.taPubkey).toBe(HOUSE_TA);
    expect(user?.taPubkey).toBe(USER_TA);
    expect(house?.taPubkey).not.toBe(user?.taPubkey);
  });

  it("returns null when the observer never published a declaration", async () => {
    // A real state, not an error — a brand-new account has no assistant yet.
    // Callers fall back to House rather than to "count everyone".
    nostr.fetchTrustProviderList.mockResolvedValue(undefined);
    const { resolveTrustSource } = await load();
    expect(await resolveTrustSource(USER)).toBeNull();
  });

  it("returns null rather than throwing when the lookup fails", async () => {
    nostr.fetchTrustProviderList.mockRejectedValue(new Error("relays down"));
    const { resolveTrustSource } = await load();
    expect(await resolveTrustSource(USER)).toBeNull();
  });

  it("ignores a declaration with no rank pointer", async () => {
    // `signNip85Deactivation` publishes an empty-tag 10040 to revoke. That must
    // read as "no scorer", not as a malformed source we half-honor.
    nostr.fetchTrustProviderList.mockResolvedValue({ kind: 10040, tags: [] });
    const { resolveTrustSource } = await load();
    expect(await resolveTrustSource(USER)).toBeNull();
  });

  it("reads the rank pointer specifically, not merely the first tag", async () => {
    // NIP-85 keys the pointer per metric and they need not agree. We gate on
    // rank, so rank is the entry that decides.
    nostr.fetchTrustProviderList.mockResolvedValue({
      kind: 10040,
      tags: [
        ["30382:followers", "f".repeat(64), "wss://wrong.example"],
        ["30382:rank", USER_TA, RELAY],
      ],
    });
    const { resolveTrustSource } = await load();
    expect(await resolveTrustSource(USER)).toEqual({ taPubkey: USER_TA, relay: RELAY });
  });

  it("asks the relays once per observer", async () => {
    nostr.fetchTrustProviderList.mockResolvedValue(declaration(USER_TA, RELAY));
    const { resolveTrustSource } = await load();
    await resolveTrustSource(USER);
    await resolveTrustSource(USER);
    await resolveTrustSource(USER);
    expect(nostr.fetchTrustProviderList).toHaveBeenCalledTimes(1);
  });
});

describe("resolveHouseObserver", () => {
  it("discovers the house identity from NIP-05 rather than a constant", async () => {
    // The client is deliberately built never to hardcode the house — it says
    // "house" by omitting a token and lets the server answer. Relays have no
    // such notion, so we ask the server who it is, the standard way.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ names: { _: HOUSE } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
    expect(fetchMock.mock.calls[0][0]).toContain("/.well-known/nostr.json?name=_");
  });

  it("returns null instead of guessing when discovery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBeNull();
  });

  it("rejects a malformed pubkey rather than passing it to a relay filter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: { _: "nope" } }) }),
    );
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBeNull();
  });
});
