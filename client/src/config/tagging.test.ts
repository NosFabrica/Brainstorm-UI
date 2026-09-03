import { describe, it, expect, vi } from "vitest";

/**
 * The tag-relay override — `core/ACCEPTANCE.md` Hygiene: "The tag-relay list is
 * editable ... and persists."
 *
 * Tested here rather than through the Settings UI because Settings is
 * auth-gated and a faked session gets 401-wiped in preview
 * (.claude memory: preview-authed-surface-verification). The layering and the
 * round-trip through storage are the part that can actually be wrong.
 */

const KEY = "brainstorm.tagRelays";

/** Fresh module instance, so the load-time read of localStorage re-runs. */
async function loadConfig() {
  vi.resetModules();
  return import("./tagging");
}

describe("tag relay override", () => {
  it("ships the kit's defaults when nothing is saved", async () => {
    const { tagRelays, DEFAULT_TAG_RELAYS, isTagRelayOverrideActive } = await loadConfig();
    expect(tagRelays()).toEqual(DEFAULT_TAG_RELAYS);
    expect(DEFAULT_TAG_RELAYS.length).toBeGreaterThan(0);
    expect(isTagRelayOverrideActive()).toBe(false);
  });

  it("takes effect immediately, without a reload", async () => {
    const { setTagRelays, tagRelays, isTagRelayOverrideActive } = await loadConfig();
    setTagRelays(["wss://relay.example.com"]);
    expect(tagRelays()).toEqual(["wss://relay.example.com"]);
    expect(isTagRelayOverrideActive()).toBe(true);
  });

  it("persists across a reload", async () => {
    const first = await loadConfig();
    first.setTagRelays(["wss://a.example.com", "wss://b.example.com"]);

    // Same storage, fresh module — this is the "and persists" half.
    const second = await loadConfig();
    expect(second.tagRelays()).toEqual(["wss://a.example.com", "wss://b.example.com"]);
    expect(second.isTagRelayOverrideActive()).toBe(true);
  });

  it("drops entries that aren't relay addresses", async () => {
    const { setTagRelays } = await loadConfig();
    expect(setTagRelays(["wss://ok.example.com", "not a url", "https://web.example.com", ""])).toEqual([
      "wss://ok.example.com",
    ]);
  });

  it("normalizes trailing slashes so one host isn't listed twice", async () => {
    // CONFIG.json's URLs have no trailing slash and ours do; a set union that
    // kept both would open two sockets to one relay.
    const { setTagRelays } = await loadConfig();
    expect(setTagRelays(["wss://a.example.com/", "wss://a.example.com"])).toEqual([
      "wss://a.example.com",
    ]);
  });

  it("returns to the shipped defaults when the list is emptied", async () => {
    const { setTagRelays, tagRelays, DEFAULT_TAG_RELAYS, isTagRelayOverrideActive } =
      await loadConfig();
    setTagRelays(["wss://relay.example.com"]);
    setTagRelays([]);
    expect(tagRelays()).toEqual(DEFAULT_TAG_RELAYS);
    expect(isTagRelayOverrideActive()).toBe(false);
  });

  it("ignores a saved list that is empty or corrupt", async () => {
    // An empty override would leave the app with nowhere to read tags from and
    // no way to tell that apart from "this person has no tags".
    localStorage.setItem(KEY, "[]");
    const empty = await loadConfig();
    expect(empty.tagRelays()).toEqual(empty.DEFAULT_TAG_RELAYS);

    localStorage.setItem(KEY, "{not json");
    const corrupt = await loadConfig();
    expect(corrupt.tagRelays()).toEqual(corrupt.DEFAULT_TAG_RELAYS);
  });

  it("keeps the kit's own config untouched by an override", async () => {
    // CONFIG.json must stay byte-identical to the vendored kit; the override
    // lives beside it, never in it.
    const { setTagRelays, DEFAULT_TAG_RELAYS } = await loadConfig();
    const before = [...DEFAULT_TAG_RELAYS];
    setTagRelays(["wss://relay.example.com"]);
    expect(DEFAULT_TAG_RELAYS).toEqual(before);
  });
});
