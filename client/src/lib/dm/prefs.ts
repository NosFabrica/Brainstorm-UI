/**
 * The reader's own choices about their messages, on this device: what they
 * have read, which requests they accepted or deleted, disappearing timers, and
 * who reaches their chats directly. None of it is on the wire — NIP-17 has no
 * read receipts and no room settings — so it lives with the account here.
 */
import { accountKey } from "@/lib/accountStorage";

/** Who lands straight in Chats; everyone else is a request. */
export type DmReach = "follows" | "trusted" | "everyone";

/** Requests from senders scoring below this are listed without a preview (Verification Score 0–1). */
export const LOW_TRUST_BELOW = 0.2;

/** A sender at or above this counts as trusted for `reach: "trusted"`. */
export const TRUSTED_FROM = 0.5;

export const TIMER_CHOICES = [
  { seconds: 0, label: "Off" },
  { seconds: 24 * 3600, label: "1 day" },
  { seconds: 7 * 24 * 3600, label: "1 week" },
  { seconds: 30 * 24 * 3600, label: "30 days" },
] as const;

export interface DmPrefs {
  /** Messages from before this moment start out read. Set when the inbox first opens on this device. */
  readFloor?: number;
  /** room key → newest message time the reader has seen. */
  read: Record<string, number>;
  /** Requests the reader accepted. */
  accepted: string[];
  /** Rooms the reader deleted or archived; a newer message brings one back. */
  hidden: Record<string, number>;
  /** room key → disappearing timer in seconds. */
  timers: Record<string, number>;
  reach: DmReach;
  /** Timer for new chats. */
  defaultTimer: number;
  /** Rooms kept at the top of Chats, most recently pinned first. */
  pinned: string[];
  /** Rooms that don't count toward the badge or notify. */
  muted: string[];
  notify: DmNotifyPrefs;
  /** Preview cards for links, fetched privately (components/messages/DmLinkPreview). */
  linkPreviews: boolean;
}

export interface DmNotifyPrefs {
  /** Browser notifications while Brainstorm is open in a tab. */
  desktop: boolean;
  /** A short chime. */
  sound: boolean;
  /** Say what the message says, not only who sent it. */
  preview: boolean;
}

const DEFAULTS: DmPrefs = {
  read: {},
  accepted: [],
  hidden: {},
  timers: {},
  reach: "follows",
  defaultTimer: 0,
  pinned: [],
  muted: [],
  notify: { desktop: false, sound: true, preview: true },
  linkPreviews: true,
};

const listeners = new Set<() => void>();
const memo = new Map<string, DmPrefs>();

const key = (pubkey: string) => accountKey("brainstorm_dm_prefs", pubkey);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numbers = (v: unknown): Record<string, number> =>
  isRecord(v)
    ? Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === "number"))
    : {};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/** A stored row, field by field: a damaged or older shape falls back per field, never throws later. */
function sanitize(raw: unknown): DmPrefs {
  if (!isRecord(raw)) return DEFAULTS;
  const notify = isRecord(raw.notify) ? raw.notify : {};
  return {
    readFloor: typeof raw.readFloor === "number" ? raw.readFloor : undefined,
    read: numbers(raw.read),
    accepted: strings(raw.accepted),
    hidden: numbers(raw.hidden),
    timers: numbers(raw.timers),
    reach: raw.reach === "trusted" || raw.reach === "everyone" ? raw.reach : "follows",
    defaultTimer: typeof raw.defaultTimer === "number" ? raw.defaultTimer : 0,
    pinned: strings(raw.pinned),
    muted: strings(raw.muted),
    notify: {
      desktop: typeof notify.desktop === "boolean" ? notify.desktop : DEFAULTS.notify.desktop,
      sound: typeof notify.sound === "boolean" ? notify.sound : DEFAULTS.notify.sound,
      preview: typeof notify.preview === "boolean" ? notify.preview : DEFAULTS.notify.preview,
    },
    linkPreviews: typeof raw.linkPreviews === "boolean" ? raw.linkPreviews : DEFAULTS.linkPreviews,
  };
}

export function readDmPrefs(pubkey: string): DmPrefs {
  const held = memo.get(pubkey);
  if (held) return held;
  let prefs = DEFAULTS;
  try {
    const raw = localStorage.getItem(key(pubkey));
    if (raw) prefs = sanitize(JSON.parse(raw));
  } catch {
    /* private window or a damaged row — the defaults stand */
  }
  memo.set(pubkey, prefs);
  return prefs;
}

/** Per-room maps keep their newest entries: every deleted spam request would otherwise stay forever. */
const MAX_ROOM_ENTRIES = 2000;

function newest(map: Record<string, number>): Record<string, number> {
  const entries = Object.entries(map);
  if (entries.length <= MAX_ROOM_ENTRIES) return map;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_ROOM_ENTRIES));
}

// Another tab changed them: read again rather than overwrite its change with ours.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key && !e.key.startsWith("brainstorm_dm_prefs:")) return;
    memo.clear();
    for (const l of [...listeners]) l();
  });
}

/** Sign-out removed the rows (lib/accountStorage): drop what this tab remembers of them. */
export function forgetDmPrefs(): void {
  memo.clear();
  for (const l of [...listeners]) l();
}

export function updateDmPrefs(pubkey: string, change: (prefs: DmPrefs) => DmPrefs): DmPrefs {
  const changed = change(readDmPrefs(pubkey));
  const next = { ...changed, read: newest(changed.read), hidden: newest(changed.hidden) };
  memo.set(pubkey, next);
  try {
    localStorage.setItem(key(pubkey), JSON.stringify(next));
  } catch {
    /* kept for this tab only */
  }
  for (const l of [...listeners]) l();
  return next;
}

export function subscribeDmPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Set the read floor once, the first time the inbox runs for this account here. */
export function ensureReadFloor(pubkey: string, now = Math.floor(Date.now() / 1000)): number {
  const prefs = readDmPrefs(pubkey);
  if (prefs.readFloor) return prefs.readFloor;
  return updateDmPrefs(pubkey, (p) => ({ ...p, readFloor: now })).readFloor!;
}

export function markRoomRead(pubkey: string, room: string, at: number): void {
  if ((readDmPrefs(pubkey).read[room] ?? 0) >= at) return;
  updateDmPrefs(pubkey, (p) => ({ ...p, read: { ...p.read, [room]: at } }));
}

export function lastReadAt(prefs: DmPrefs, room: string): number {
  return Math.max(prefs.read[room] ?? 0, prefs.readFloor ?? 0);
}

export function acceptRoom(pubkey: string, room: string): void {
  updateDmPrefs(pubkey, (p) => {
    const hidden = { ...p.hidden };
    delete hidden[room];
    return { ...p, accepted: [...new Set([...p.accepted, room])], hidden };
  });
}

/** Hide a room until something newer than `at` arrives in it. */
export function hideRoom(pubkey: string, room: string, at: number): void {
  updateDmPrefs(pubkey, (p) => ({ ...p, hidden: { ...p.hidden, [room]: at } }));
}

/** Archive: out of Chats into Archived, until something newer arrives. */
export function archiveRoom(pubkey: string, room: string, at: number): void {
  updateDmPrefs(pubkey, (p) => ({
    ...p,
    hidden: { ...p.hidden, [room]: at },
    pinned: p.pinned.filter((k) => k !== room),
  }));
}

export function unarchiveRoom(pubkey: string, room: string): void {
  updateDmPrefs(pubkey, (p) => {
    const hidden = { ...p.hidden };
    delete hidden[room];
    return { ...p, hidden };
  });
}

export function setRoomPinned(pubkey: string, room: string, on: boolean): void {
  updateDmPrefs(pubkey, (p) => ({
    ...p,
    pinned: on ? [room, ...p.pinned.filter((k) => k !== room)] : p.pinned.filter((k) => k !== room),
  }));
}

export function setRoomMuted(pubkey: string, room: string, on: boolean): void {
  updateDmPrefs(pubkey, (p) => ({
    ...p,
    muted: on ? [...new Set([...p.muted, room])] : p.muted.filter((k) => k !== room),
  }));
}

export function setNotifyPrefs(pubkey: string, change: Partial<DmNotifyPrefs>): void {
  updateDmPrefs(pubkey, (p) => ({ ...p, notify: { ...p.notify, ...change } }));
}

export function setRoomTimer(pubkey: string, room: string, seconds: number): void {
  updateDmPrefs(pubkey, (p) => ({ ...p, timers: { ...p.timers, [room]: seconds } }));
}

export function roomTimer(prefs: DmPrefs, room: string): number {
  return prefs.timers[room] ?? prefs.defaultTimer;
}

/** Test seam. */
export function __resetDmPrefs(): void {
  memo.clear();
}
