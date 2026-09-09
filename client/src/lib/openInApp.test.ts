// @vitest-environment node
/**
 * "Open in a Nostr app" offered Amethyst and "your default app" as the same
 * nostr: link on every platform (team, 2026-09-08): on an iPhone both opened
 * Primal, on a desktop neither did anything. The offers now follow the
 * platform — web apps everywhere, the default app on phones, Amethyst on
 * Android through an intent that falls back to the Play Store.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { AMETHYST_PLAY_URL } from "./articleLinks";
import { appLinksFor, type OpenEntity } from "./openInApp";

const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/124.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0 Safari/537.36";

const npub = nip19.npubEncode("a".repeat(64));
const profile: OpenEntity = { kind: "profile", bech32: npub, uri: `nostr:${npub}` };
const nevent = nip19.neventEncode({ id: "e".repeat(64) });
const note: OpenEntity = { kind: "event", eventKind: 1, bech32: nevent, uri: `nostr:${nevent}` };
const listing: OpenEntity = { kind: "event", eventKind: 30402, bech32: nevent, uri: `nostr:${nevent}` };
const followSet: OpenEntity = { kind: "event", eventKind: 30000, bech32: nevent, uri: `nostr:${nevent}` };

describe("appLinksFor", () => {
  it("on a desktop a profile opens on the web — Ditto, Nostria, Primal — and nothing native", () => {
    const links = appLinksFor(profile, MAC);
    expect(links.map((l) => l.id)).toEqual(["ditto", "nostria", "primal"]);
    expect(links.map((l) => l.href)).toEqual([`https://ditto.pub/${npub}`, `https://nostria.app/p/${npub}`, `https://primal.net/p/${npub}`]);
    expect(links.every((l) => l.external)).toBe(true);
  });

  it("a note never offers Nostria, and Primal takes its event path", () => {
    const links = appLinksFor(note, MAC);
    expect(links.map((l) => l.id)).toEqual(["ditto", "primal"]);
    expect(links[1].href).toBe(`https://primal.net/e/${nevent}`);
  });

  it("on an iPhone the default app joins last, in the same tab — and no Amethyst, which does not exist there", () => {
    const links = appLinksFor(profile, IPHONE);
    expect(links.map((l) => l.id)).toEqual(["ditto", "nostria", "primal", "default"]);
    expect(links.at(-1)).toMatchObject({ href: `nostr:${npub}`, external: false });
  });

  it("on Android, Amethyst comes as an intent that falls back to the Play Store, then the default app", () => {
    const links = appLinksFor(profile, PIXEL);
    expect(links.map((l) => l.id)).toEqual(["ditto", "nostria", "primal", "amethyst", "default"]);
    const amethyst = links.find((l) => l.id === "amethyst")!;
    expect(amethyst.href).toBe(
      `intent://${npub}#Intent;scheme=nostr;package=com.vitorpamplona.amethyst;S.browser_fallback_url=${encodeURIComponent(AMETHYST_PLAY_URL)};end`,
    );
    expect(amethyst.external).toBe(false);
  });

  // A hashtag page's "Open in" footer moves into a ⋯ (team, 2026-09-08). A
  // tag has no nostr: URI, so nothing native can open it — web search only.
  it("a hashtag opens on Primal's search and nostr.band, and nothing native even on Android", () => {
    const links = appLinksFor({ kind: "hashtag", bech32: "bitcoin", uri: "" }, PIXEL);
    expect(links.map((l) => l.id)).toEqual(["primal", "nostrband"]);
    expect(links.map((l) => l.href)).toEqual(["https://primal.net/search/%23bitcoin", "https://nostr.band/?q=%23bitcoin"]);
    expect(links.every((l) => l.external)).toBe(true);
  });

  it("an entity with no nostr: URI never offers the default app or Amethyst", () => {
    const links = appLinksFor({ kind: "event", eventKind: 1, bech32: nevent, uri: "" }, PIXEL);
    expect(links.map((l) => l.id)).toEqual(["ditto", "primal"]);
  });

  // Benjamin, 2026-09-09: "there are multiple event types that Ditto and
  // Primal don't open and return as 404". Opened one real event per kind in
  // both: Primal's /e/ renders kind-1 notes only; Ditto renders NIP-99
  // listings in full. A client is offered only for what it renders.
  it("a shop listing opens in Ditto, which renders it, and never in Primal, which answers 404", () => {
    expect(appLinksFor(listing, MAC).map((l) => l.id)).toEqual(["ditto"]);
  });

  it("a follow set opens in no web client — both answer 404 or an empty post", () => {
    expect(appLinksFor(followSet, MAC)).toEqual([]);
  });

  it("a long-form article opens in both, Primal on its reads path; a wiki page only in Ditto, which has a wiki route", () => {
    const naddr = nip19.naddrEncode({ kind: 30023, pubkey: "a".repeat(64), identifier: "hello" });
    const article = appLinksFor({ kind: "article", eventKind: 30023, bech32: naddr, uri: `nostr:${naddr}` }, MAC);
    expect(article.map((l) => l.id)).toEqual(["ditto", "primal"]);
    expect(article[1].href).toBe(`https://primal.net/a/${naddr}`);
    const wiki = appLinksFor({ kind: "article", eventKind: 30818, bech32: naddr, uri: `nostr:${naddr}` }, MAC);
    expect(wiki.map((l) => l.id)).toEqual(["ditto"]);
  });

  it("on Android a follow set still hands off to Amethyst and the default app — native apps are not the ones that 404", () => {
    expect(appLinksFor(followSet, PIXEL).map((l) => l.id)).toEqual(["amethyst", "default"]);
  });
});
