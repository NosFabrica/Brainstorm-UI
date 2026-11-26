// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools";

/**
 * "Did my tag save?" (2026-11-20). A publish succeeds when one relay says OK, and
 * that was all tagging knew: a tagging a relay accepted and never kept read, to
 * the person who made it, exactly like one that saved, until it was missing the
 * next day. So after publishing, the tagging is read back from the relays every
 * tag page reads, and the result says whether it was there.
 */
beforeEach(() => vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) })));
afterEach(() => vi.unstubAllGlobals());

const h = vi.hoisted(() => ({
  sk: new Uint8Array(0),
  held: [] as NostrEvent[],
  /** A relay that says OK to a tagging and does not keep it. */
  dropsTaggings: false,
  /** How many times a tagging is asked for before the relay has it. */
  slowBy: 0,
  asked: 0,
}));
h.sk = generateSecretKey();
const VIEWER = getPublicKey(h.sk);
const SUBJECT = "5".repeat(64);
const NOTE_ID = "9".repeat(64);

const isTagging = (e: NostrEvent) =>
  e.tags.some((t) => (t[0] === "e" && t[1] === NOTE_ID) || (t[0] === "p" && t[1] === SUBJECT));

vi.mock("./nostr", () => ({
  pool: {
    publish: async (relays: string[], event: NostrEvent) => {
      if (!(h.dropsTaggings && isTagging(event))) h.held.push(event);
      return relays.map((from) => ({ ok: true, from }));
    },
  },
  fetchEventsByFilter: async (filter: Record<string, unknown>) => {
    // The read-back asks for the tagging by its id.
    if (filter.ids && h.asked++ < h.slowBy) return [];
    return h.held.filter((e) =>
      Object.entries(filter).every(([k, v]) => {
        if (k === "kinds") return (v as number[]).includes(e.kind);
        if (k === "authors") return (v as string[]).includes(e.pubkey);
        if (k === "ids") return (v as string[]).includes(e.id);
        if (k.startsWith("#")) return e.tags.some((t) => t[0] === k.slice(1) && (v as string[]).includes(t[1]));
        return true;
      }),
    );
  },
  fetchTrustProviderList: async () => undefined,
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
  h.held = [];
  h.dropsTaggings = false;
  h.slowBy = 0;
  h.asked = 0;
});

describe("a tagging is read back after it is published", () => {
  it("is confirmed when the relays hold it: a tag on a post", async () => {
    const { applyTagToEvent } = await import("./tags");
    const result = await applyTagToEvent({ tag: { name: "Bitcoin" }, target: { id: NOTE_ID } });
    expect(result.failedAt).toBeFalsy();
    expect(result.confirmed).toBe(true);
  });

  it("is confirmed when the relays hold it: a tag on a person", async () => {
    const { applyTagToProfile } = await import("./tags");
    const result = await applyTagToProfile({ tag: { name: "Bitcoin" }, targetPubkey: SUBJECT });
    expect(result.failedAt).toBeFalsy();
    expect(result.confirmed).toBe(true);
  });

  it("is not confirmed when a relay said OK and did not keep it", async () => {
    h.dropsTaggings = true;
    const { applyTagToEvent } = await import("./tags");
    const result = await applyTagToEvent({ tag: { name: "Bitcoin" }, target: { id: NOTE_ID } });
    // The publish itself did not fail: every relay answered OK.
    expect(result.failedAt).toBeFalsy();
    expect(result.confirmed).toBe(false);
  });

  it("asks again before giving up: a relay can take a moment to serve what it just took", async () => {
    h.slowBy = 1;
    const { applyTagToEvent } = await import("./tags");
    const result = await applyTagToEvent({ tag: { name: "Bitcoin" }, target: { id: NOTE_ID } });
    expect(result.confirmed).toBe(true);
  });
});
