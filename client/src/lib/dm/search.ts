/**
 * Searching private messages — on this device only. Messages are only ever
 * readable here (relays hold ciphertext), so the search runs over what the
 * store has opened: the cache from earlier visits plus whatever history has
 * loaded since. Every word must match, ignoring case and accents.
 */
import type { DmMessage, DmRoom } from "./store";
import { CHAT_KIND, FILE_KIND } from "./giftWrap";

export interface MessageHit {
  room: DmRoom;
  message: DmMessage;
  /** The text around the first match, and where the matched words sit in it. */
  snippet: string;
  marks: [number, number][];
}

export interface SearchResults {
  /** Rooms whose name matches, in the order given. */
  rooms: DmRoom[];
  /** Matching messages, newest first. */
  hits: MessageHit[];
  /** Messages looked through. */
  searched: number;
}

/** Lowercased, accents off — "Café" finds "cafe". Same length as the input for Latin text. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function terms(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
}

const RADIUS = 48;

function snippetOf(text: string, words: string[]): { snippet: string; marks: [number, number][] } {
  const flat = text.replace(/\s+/g, " ").trim();
  const folded = fold(flat);
  // Folding can change length outside Latin scripts; fall back to unmarked text then.
  const aligned = folded.length === flat.length;
  const first = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0));
  const start = Number.isFinite(first) ? Math.max(0, first - RADIUS) : 0;
  const end = Math.min(flat.length, (Number.isFinite(first) ? first : 0) + RADIUS * 2);
  const head = start > 0 ? "…" : "";
  const snippet = head + flat.slice(start, end) + (end < flat.length ? "…" : "");
  const marks: [number, number][] = [];
  if (aligned) {
    const window = folded.slice(start, end);
    for (const w of words) {
      let i = window.indexOf(w);
      while (i >= 0) {
        marks.push([i + head.length, i + head.length + w.length]);
        i = window.indexOf(w, i + w.length);
      }
    }
    marks.sort((a, b) => a[0] - b[0]);
  }
  return { snippet, marks };
}

export function searchMessages(
  rooms: DmRoom[],
  query: string,
  opts: { titleOf: (room: DmRoom) => string; limit?: number },
): SearchResults {
  const words = terms(query);
  const out: SearchResults = { rooms: [], hits: [], searched: 0 };
  if (!words.length) return out;
  const limit = opts.limit ?? 200;
  for (const room of rooms) {
    const title = fold(opts.titleOf(room));
    if (words.every((w) => title.includes(w))) out.rooms.push(room);
    for (const message of room.messages) {
      if (message.kind !== CHAT_KIND && message.kind !== FILE_KIND) continue;
      out.searched++;
      const text = message.rumor.content;
      const folded = fold(text);
      if (!words.every((w) => folded.includes(w))) continue;
      out.hits.push({ room, message, ...snippetOf(text, words) });
    }
  }
  out.hits.sort((a, b) => b.message.createdAt - a.message.createdAt);
  out.hits = out.hits.slice(0, limit);
  return out;
}
