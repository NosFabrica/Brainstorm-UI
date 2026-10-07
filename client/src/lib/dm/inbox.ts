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

/**
 * Who has written in a room, other than the reader — what trust is judged on.
 * Anyone can name people in a message: a stranger who also tags someone the
 * reader follows must not ride their reputation past Requests.
 */
export function writersOf(room: DmRoom, me: string): string[] {
  const writers = new Set<string>();
  for (const m of room.messages) if (m.author !== me) writers.add(m.author);
  return writers.size ? [...writers] : room.participants.filter((pk) => pk !== me);
}

export function shelfOf(room: DmRoom, me: string, prefs: DmPrefs, trust: TrustLookup): RoomShelf {
  if (room.hasMine || prefs.accepted.includes(room.key) || prefs.reach === "everyone") return "chat";
  const others = writersOf(room, me);
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
  // Oldest first: walk back from the newest and stop at the read mark.
  for (let i = room.messages.length - 1; i >= 0; i--) {
    const m = room.messages[i];
    if (m.createdAt <= since) break;
    if (m.author !== me) n++;
  }
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

/** A pinned room none of whose messages are loaded: its people, and nothing else yet. */
export function notLoadedRoom(key: string): DmRoom {
  return {
    key,
    participants: key.split(",").filter(Boolean),
    messages: [],
    reactions: new Map(),
    lastAt: 0,
    hasMine: false,
    notLoaded: true,
  };
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
  // A pinned chat stays in the list even when none of its messages are loaded: history pages
  // the whole inbox newest first, so a chat whose last message is older than the pages so far
  // has no room yet. Its row says so, and opening it offers to look further back.
  const loaded = new Set(rooms.map((r) => r.key));
  for (const key of prefs.pinned) {
    if (loaded.has(key)) continue;
    const room = notLoadedRoom(key);
    const others = room.participants.filter((pk) => pk !== me);
    if (!room.participants.includes(me)) continue;
    if (trust.mutedOf && others.length && others.every((pk) => trust.mutedOf!(pk))) continue;
    if (prefs.hidden[key] !== undefined) out.archived.push(room);
    else pinned.push(room);
  }
  pinned.sort((a, b) => prefs.pinned.indexOf(a.key) - prefs.pinned.indexOf(b.key));
  out.pinnedCount = pinned.length;
  out.chats = [...pinned, ...out.chats];
  // Requests: the most trusted first, then the newest.
  const best = (r: DmRoom) => Math.max(...writersOf(r, me).map((pk) => trust.scoreOf(pk) ?? 0));
  out.requests.sort((a, b) => best(b) - best(a) || b.lastAt - a.lastAt);
  return out;
}
