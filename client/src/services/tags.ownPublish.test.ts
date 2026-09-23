// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

/** A tag the viewer just published is in their catalogue before any relay serves it back. */

// Real keys: the event store rejects events whose signature doesn't verify.
const h = vi.hoisted(() => ({ sk: new Uint8Array(0) }));
h.sk = generateSecretKey();
const VIEWER = getPublicKey(h.sk);
const OTHER = "2aa46e1f18c8" + "2".repeat(52);
const OBSERVER_TA = "78ed0837eba0ba24" + "0".repeat(48);
const OBSERVER_RELAY = "wss://scores.brainstorm.world";

vi.mock("./nostr", () => ({
  pool: { publish: async (relays: string[]) => relays.map((from) => ({ ok: true, from })) },
  // The relays hold nothing yet — neither tags nor any trust score for the viewer.
  fetchEventsByFilter: async () => [],
  fetchTrustProviderList: async () => ({
    kind: 10040,
    tags: [["30382:rank", OBSERVER_TA, OBSERVER_RELAY]],
  }),
  loadOutboxRelayListFromDb: (_pk: string, seeds: string[]) => seeds,
  publishToRelays: async () => ({ success: true }),
  PROFILE_RELAYS: ["wss://purplepag.es/"],
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: VIEWER }),
  requireActiveAccount: () => ({ pubkey: VIEWER }),
  signAs: async (_account: unknown, template: Parameters<typeof finalizeEvent>[0]) =>
    finalizeEvent(template, h.sk),
}));

beforeEach(async () => {
  vi.resetModules();
  const { __resetTrustSourceCaches } = await import("./trustSource");
  __resetTrustSourceCaches();
});

async function mintAndApply() {
  const tags = await import("./tags");
  const result = await tags.applyTagToProfile({ tag: { name: "Musician" }, targetPubkey: VIEWER });
  expect(result.failedAt).toBeFalsy();
  return tags;
}

describe("a tag the viewer just minted", () => {
  it("is in their own catalogue, though they are unscored and no relay has it", async () => {
    const { fetchTagIndex } = await mintAndApply();
    const index = await fetchTagIndex(VIEWER, VIEWER);
    expect(index).toEqual([
      expect.objectContaining({ key: `${VIEWER}|musician`, name: "Musician", people: 1, unverified: false }),
    ]);
  });

  it("does not count for anyone else", async () => {
    const { fetchTagIndex } = await mintAndApply();
    expect(await fetchTagIndex(OTHER, OTHER)).toEqual([]);
  });

  it("is found again instead of being re-minted", async () => {
    const { resolveOrMintTag } = await mintAndApply();
    expect(await resolveOrMintTag("Musician")).toEqual(
      expect.objectContaining({ authorPubkey: VIEWER, slug: "musician" }),
    );
  });
});
