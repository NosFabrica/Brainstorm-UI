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

/** Messages are immutable once opened: fold each one's text once, not per keystroke. */
const foldedText = new WeakMap<DmMessage, string>();
function foldedOf(message: DmMessage): string {
  let f = foldedText.get(message);
  if (f === undefined) {
    f = fold(message.rumor.content);
    foldedText.set(message, f);
  }
  return f;
}

/**
 * The folded text with, for each of its characters, the index of the original
 * character it came from — folding changes length (Hangul, decomposed accents),
 * and positions found in one must be cut from the other.
 */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = "";
  const origin: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) origin.push(i);
    i += ch.length;
  }
  return { folded, origin };
}

function snippetOf(text: string, words: string[]): { snippet: string; marks: [number, number][] } {
  const flat = text.replace(/\s+/g, " ").trim();
  const { folded, origin } = foldWithMap(flat);
  const at = (f: number) => (f >= origin.length ? flat.length : origin[f]);
  const hits = words.map((w) => folded.indexOf(w)).filter((i) => i >= 0);
  const first = hits.length ? at(Math.min(...hits)) : 0;
  const start = Math.max(0, first - RADIUS);
  const end = Math.min(flat.length, first + RADIUS * 2);
  const head = start > 0 ? "…" : "";
  const snippet = head + flat.slice(start, end) + (end < flat.length ? "…" : "");
  const marks: [number, number][] = [];
  for (const w of words) {
    let f = folded.indexOf(w);
    while (f >= 0) {
      const a = at(f);
      const b = at(f + w.length);
      if (a >= start && b <= end) marks.push([a - start + head.length, b - start + head.length]);
      f = folded.indexOf(w, f + w.length);
    }
  }
  marks.sort((x, y) => x[0] - y[0]);
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
      const folded = foldedOf(message);
      if (!words.every((w) => folded.includes(w))) continue;
      out.hits.push({ room, message, ...snippetOf(message.rumor.content, words) });
    }
  }
  out.hits.sort((a, b) => b.message.createdAt - a.message.createdAt);
  out.hits = out.hits.slice(0, limit);
  return out;
}
