/**
 * What a Nostr web client's pretty URL names, without a bech32 in it: a
 * person by NIP-05 handle, or that person's kind-30023 article by handle
 * and slug (the d tag). A note carrying one rendered as a bare "primal.net"
 * chip that left Brainstorm for Primal (Benjamin, 2026-09-23); the team
 * (2026-09-24) asked for the other clients too, so a reader stays here.
 * URLs that do carry a bech32 (`primal.net/e/naddr…`, njump, damus.io…)
 * never reach here — `classifyUrl` makes them mentions first.
 *
 * The grammar only. Resolving a ref is `services/clientLinks`.
 */
import { trimProse } from "@/lib/noteContent";
import { parseNip05 } from "@/lib/nip05";

export type ClientRef =
  | { kind: "article"; nip05: string; identifier: string }
  | { kind: "profile"; nip05: string };

/** Primal's own routes — a first segment that is not a person's name. */
const PRIMAL_RESERVED = new Set([
  "e", "p", "a", "home", "explore", "reads", "search", "settings", "downloads", "premium", "legends",
  "messages", "notifications", "bookmarks", "profile", "thread", "feeds", "landing", "terms", "privacy",
  "support", "new", "rest", "mobile", "dms", "live", "streams", "wallet", "api", "static", "assets", "_",
]);
/** Snort's own routes. */
const SNORT_RESERVED = new Set([
  "e", "p", "t", "notifications", "settings", "messages", "search", "login", "new", "wallet", "deck", "list",
  "subscribe", "donate", "help", "about", "graph", "free-nostr-address", "nostr-address", "discover", "trending",
]);
/** Iris's own routes. */
const IRIS_RESERVED = new Set([
  "settings", "search", "notifications", "messages", "about", "post", "chat", "network", "subscribe", "note",
  "follows", "followers", "login", "signup", "explore", "home", "feed", "global",
]);
/** A NIP-05 local part: lowercase, `a-z0-9._-` (NIP-05), never a file. */
const NAME = /^[a-z0-9._-]+$/;
const FILE = /\.[a-z0-9]{2,5}$/i;

function segmentsOf(url: string, host: RegExp): string[] | null {
  let u: URL;
  try {
    u = new URL(trimProse(url).replace(/\.+$/, ""));
  } catch {
    return null;
  }
  if (!host.test(u.hostname)) return null;
  return u.pathname.split("/").filter(Boolean);
}

function decoded(segment: string): string | null {
  try {
    return decodeURIComponent(segment) || null;
  } catch {
    return null;
  }
}

/** A handle as a URL carries it (`alice@example.com`, or a bare `example.com`), canonical — or null. */
function handle(segment: string): string | null {
  const raw = decoded(segment);
  const parsed = raw && parseNip05(raw);
  return parsed ? `${parsed.name}@${parsed.domain}` : null;
}

/** `<host>/<local-name>[/<slug>]` — the client's own users, named by local part. */
function ownUsers(segments: string[], domain: string, reserved: ReadonlySet<string>): ClientRef | null {
  if (segments.length === 0 || segments.length > 2) return null;
  const name = segments[0].toLowerCase();
  if (reserved.has(name) || FILE.test(name) || !NAME.test(name)) return null;
  const nip05 = `${name}@${domain}`;
  if (segments.length === 1) return { kind: "profile", nip05 };
  const identifier = decoded(segments[1]);
  return identifier ? { kind: "article", nip05, identifier } : null;
}

/** `<host>/<prefix>/<nip05>[/<slug>]` — anyone, by full handle. */
function byHandle(segments: string[]): ClientRef | null {
  if (segments.length === 0 || segments.length > 2) return null;
  const nip05 = handle(segments[0]);
  if (!nip05) return null;
  if (segments.length === 1) return { kind: "profile", nip05 };
  const identifier = decoded(segments[1]);
  return identifier ? { kind: "article", nip05, identifier } : null;
}

/** `<host>/<name-or-handle>` — the client's own users by local part, anyone by full handle. */
function ownUsersOrHandle(segments: string[], domain: string, reserved: ReadonlySet<string>): ClientRef | null {
  return segments[0]?.includes("@") ? byHandle(segments) : ownUsers(segments, domain, reserved);
}

export function clientRef(url: string): ClientRef | null {
  const primal = segmentsOf(url, /(^|\.)primal\.net$/i);
  if (primal) return ownUsers(primal, "primal.net", PRIMAL_RESERVED);
  // Habla: `/u/<nip05>/<slug>` the article, `/u/<nip05>` the person; `/a/<naddr>` was a mention already.
  const habla = segmentsOf(url, /(^|\.)habla\.news$/i);
  if (habla) return habla[0] === "u" ? byHandle(habla.slice(1)) : null;
  // Snort and Iris: `/<name>` is their own user, `/<name@domain>` anyone.
  const snort = segmentsOf(url, /(^|\.)snort\.social$/i);
  if (snort) return snort.length === 1 ? ownUsersOrHandle(snort, "snort.social", SNORT_RESERVED) : null;
  const iris = segmentsOf(url, /(^|\.)iris\.to$/i);
  if (iris) return iris.length === 1 ? ownUsersOrHandle(iris, "iris.to", IRIS_RESERVED) : null;
  // Ditto: a Mastodon-style `/@user@domain` is that NIP-05; `/@user` is Ditto's own user.
  const ditto = segmentsOf(url, /(^|\.)ditto\.pub$/i);
  if (ditto) {
    if (ditto.length !== 1 || !ditto[0].startsWith("@")) return null;
    return ownUsersOrHandle([ditto[0].slice(1)], "ditto.pub", new Set());
  }
  // njump and Highlighter take a full handle at the root (a bare domain is
  // its `_` name); a route word has no dot, so it is not a handle.
  const njump = segmentsOf(url, /(^|\.)njump\.me$/i);
  if (njump) return njump.length === 1 ? byHandle(njump) : null;
  const highlighter = segmentsOf(url, /(^|\.)highlighter\.com$/i);
  if (highlighter) return byHandle(highlighter);
  return null;
}

/** One key per entity, however the URL was written. */
export function clientLinkKey(ref: ClientRef): string {
  return ref.kind === "article" ? `article:${ref.nip05}:${ref.identifier}` : `profile:${ref.nip05}`;
}
