// Per-ACCOUNT "Recent" for the home search box. A unified, most-recent-first
// list of two kinds of thing the visitor did from search:
//   • query   — a text search they ran (re-run on click)
//   • profile — a person they opened from search (re-open on click, shown with
//               their avatar/handle)
// Stores only the visitor's own search activity, first-party + functional → no
// consent banner (same lightweight localStorage pattern as the hints flag).
//
// Scoped per pubkey (and a separate "anon" bucket when logged out): on a shared
// browser, signing in as a different account — or creating a new one — must not
// inherit or overwrite the previous person's search history. Each identity keeps
// its own list, so switching back restores it untouched.
import { getCurrentUser } from "@/services/nostr";

const KEY_PREFIX = "brainstorm_recent_searches";
const MAX = 6;

function storageKey(): string {
  let who = "anon";
  try { who = getCurrentUser()?.pubkey || "anon"; } catch { /* SSR / no storage */ }
  return `${KEY_PREFIX}:${who}`;
}

export type RecentItem =
  | { type: "query"; q: string; t: number }
  | {
      type: "profile";
      pubkey: string;
      npub: string;
      label: string;
      picture?: string;
      nip05?: string;
      t: number;
    };

/** Stable identity for de-dupe / removal / React keys. */
export function recentKey(item: RecentItem): string {
  return item.type === "profile"
    ? `profile:${item.pubkey.toLowerCase()}`
    : `query:${item.q.toLowerCase()}`;
}

// Tolerate old records: pre-profile entries were bare { q, t } with no `type`.
function normalize(e: any): RecentItem | null {
  if (!e || typeof e.t !== "number") return null;
  if (e.type === "profile") {
    if (typeof e.pubkey !== "string" || typeof e.npub !== "string" || typeof e.label !== "string") return null;
    return {
      type: "profile",
      pubkey: e.pubkey,
      npub: e.npub,
      label: e.label,
      picture: typeof e.picture === "string" ? e.picture : undefined,
      nip05: typeof e.nip05 === "string" ? e.nip05 : undefined,
      t: e.t,
    };
  }
  if (typeof e.q === "string") return { type: "query", q: e.q, t: e.t };
  return null;
}

export function getRecentItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((x): x is RecentItem => x !== null).slice(0, MAX);
  } catch {
    return [];
  }
}

function write(list: RecentItem[]): RecentItem[] {
  try { localStorage.setItem(storageKey(), JSON.stringify(list)); } catch {}
  return list;
}

// Move an item to the front, de-duped by identity, capped. Returns the new list
// so callers can sync React state in one line.
function unshift(item: RecentItem): RecentItem[] {
  const key = recentKey(item);
  const rest = getRecentItems().filter((e) => recentKey(e) !== key);
  return write([item, ...rest].slice(0, MAX));
}

export function pushRecentQuery(q: string): RecentItem[] {
  const query = q.trim();
  if (!query) return getRecentItems();
  return unshift({ type: "query", q: query, t: Date.now() });
}

export interface RecentProfileInput {
  pubkey: string;
  npub: string;
  label: string;
  picture?: string;
  nip05?: string;
}

export function pushRecentProfile(p: RecentProfileInput): RecentItem[] {
  const pubkey = (p.pubkey || "").toLowerCase();
  if (!pubkey || !p.npub) return getRecentItems();
  return unshift({
    type: "profile",
    pubkey,
    npub: p.npub,
    label: p.label || p.npub,
    picture: p.picture || undefined,
    nip05: p.nip05 || undefined,
    t: Date.now(),
  });
}

export function removeRecentItem(item: RecentItem): RecentItem[] {
  const key = recentKey(item);
  return write(getRecentItems().filter((e) => recentKey(e) !== key));
}

export function clearRecentSearches(): RecentItem[] {
  return write([]);
}
