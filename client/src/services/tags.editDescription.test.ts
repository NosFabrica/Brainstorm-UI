// @vitest-environment node
/**
 * A tag's creator can edit its description later, and only its description:
 * the definition is published again under the same `d`, so every tagging that
 * points at the tag keeps pointing at it, with the name, the slug and the lists
 * it belongs to exactly as they were.
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
  publishToRelays: async () => ({ success: true }),
  PROFILE_RELAYS: ["wss://purplepag.es/"],
}));

// Offline routing: nobody has a relay list, and the lookup says so at once. Unmocked it asks the
// relays, which never answer here, until its 2.5 s deadline: on every publish and tag read.
vi.mock("@/lib/loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loaders")>()),
  loadReplaceable: async () => undefined,
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: VIEWER }),
  requireActiveAccount: () => ({ pubkey: VIEWER }),
  signAs: async (_account: unknown, template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, h.sk),
}));

beforeEach(async () => {
  vi.resetModules();
  // The relays here never keep a tagging for the read-back to find: no wall-clock wait between its asks.
  (await import("./tags")).__confirmWait.ms = 0;
  h.published.length = 0;
  const { __resetTrustSourceCaches } = await import("./trustSource");
  __resetTrustSourceCaches();
});

const definitionsOf = (slug: string) =>
  h.published.filter((e) => e.kind === 39999 && e.tags.some((t) => t[0] === "d" && t[1] === slug));

describe("editing a tag's description", () => {
  it("publishes the creator's own definition again with the new words, and nothing else changed", async () => {
    const { applyTagToProfile, editTagDescription } = await import("./tags");
    await applyTagToProfile({ tag: { name: "Ham Radio", description: "old words" }, targetPubkey: VIEWER });
    const [minted] = definitionsOf("ham-radio");

    await editTagDescription("ham-radio", "  Licensed amateur radio operator  ");

    const versions = definitionsOf("ham-radio");
    expect(versions).toHaveLength(2);
    const edited = versions[1] as typeof minted & { pubkey: string; created_at: number };
    expect(edited.pubkey).toBe(VIEWER);
    expect(edited.tags).toEqual(minted.tags);
    expect(JSON.parse(edited.content)).toEqual({
      tag: { slug: "ham-radio", name: "Ham Radio", description: "Licensed amateur radio operator" },
    });
    expect(edited.created_at).toBeGreaterThan((minted as typeof edited).created_at);
  });

  it("refuses a tag the signed-in account didn't create: there is no definition of theirs to publish again", async () => {
    const { editTagDescription } = await import("./tags");
    await expect(editTagDescription("someone-elses-tag", "mine now")).rejects.toThrow(/created/i);
    expect(h.published).toHaveLength(0);
  });
});
