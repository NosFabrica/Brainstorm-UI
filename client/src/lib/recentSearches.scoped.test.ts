// @vitest-environment jsdom
/**
 * A search scoped to a person, on a tab, remembered in RECENT the way the
 * chip that opened it read — the face, the name, "Media" — never the key.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { clearRecentSearches, getRecentItems, pushRecentQuery, pushRecentScoped, recentKey, removeRecentItem } from "./recentSearches";

const VINNEY = "7".repeat(64);
const npub = nip19.npubEncode(VINNEY);

beforeEach(() => {
  localStorage.clear();
  clearRecentSearches();
});

describe("pushRecentScoped", () => {
  it("remembers a person's scoped search as the person and the tab, never the key", () => {
    const list = pushRecentScoped({ pubkey: VINNEY, npub, label: "vinney…axkl", picture: "https://img/v.jpg", tab: "media" });
    expect(list[0]).toMatchObject({ type: "scoped", pubkey: VINNEY, npub, label: "vinney…axkl", picture: "https://img/v.jpg", tab: "media", words: "" });
    expect(JSON.stringify(getRecentItems())).not.toContain("from:");
    expect(getRecentItems()[0]).toMatchObject({ type: "scoped", tab: "media" });
  });

  // Benjamin (2026-09-24): "it doesn't need to save every tab you click, just your search,
  // like Google". One row per person: searched again on another tab, the row moves to the
  // front wearing that tab.
  it("the same person is one row, moved to the front; another tab replaces it rather than adding", () => {
    pushRecentScoped({ pubkey: VINNEY, npub, label: "vinney", tab: "media" });
    pushRecentQuery("soap");
    pushRecentScoped({ pubkey: VINNEY, npub, label: "vinney", tab: "media" });
    expect(getRecentItems().map((r) => recentKey(r))).toEqual([`scoped:${VINNEY}:`, "query:soap"]);
    pushRecentScoped({ pubkey: VINNEY, npub, label: "vinney", tab: "articles" });
    expect(getRecentItems()).toHaveLength(2);
    expect(getRecentItems()[0]).toMatchObject({ type: "scoped", tab: "articles" });
  });

  it("words typed under the scope are part of the search remembered", () => {
    pushRecentScoped({ pubkey: VINNEY, npub, label: "vinney", tab: "media", words: "  sunset " });
    expect(getRecentItems()[0]).toMatchObject({ type: "scoped", words: "sunset" });
    pushRecentScoped({ pubkey: VINNEY, npub, label: "vinney", tab: "media" });
    expect(getRecentItems()).toHaveLength(2);
  });

  it("can be removed like any other row", () => {
    const [row] = pushRecentScoped({ pubkey: VINNEY, npub, label: "vinney", tab: "media" });
    removeRecentItem(row);
    expect(getRecentItems()).toEqual([]);
  });

  it("a stored row from before this kind existed still reads, and a broken scoped row is skipped", () => {
    localStorage.setItem("brainstorm_recent_searches:anon", JSON.stringify([{ q: "old", t: 1 }, { type: "scoped", pubkey: VINNEY, t: 2 }]));
    expect(getRecentItems()).toEqual([{ type: "query", q: "old", t: 1 }]);
  });

  it("needs a person and a tab", () => {
    expect(pushRecentScoped({ pubkey: "", npub, label: "x", tab: "media" })).toEqual([]);
    expect(pushRecentScoped({ pubkey: VINNEY, npub, label: "x", tab: "" })).toEqual([]);
  });
});
