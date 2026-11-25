// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools";

/**
 * Tagging headers are held per coordinate so every note carrying a tag doesn't ask for its
 * header again — but not for the whole session: after a while a read asks the relays again,
 * so an edited header reaches the page.
 */
beforeEach(() => vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) })));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const h = vi.hoisted(() => ({
  sk: new Uint8Array(0),
  published: [] as NostrEvent[],
  asked: [] as Record<string, unknown>[],
}));
h.sk = generateSecretKey();
const VIEWER = getPublicKey(h.sk);
const NOTE_ID = "9".repeat(64);

vi.mock("./nostr", () => ({
  pool: {
    publish: async (relays: string[], event: NostrEvent) => {
      h.published.push(event);
      return relays.map((from) => ({ ok: true, from }));
    },
  },
  fetchEventsByFilter: async (filter: Record<string, unknown>) => {
    h.asked.push(filter);
    return h.published.filter((e) =>
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
  loadOutboxRelayListFromDb: (_pk: string, seeds: string[]) => seeds,
  publishToRelays: async () => ({ success: true }),
  PROFILE_RELAYS: ["wss://purplepag.es/"],
}));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: VIEWER }),
  requireActiveAccount: () => ({ pubkey: VIEWER }),
  signAs: async (_account: unknown, template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, h.sk),
}));

beforeEach(() => {
  vi.resetModules();
  h.published = [];
  h.asked = [];
});

/** The asks for tagging headers by coordinate: a `#d` of `tagging:…-tagging`. */
const headerAsks = () =>
  h.asked.filter((f) => ((f["#d"] as string[] | undefined) ?? []).some((d) => /^tagging:.+-tagging$/.test(d))).length;

describe("tagging headers", () => {
  it("are served from what is held for a while, then asked again", { timeout: 30_000 }, async () => {
    const tags = await import("./tags");
    await tags.applyTagToEvent({ tag: { name: "Bitcoin" }, target: { id: NOTE_ID } });
    const first = await tags.fetchEventTags(NOTE_ID, VIEWER, "house");
    expect(first.mine.map((m) => m.key)).toContain(`${VIEWER}|bitcoin`);
    const before = headerAsks();
    await tags.fetchEventTags(NOTE_ID, VIEWER, "house");
    expect(headerAsks()).toBe(before);

    // An hour on.
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + 60 * 60 * 1000);
    const later = await tags.fetchEventTags(NOTE_ID, VIEWER, "house");
    expect(headerAsks()).toBeGreaterThan(before);
    expect(later.mine.map((m) => m.key)).toContain(`${VIEWER}|bitcoin`);
  });
});
