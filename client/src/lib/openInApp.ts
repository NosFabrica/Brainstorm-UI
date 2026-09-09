import { AMETHYST_PLAY_URL } from "@/lib/articleLinks";
import { isAndroid, isPhoneOS } from "@/lib/platform";

/**
 * Handing a public page's subject to another Nostr client — a SECONDARY
 * escape hatch behind the ⋯ menu; Brainstorm itself is the destination.
 *
 * The offers follow the platform. Web apps work everywhere. A `nostr:` link
 * hands the key to the OS, which opens whatever app registered the scheme —
 * on a phone that is Primal or Damus; on a desktop, usually nothing, so it
 * is not offered there. Amethyst exists only on Android, where an intent
 * URL can name the package and fall back to the Play Store when it is not
 * installed (team, 2026-09-08: "the Amethyst link and the default-app link
 * appear to be identical" — they were).
 */
export type OpenEntity = {
  /** Which kind of thing we're linking to — drives the per-client URL path. */
  kind: "event" | "profile" | "article" | "hashtag";
  /** The entity's bech32 (nevent / npub / naddr), no `nostr:` prefix; for a hashtag, the bare tag word. */
  bech32: string;
  /** The `nostr:` URI for the OS default handler (covers Damus, etc.); "" when nothing native can open it (a hashtag). */
  uri: string;
};

export type AppLinkId = "ditto" | "nostria" | "primal" | "nostrband" | "amethyst" | "default";
export type AppLink = { id: AppLinkId; label: string; href: string; /** Opens in a new tab (a web app), not a scheme the OS handles. */ external: boolean };

const AMETHYST_PACKAGE = "com.vitorpamplona.amethyst";

/** Android Chrome's way to name the app: open Amethyst, or the Play Store when it is not installed. */
export function amethystIntentUrl(bech32: string): string {
  return `intent://${bech32}#Intent;scheme=nostr;package=${AMETHYST_PACKAGE};S.browser_fallback_url=${encodeURIComponent(AMETHYST_PLAY_URL)};end`;
}

function primalUrl(e: OpenEntity): string {
  const seg = e.kind === "profile" ? "p" : e.kind === "article" ? "a" : "e";
  return `https://primal.net/${seg}/${e.bech32}`;
}

export function appLinksFor(entity: OpenEntity, ua?: string): AppLink[] {
  // A hashtag is a search, not an event: the web indexes that search it.
  if (entity.kind === "hashtag") {
    const q = encodeURIComponent(`#${entity.bech32}`);
    return [
      { id: "primal", label: "Primal", href: `https://primal.net/search/${q}`, external: true },
      { id: "nostrband", label: "nostr.band", href: `https://nostr.band/?q=${q}`, external: true },
    ];
  }
  const links: AppLink[] = [{ id: "ditto", label: "Ditto", href: `https://ditto.pub/${entity.bech32}`, external: true }];
  // Nostria has clean profile URLs; no known web route for notes or articles.
  if (entity.kind === "profile") links.push({ id: "nostria", label: "Nostria", href: `https://nostria.app/p/${entity.bech32}`, external: true });
  links.push({ id: "primal", label: "Primal", href: primalUrl(entity), external: true });
  // Nothing native can open a thing with no nostr: URI.
  const native = entity.uri !== "";
  if (native && isAndroid(ua)) links.push({ id: "amethyst", label: "Amethyst", href: amethystIntentUrl(entity.bech32), external: false });
  if (native && isPhoneOS(ua)) links.push({ id: "default", label: "Default app", href: entity.uri, external: false });
  return links;
}
