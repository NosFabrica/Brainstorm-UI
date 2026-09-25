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
      /** The client that published it, as its NIP-89 `client` tag names it — offered as a way
       *  back to the original when Brainstorm renders the kind only generically. */
      origin?: string;
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

export type AppLinkId = "ditto" | "nostria" | "primal" | "nostrband" | "amethyst" | "default" | "origin";
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

/**
 * The clients a `client` tag names that we know a web route for, keyed by the
 * name as clients stamp it, lowercased. The routes are each client's own
 * bech32 pages; a client not listed here (a wallet, a bot, a native-only app)
 * is not offered — a dead link is worse than none.
 */
type EventEntity = Extract<OpenEntity, { kind: "event" | "article" }>;
const ORIGIN_CLIENTS: Record<string, { label: string; url: (e: EventEntity) => string }> = {
  primal: { label: "Primal", url: primalUrl },
  ditto: { label: "Ditto", url: (e) => `https://ditto.pub/${e.bech32}` },
  damus: { label: "Damus", url: (e) => `https://damus.io/${e.bech32}` },
  coracle: { label: "Coracle", url: (e) => `https://coracle.social/notes/${e.bech32}` },
  snort: { label: "Snort", url: (e) => `https://snort.social/${e.bech32}` },
  iris: { label: "Iris", url: (e) => `https://iris.to/${e.bech32}` },
  nostter: { label: "Nostter", url: (e) => `https://nostter.app/${e.bech32}` },
  jumble: { label: "Jumble", url: (e) => `https://jumble.social/notes/${e.bech32}` },
  yakihonne: { label: "YakiHonne", url: (e) => (e.kind === "article" ? `https://yakihonne.com/article/${e.bech32}` : `https://yakihonne.com/notes/${e.bech32}`) },
  habla: { label: "Habla", url: (e) => `https://habla.news/a/${e.bech32}` },
  "habla.news": { label: "Habla", url: (e) => `https://habla.news/a/${e.bech32}` },
  highlighter: { label: "Highlighter", url: (e) => `https://highlighter.com/a/${e.bech32}` },
  "zap.stream": { label: "zap.stream", url: (e) => `https://zap.stream/${e.bech32}` },
  nostrudel: { label: "noStrudel", url: (e) => `https://nostrudel.ninja/l/${e.bech32}` },
};

/** The NIP-89 `client` tag's name, as stamped: `["client", "<name>", "31990:<pubkey>:<d>", "<relay>"]`. */
export function originClientOf(event: { tags: string[][] }): string | undefined {
  return event.tags.find((t) => t[0] === "client")?.[1]?.trim() || undefined;
}

function originLink(entity: EventEntity, offered: AppLink[]): AppLink | null {
  const name = entity.origin?.trim().toLowerCase();
  const client = name && ORIGIN_CLIENTS[name];
  if (!client) return null;
  if (offered.some((l) => l.label === client.label)) return null;
  return { id: "origin", label: client.label, href: client.url(entity), external: true };
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
  // Last: the client that published it, when it is one we can link to and
  // not one already on the list — the way back to the original.
  if (entity.kind !== "profile") {
    const origin = originLink(entity, links);
    if (origin) links.push(origin);
  }
  return links;
}
