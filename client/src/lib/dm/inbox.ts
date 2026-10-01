/**
 * Which rooms are chats and which are requests — Brainstorm's own layer over
 * NIP-17. A gift wrap hides its sender from relays, so no relay can filter
 * spam for the reader; we sort after opening, using the people they already
 * trust: their follows, and the Verification Score from the web of trust.
 */
import type { DmRoom } from "./store";
import { LOW_TRUST_BELOW, TRUSTED_FROM, lastReadAt, type DmPrefs } from "./prefs";

export type RoomShelf = "chat" | "request" | "low" | "flagged";

export interface TrustLookup {
  follows: ReadonlySet<string>;
  /** Verification Score 0–1, null when unrated, undefined while loading. */
  scoreOf(pubkey: string): number | null | undefined;
  flaggedOf(pubkey: string): boolean;
  /** On the reader's mute list: their rooms are not shown at all. */
  mutedOf?(pubkey: string): boolean;
}

export function shelfOf(room: DmRoom, me: string, prefs: DmPrefs, trust: TrustLookup): RoomShelf {
  if (room.hasMine || prefs.accepted.includes(room.key) || prefs.reach === "everyone") return "chat";
  const others = room.participants.filter((pk) => pk !== me);
  if (!others.length) return "chat";
  if (others.some((pk) => trust.follows.has(pk))) return "chat";
  const scores = others.map((pk) => trust.scoreOf(pk));
  if (prefs.reach === "trusted" && scores.some((s) => typeof s === "number" && s >= TRUSTED_FROM)) return "chat";
  if (others.some((pk) => trust.flaggedOf(pk))) return "flagged";
  const best = Math.max(...scores.map((s) => (typeof s === "number" ? s : -1)));
  // Still loading: don't call anyone low-trust before their score is in.
  if (scores.some((s) => s === undefined)) return "request";
  return best < LOW_TRUST_BELOW ? "low" : "request";
}

/** Messages from other people the reader hasn't seen. */
export function unreadIn(room: DmRoom, me: string, prefs: DmPrefs): number {
  const since = lastReadAt(prefs, room.key);
  let n = 0;
  for (const m of room.messages) if (m.author !== me && m.createdAt > since) n++;
  return n;
}

/** Deleted or archived, and nothing newer has arrived since. */
export function isHidden(room: DmRoom, prefs: DmPrefs): boolean {
  const at = prefs.hidden[room.key];
  return at !== undefined && room.lastAt <= at;
}

export interface Shelves {
  /** Pinned chats first (in pin order), then the rest newest first. */
  chats: DmRoom[];
  /** How many of `chats` are pinned — they lead the list. */
  pinnedCount: number;
  /** Chats the reader archived, newest first. */
  archived: DmRoom[];
  requests: DmRoom[];
  low: DmRoom[];
  flagged: DmRoom[];
  /** Unread messages in chats, plus requests with anything unread — the header badge. */
  badge: number;
}

export function shelve(rooms: DmRoom[], me: string, prefs: DmPrefs, trust: TrustLookup): Shelves {
  const out: Shelves = { chats: [], pinnedCount: 0, archived: [], requests: [], low: [], flagged: [], badge: 0 };
  const pinned: DmRoom[] = [];
  const muted = new Set(prefs.muted);
  for (const room of rooms) {
    const others = room.participants.filter((pk) => pk !== me);
    if (trust.mutedOf && others.length && others.every((pk) => trust.mutedOf!(pk))) continue;
    const shelf = shelfOf(room, me, prefs, trust);
    if (isHidden(room, prefs)) {
      // A chat put away is archived; a deleted request is simply gone.
      if (shelf === "chat") out.archived.push(room);
      continue;
    }
    const unread = muted.has(room.key) ? 0 : unreadIn(room, me, prefs);
    if (shelf === "chat") {
      if (prefs.pinned.includes(room.key)) pinned.push(room);
      else out.chats.push(room);
      out.badge += unread;
    } else if (shelf === "request") {
      out.requests.push(room);
      if (unread) out.badge += 1;
    } else if (shelf === "low") out.low.push(room);
    else out.flagged.push(room);
  }
  pinned.sort((a, b) => prefs.pinned.indexOf(a.key) - prefs.pinned.indexOf(b.key));
  out.pinnedCount = pinned.length;
  out.chats = [...pinned, ...out.chats];
  // Requests: the most trusted first, then the newest.
  const best = (r: DmRoom) => Math.max(...r.participants.filter((pk) => pk !== me).map((pk) => trust.scoreOf(pk) ?? 0));
  out.requests.sort((a, b) => best(b) - best(a) || b.lastAt - a.lastAt);
  return out;
}
