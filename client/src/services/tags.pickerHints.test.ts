// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The tag picker offers the tags made for events by their `tag-for-nostr-event`
 * hint: the catalogue counts people only, so a tag only ever put on notes would
 * otherwise be in no picker.
 */

// Offline: no house observer's /.well-known.
beforeEach(() => vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) })));
afterEach(() => vi.unstubAllGlobals());

const VIEWER = "1".repeat(64);
const MAKER = "2efaa715" + "3".repeat(56);
const element = (pubkey: string, slug: string, name: string, created_at: number) => ({
  id: `${slug}-${created_at}`.padEnd(64, "0"),
  pubkey,
  kind: 39999,
  created_at,
  tags: [
    ["d", slug],
    ["z", "tag-for-nostr-event"],
  ],
  content: JSON.stringify({ tag: { name } }),
  sig: "",
});

const h = vi.hoisted(() => ({ hinted: [] as unknown[], failHints: false }));
vi.mock("./nostr", () => ({
  pool: { publish: async () => [] },
  fetchEventsByFilter: async (filter: { "#z"?: string[] }) => {
    if (filter["#z"]?.includes("tag-for-nostr-event")) {
      if (h.failHints) throw new Error("relay down");
      return h.hinted;
    }
    return [];
  },
  fetchTrustProviderList: async () => null,
  loadOutboxRelayListFromDb: (_pk: string, seeds: string[]) => seeds,
  publishToRelays: async () => ({ success: true }),
  PROFILE_RELAYS: ["wss://purplepag.es/"],
}));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => null,
  requireActiveAccount: () => {
    throw new Error("no account");
  },
  signAs: async () => {
    throw new Error("no account");
  },
}));

beforeEach(async () => {
  vi.resetModules();
  h.hinted = [];
  h.failHints = false;
  const { __resetTrustSourceCaches } = await import("./trustSource");
  __resetTrustSourceCaches();
});

describe("fetchPickerTags and tags made for events", () => {
  it("offers a tag made for events that no person carries, for posts, by its newest name", async () => {
    h.hinted = [element(MAKER, "stoicism", "Stoic", 1), element(MAKER, "stoicism", "Stoicism", 2)];
    const { fetchPickerTags } = await import("./tags");
    const offered = await fetchPickerTags(VIEWER, VIEWER);
    expect(offered).toEqual([
      expect.objectContaining({ key: `${MAKER}|stoicism`, name: "Stoicism", people: 0, band: "content" }),
    ]);
    // Its maker has no published score: offered against a query, not in the suggestions.
    expect(offered[0].unverified).toBe(true);
  });

  it("marks the viewer's own tag as theirs, never unverified", async () => {
    h.hinted = [element(VIEWER, "espresso", "Espresso", 1)];
    const { fetchPickerTags } = await import("./tags");
    expect(await fetchPickerTags(VIEWER, VIEWER)).toEqual([
      expect.objectContaining({ key: `${VIEWER}|espresso`, unverified: false, band: "content" }),
    ]);
  });

  it("does not fail when the hinted read does: those tags are just not offered", async () => {
    h.failHints = true;
    const { fetchPickerTags } = await import("./tags");
    expect(await fetchPickerTags(VIEWER, VIEWER)).toEqual([]);
  });
});
