/**
 * What a Nostr web client's pretty URL names, without a bech32 in it.
 *
 * Primal: `primal.net/<nip05-name>/<slug>` is that person's kind-30023
 * article (`<name>@primal.net`, d = slug); `primal.net/<nip05-name>` is the
 * person. A note carrying one rendered as a bare "primal.net" chip that left
 * Brainstorm for Primal (Benjamin, 2026-09-23). URLs that do carry a bech32
 * (`primal.net/e/naddr…`, njump) never reach here — `classifyUrl` makes them
 * mentions first.
 *
 * The grammar only. Resolving a ref is `services/clientLinks`.
 */
import { trimProse } from "@/lib/noteContent";

export type ClientRef =
  | { kind: "article"; name: string; identifier: string }
  | { kind: "profile"; name: string };

/** Primal's own routes — a first segment that is not a person's name. */
const PRIMAL_RESERVED = new Set([
  "e", "p", "a", "home", "explore", "reads", "search", "settings", "downloads", "premium", "legends",
  "messages", "notifications", "bookmarks", "profile", "thread", "feeds", "landing", "terms", "privacy",
  "support", "new", "rest", "mobile", "dms", "live", "streams", "wallet", "api", "static", "assets", "_",
]);
/** A NIP-05 local part: lowercase, `a-z0-9._-` (NIP-05), never a file. */
const NAME = /^[a-z0-9._-]+$/;
const FILE = /\.[a-z0-9]{2,5}$/i;

export function primalRef(url: string): ClientRef | null {
  let u: URL;
  try {
    u = new URL(trimProse(url).replace(/\.+$/, ""));
  } catch {
    return null;
  }
  if (!/(^|\.)primal\.net$/i.test(u.hostname)) return null;
  const segments = u.pathname.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return null;
  const name = segments[0].toLowerCase();
  if (PRIMAL_RESERVED.has(name) || FILE.test(name) || !NAME.test(name)) return null;
  if (segments.length === 1) return { kind: "profile", name };
  let identifier: string;
  try {
    identifier = decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
  return identifier ? { kind: "article", name, identifier } : null;
}

/** One key per entity, however the URL was written. */
export function clientLinkKey(ref: ClientRef): string {
  return ref.kind === "article" ? `article:${ref.name}:${ref.identifier}` : `profile:${ref.name}`;
}
