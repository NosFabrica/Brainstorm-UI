import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  localStorage.removeItem("brainstorm_house_observer");
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
    // `signNip85Deactivation` leaves an empty-tag 10040 when no other provider is named. That must
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
  /** config.js as a deployment fills it in; runtimeEnv reads it at module load. */
  function configure(house: string) {
    window.__ENV__ = { ...window.__ENV__, VITE_HOUSE_OBSERVER: house };
  }
  const original = { ...window.__ENV__ };
  afterEach(() => {
    window.__ENV__ = { ...original };
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("takes the house the deployment configured, without asking the network", async () => {
    // The lookup it replaces stood in front of every logged-out search: past its
    // timeout the search went out with no Perspective and filled with impostors.
    configure(HOUSE);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers the configured house to a copy an earlier lookup kept", async () => {
    configure(HOUSE);
    localStorage.setItem("brainstorm_house_observer", JSON.stringify({ pk: USER, at: Date.now() }));
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
  });

  it("hands a relay filter the configured key in lowercase", async () => {
    configure(HOUSE.toUpperCase());
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
  });

  it("ignores a configured value that is not a pubkey, and discovers instead", async () => {
    configure("not-a-pubkey");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: { _: HOUSE } }) }));
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
  });

  it("treats an unsubstituted config.js placeholder as unset", async () => {
    configure("__VITE_HOUSE_OBSERVER__");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: { _: HOUSE } }) }));
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
  });

  it("asks again after a failed lookup, after a pause, instead of keeping the failure for the visit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => ({ names: { _: HOUSE } }) });
    vi.stubGlobal("fetch", fetchMock);
    const { resolveHouseObserver, DISCOVERY_RETRY_MS } = await load();
    expect(await resolveHouseObserver()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // both bases
    // Straight after a failure: null at once, so a search doesn't wait out the timeouts again.
    expect(await resolveHouseObserver()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(DISCOVERY_RETRY_MS);
    expect(await resolveHouseObserver()).toBe(HOUSE);
  });

  it("warns about a malformed configured key once, not on every read", async () => {
    configure("not-a-pubkey");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: { _: HOUSE } }) }));
    const { resolveHouseObserver } = await load();
    await resolveHouseObserver();
    await resolveHouseObserver();
    await resolveHouseObserver();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("without a configured house, discovers it from NIP-05", async () => {
    // A deployment that sets no VITE_HOUSE_OBSERVER yet: relays need a pubkey,
    // so we ask the server who it is, the standard way.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ names: { _: HOUSE } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
    expect(fetchMock.mock.calls[0][0]).toContain("/.well-known/nostr.json?name=_");
  });

  it("reads what the head start already discovered, instead of asking again", async () => {
    // index.html looks the house up before the bundle lands and keeps the
    // answer; asking a second time is a round trip for something we hold.
    localStorage.setItem("brainstorm_house_observer", JSON.stringify({ pk: HOUSE, at: Date.now() }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks again once the copy is old enough to have changed", async () => {
    localStorage.setItem(
      "brainstorm_house_observer",
      JSON.stringify({ pk: HOUSE, at: Date.now() - 25 * 60 * 60 * 1000 }),
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: { _: HOUSE } }) });
    vi.stubGlobal("fetch", fetchMock);
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBe(HOUSE);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns null instead of guessing when discovery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBeNull();
  });

  it("rejects a malformed pubkey rather than passing it to a relay filter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: { _: "nope" } }) }));
    const { resolveHouseObserver } = await load();
    expect(await resolveHouseObserver()).toBeNull();
  });
});
