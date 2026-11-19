// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools";

/**
 * The posts on a tag's page. Whose taggings COUNT is the trust filter's call,
 * and someone whose account it doesn't count yet (new, unscored) adds nothing
 * to anyone else's view of the tag. Their own view is another matter: a post
 * they tagged shows "Tagged as" on the post, so it has to be on the tag's page
 * for them too, or the tag they just made looks like it didn't work.
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

describe("fetchTagNotes — your own tagging, when the trust filter doesn't count you", () => {
  it("lists the post you tagged for you, uncounted", async () => {
    const tags = await import("./tags");
    await tags.applyTagToEvent({ tag: { name: "Dance", description: "Dance video" }, target: { id: NOTE_ID } });

    const mine = await tags.fetchTagNotes(VIEWER, "dance", VIEWER);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: NOTE_ID, myStance: "apply", applications: 0, disputes: 0 });
  });

  it("lists nothing for anyone else: an uncounted tagging is still not theirs to see", async () => {
    const tags = await import("./tags");
    await tags.applyTagToEvent({ tag: { name: "Dance" }, target: { id: NOTE_ID } });

    expect(await tags.fetchTagNotes(VIEWER, "dance", "c".repeat(64))).toEqual([]);
    expect(await tags.fetchTagNotes(VIEWER, "dance")).toEqual([]);
  });

  it("keeps the relay hint and the coordinate of what you tagged", async () => {
    const tags = await import("./tags");
    await tags.applyTagToEvent({ tag: { name: "Dance" }, target: { address: LISTING } });

    const mine = await tags.fetchTagNotes(VIEWER, "dance", VIEWER);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ address: LISTING, myStance: "apply" });
  });
});

/**
 * What a tag was made for. A tag created while tagging a post carries the
 * "for events" hint; the tag's page reads it so it doesn't offer a tag about
 * videos as something to add yourself to.
 */
describe("fetchTagDetail — what the tag was made for", () => {
  it("says a tag created on a post was made for posts", async () => {
    const tags = await import("./tags");
    await tags.applyTagToEvent({ tag: { name: "Dance" }, target: { id: NOTE_ID } });
    expect((await tags.fetchTagDetail(VIEWER, "dance", VIEWER)).tag.madeFor).toBe("posts");
  });

  it("says nothing of the kind about a tag created on a person", async () => {
    const tags = await import("./tags");
    await tags.applyTagToProfile({ tag: { name: "Dancer" }, targetPubkey: VIEWER });
    expect((await tags.fetchTagDetail(VIEWER, "dancer", VIEWER)).tag.madeFor).not.toBe("posts");
  });
});
