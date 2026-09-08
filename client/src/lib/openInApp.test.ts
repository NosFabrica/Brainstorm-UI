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
const note: OpenEntity = { kind: "event", bech32: nevent, uri: `nostr:${nevent}` };

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
});
