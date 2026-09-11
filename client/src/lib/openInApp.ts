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
export type OpenEntity =
  | {
      /** A person — every client has a profile page. */
      kind: "profile";
      /** The npub, no `nostr:` prefix. */
      bech32: string;
      /** The `nostr:` URI for the OS default handler (covers Damus, etc.). */
      uri: string;
    }
  | {
      /** A tag is a search, not an event: the web indexes that search it. */
      kind: "hashtag";
      /** The bare tag word. */
      bech32: string;
      /** "" — nothing native can open a tag. */
      uri: string;
    }
  | {
      /** An event (nevent) or an addressable article (naddr) — the shape drives the per-client URL path. */
      kind: "event" | "article";
      /** The Nostr kind — drives WHICH clients are offered: only those that render it. */
      eventKind: number;
      /** The nevent / naddr, no `nostr:` prefix. */
      bech32: string;
      /** The `nostr:` URI for the OS default handler; "" when nothing native can open it. */
      uri: string;
    };

/**
 * Which Nostr kinds each web client renders at the URL we build. Verified
 * by opening one real event per kind in each client (2026-09-09), because
 * both answer HTTP 200 for everything and only the rendered page says "404".
 * A client is offered only for kinds it renders — Benjamin: "we need to
 * clean this up so we are only directing users to other clients when they
 * are fully supported."
 */
const WEB_KINDS: Record<"ditto" | "primal", ReadonlySet<number>> = {
  // Notes and comments, pictures, articles and wiki pages (own routes),
  // NIP-99 listings in full, git repos with a gitworkshop link. A stream
  // says "a kind 30311 event Ditto can't render yet"; a follow set shows as
  // an empty post; apps, calendars, files and tracks were never found.
  ditto: new Set([1, 1111, 20, 30023, 30818, 30402, 30617]),
  // /e/ renders kind-1 notes only and /a/ long-form only. Comments,
  // pictures, wiki pages, streams (nevent or naddr), lists, listings, apps,
  // repos, calendars, files and tracks all land on "404 Page not found" —
  // even the ones Primal's own server has cached.
  primal: new Set([1, 30023]),
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
  if (entity.kind === "hashtag") {
    const q = encodeURIComponent(`#${entity.bech32}`);
    return [
      { id: "primal", label: "Primal", href: `https://primal.net/search/${q}`, external: true },
      { id: "nostrband", label: "nostr.band", href: `https://nostr.band/?q=${q}`, external: true },
    ];
  }
  const links: AppLink[] = [];
  const renders = (client: keyof typeof WEB_KINDS) => entity.kind === "profile" || WEB_KINDS[client].has(entity.eventKind);
  if (renders("ditto")) links.push({ id: "ditto", label: "Ditto", href: `https://ditto.pub/${entity.bech32}`, external: true });
  // Nostria has clean profile URLs; no known web route for notes or articles.
  if (entity.kind === "profile") links.push({ id: "nostria", label: "Nostria", href: `https://nostria.app/p/${entity.bech32}`, external: true });
  if (renders("primal")) links.push({ id: "primal", label: "Primal", href: primalUrl(entity), external: true });
  // Nothing native can open a thing with no nostr: URI. The native handoffs
  // are not gated by kind: the OS opens the app the user chose, and Amethyst
  // renders far more kinds than any web client.
  const native = entity.uri !== "";
  if (native && isAndroid(ua)) links.push({ id: "amethyst", label: "Amethyst", href: amethystIntentUrl(entity.bech32), external: false });
  if (native && isPhoneOS(ua)) links.push({ id: "default", label: "Default app", href: entity.uri, external: false });
  return links;
}
