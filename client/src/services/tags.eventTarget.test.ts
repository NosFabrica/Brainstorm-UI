// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools";

/**
 * What a tagging names (issue #334). An addressable target — a listing, an
 * article, a DList item — is named by its coordinate in an `a` tag: its id
 * changes on every edit, so a tagging by id stops pointing at it, and Trusted
 * Lists of tagged items list members by coordinate. A note is named by id.
 */
beforeEach(() => vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) })));
afterEach(() => vi.unstubAllGlobals());

const h = vi.hoisted(() => ({ sk: new Uint8Array(0), published: [] as NostrEvent[] }));
h.sk = generateSecretKey();
const VIEWER = getPublicKey(h.sk);
const SELLER = "5".repeat(64);
const LISTING = `30402:${SELLER}:circular-hoodie`;
const NOTE_ID = "9".repeat(64);

vi.mock("./nostr", () => ({
  pool: {
    publish: async (relays: string[], event: NostrEvent) => {
      h.published.push(event);
      return relays.map((from) => ({ ok: true, from }));
    },
  },
  // A relay that serves back what was published, filtered as a relay would.
  fetchEventsByFilter: async (filter: Record<string, unknown>) =>
    h.published.filter((e) =>
      Object.entries(filter).every(([k, v]) => {
        if (k === "kinds") return (v as number[]).includes(e.kind);
        if (k === "authors") return (v as string[]).includes(e.pubkey);
        if (k === "ids") return (v as string[]).includes(e.id);
        if (k.startsWith("#")) return e.tags.some((t) => t[0] === k.slice(1) && (v as string[]).includes(t[1]));
        return true;
      }),
    ),
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
});

/** The published tagging — the event that points at the target. */
const taggingOf = (events: NostrEvent[]) =>
  events.find((e) => e.tags.some((t) => (t[0] === "a" && t[1] === LISTING) || (t[0] === "e" && t[1] === NOTE_ID)));

describe("applyTagToEvent", () => {
  it("names an addressable target by its coordinate in an `a` tag, never by an `e`", async () => {
    const { applyTagToEvent } = await import("./tags");
    const result = await applyTagToEvent({ tag: { name: "Bitcoin" }, target: { address: LISTING } });
    expect(result.failedAt).toBeFalsy();

    const tagging = taggingOf(h.published);
    expect(tagging).toBeDefined();
    expect(tagging!.tags).toContainEqual(expect.arrayContaining(["a", LISTING]));
    expect(tagging!.tags.some((t) => t[0] === "e")).toBe(false);
  });

  it("still names a note by its id", async () => {
    const { applyTagToEvent } = await import("./tags");
    await applyTagToEvent({ tag: { name: "Bitcoin" }, target: { id: NOTE_ID } });

    const tagging = taggingOf(h.published);
    expect(tagging!.tags).toContainEqual(expect.arrayContaining(["e", NOTE_ID]));
  });
});

/**
 * Reading an addressable item's tags asks for both: taggings by its coordinate
 * (what is written now) and by its id (what was written before #334), counted
 * as one item — so nothing tagged the old way disappears.
 */
describe("fetchEventTags for an addressable item", () => {
  const ITEM_ID = "7".repeat(64);

  it("finds a tagging by its coordinate", async () => {
    const tags = await import("./tags");
    await tags.applyTagToEvent({ tag: { name: "Bitcoin" }, target: { address: LISTING } });

    const read = await tags.fetchEventTags(ITEM_ID, VIEWER, "house", LISTING);
    expect(read.mine.map((m) => m.key)).toContain(`${VIEWER}|bitcoin`);
  });

  it("still finds one made by its id, before #334, under the same item", async () => {
    const tags = await import("./tags");
    await tags.applyTagToEvent({ tag: { name: "Bitcoin" }, target: { address: LISTING } });
    await tags.applyTagToEvent({ tag: { name: "Hoodies" }, target: { id: ITEM_ID } });

    const read = await tags.fetchEventTags(ITEM_ID, VIEWER, "house", LISTING);
    expect(read.mine.map((m) => m.key).sort()).toEqual([`${VIEWER}|bitcoin`, `${VIEWER}|hoodies`]);
  });
});
