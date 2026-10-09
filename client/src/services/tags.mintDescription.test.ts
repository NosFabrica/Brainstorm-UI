// @vitest-environment node
/**
 * Issue #202: a tag minted from the profile page carries its description in the
 * definition's content — `{"tag":{"slug","name","description"}}` — the wire
 * format Tapestry writes and reads, so a description given here shows there.
 * Without one the field is an empty string, never missing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

beforeEach(() => vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) })));
afterEach(() => vi.unstubAllGlobals());

const h = vi.hoisted(() => ({
  sk: new Uint8Array(0),
  published: [] as Array<{ kind: number; tags: string[][]; content: string }>,
}));
h.sk = generateSecretKey();
const VIEWER = getPublicKey(h.sk);

vi.mock("./nostr", () => ({
  pool: {
    publish: async (relays: string[], event: { kind: number; tags: string[][]; content: string }) => {
      h.published.push(event);
      return relays.map((from) => ({ ok: true, from }));
    },
  },
  fetchEventsByFilter: async () => [],
  fetchTrustProviderList: async () => ({ kind: 10040, tags: [] }),
  loadOutboxRelayListFromDb: (_pk: string, seeds: string[]) => seeds,
  publishToRelays: async () => ({ success: true }),
  PROFILE_RELAYS: ["wss://purplepag.es/"],
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: VIEWER }),
  requireActiveAccount: () => ({ pubkey: VIEWER }),
  signAs: async (_account: unknown, template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, h.sk),
}));

beforeEach(async () => {
  vi.resetModules();
  h.published.length = 0;
  const { __resetTrustSourceCaches } = await import("./trustSource");
  __resetTrustSourceCaches();
});

const definitionOf = (slug: string) =>
  h.published.find((e) => e.kind === 39999 && e.tags.some((t) => t[0] === "d" && t[1] === slug));

describe("minting a tag from the profile page", () => {
  it("writes the description into the definition's content, beside the slug and name", async () => {
    const { applyTagToProfile } = await import("./tags");
    const result = await applyTagToProfile({
      tag: { name: "Ham Radio", description: "Licensed amateur radio operator" },
      targetPubkey: VIEWER,
    });
    expect(result.failedAt).toBeFalsy();
    expect(JSON.parse(definitionOf("ham-radio")!.content)).toEqual({
      tag: { slug: "ham-radio", name: "Ham Radio", description: "Licensed amateur radio operator" },
    });
  });

  it("with no description, the field is an empty string — present, as the format expects", async () => {
    const { applyTagToProfile } = await import("./tags");
    await applyTagToProfile({ tag: { name: "Ham Radio" }, targetPubkey: VIEWER });
    expect(JSON.parse(definitionOf("ham-radio")!.content)).toEqual({
      tag: { slug: "ham-radio", name: "Ham Radio", description: "" },
    });
  });
});
