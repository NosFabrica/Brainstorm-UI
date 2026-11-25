/**
 * A NIP-38 user status (kind 30315), read for its page and its card.
 *
 * - `d` is the status type: NIP-38 defines `general` ("Working", "Hiking") and
 *   `music` (what they are listening to); any other type is allowed but not
 *   defined (on the production relay most are an app's `presence`, its JSON
 *   content a last-seen time — a record, not words).
 * - The content is the status, emoji and NIP-30 custom emoji included. An empty
 *   content clears the status.
 * - It MAY link one thing: an `r` (a URL — `spotify:…` too), a `p` (a
 *   profile), an `e` (a note) or an `a` (an addressable event).
 * - It is optionally expiring (NIP-40 `expiration`): a music status expires
 *   when the track stops.
 */
import { contentShape } from "@/lib/contentShape";
import { expirationOf } from "@/lib/nip40";

export const USER_STATUS_KIND = 30315;

export type UserStatusLink =
  | { type: "url"; url: string }
  | { type: "profile"; pubkey: string; relay?: string }
  | { type: "event"; id: string; relay?: string }
  | { type: "address"; kind: number; pubkey: string; identifier: string; relay?: string };

export interface UserStatus {
  /** The `d` tag, as published: "general", "music", or an app's own. */
  type: string;
  /** "Status", "Listening to", or the type as published. */
  label: string;
  /** The status itself; null when it was cleared or is not words (an app's JSON record). */
  text: string | null;
  /** The content is empty: NIP-38's way to clear a status. */
  cleared: boolean;
  /** The content is data an app keeps here (JSON), not a status to read. */
  record: boolean;
  link: UserStatusLink | null;
  /** NIP-40, in unix seconds. */
  expiresAt?: number;
}

const HEX64 = /^[0-9a-f]{64}$/i;
const relayOf = (t: string[]) => (typeof t[2] === "string" && /^wss?:\/\//i.test(t[2]) ? t[2] : undefined);

/** The first link the status makes, in the order NIP-38 lists them. */
function linkOf(tags: string[][]): UserStatusLink | null {
  for (const t of tags) {
    const v = t[1]?.trim();
    if (!v) continue;
    // A URI of any scheme (NIP-38's own example is `spotify:search:…`); never a script.
    if (t[0] === "r" && /^[a-z][a-z0-9+.-]*:/i.test(v) && !/^(?:javascript|data|vbscript):/i.test(v))
      return { type: "url", url: v };
    if (t[0] === "p" && HEX64.test(v)) return { type: "profile", pubkey: v.toLowerCase(), relay: relayOf(t) };
    if (t[0] === "e" && HEX64.test(v)) return { type: "event", id: v.toLowerCase(), relay: relayOf(t) };
    if (t[0] === "a") {
      const [kind, pubkey, ...rest] = v.split(":");
      if (/^\d+$/.test(kind) && HEX64.test(pubkey ?? ""))
        return {
          type: "address",
          kind: Number(kind),
          pubkey: pubkey.toLowerCase(),
          identifier: rest.join(":"),
          relay: relayOf(t),
        };
    }
  }
  return null;
}

export function readUserStatus(ev: { kind: number; tags: string[][]; content: string }): UserStatus | null {
  if (ev.kind !== USER_STATUS_KIND) return null;
  const type = ev.tags.find((t) => t[0] === "d")?.[1]?.trim() ?? "";
  const shape = contentShape(ev.content).kind;
  const cleared = shape === "empty";
  const record = shape === "json" || shape === "encrypted";
  return {
    type,
    label: type === "music" ? "Listening to" : type === "general" || !type ? "Status" : type,
    text: cleared || record ? null : ev.content.trim(),
    cleared,
    record,
    link: linkOf(ev.tags),
    expiresAt: expirationOf(ev),
  };
}
