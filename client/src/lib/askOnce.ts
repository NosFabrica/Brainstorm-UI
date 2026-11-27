/**
 * One relay ask per key per window, shared by every hook that wants it.
 *
 * Hooks render from the EventStore; this only decides when to ask the relays
 * again. A key asked within its window is not asked again, and a hook mounting
 * while the ask is out joins it rather than sending a second.
 *
 * A window is only kept for an ask that came back with something. One that
 * failed is forgotten at once, and one that came back empty (an empty list —
 * which is also what a fetcher that swallowed its relays' errors answers) is
 * asked again after `EMPTY_RETRY_MS`, not after its full window:
 * a dead socket at the moment of asking must not hide a screen's data for
 * the next five minutes. Coming back to the app re-opens every window
 * (`reopenWindows`, services/appResume).
 *
 * Bounded: an installed app left open for days asks about thousands of keys
 * (every profile, note and tag it showed), and both what was answered and
 * when each key may be asked again used to be kept for good. Past
 * `MAX_KEYS`, the keys asked longest ago are forgotten — which costs them, at
 * worst, an ask before their window would have let them. Answers, which hold
 * whole event lists, are kept for fewer (`MAX_ANSWERS`), and a long key (a
 * list of coordinates) is held as its hash.
 */
const askedUntil = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();
const answers = new Map<string, unknown>();

/** How many keys are remembered; a session showing more forgets the oldest. */
export const MAX_KEYS = 2000;
/** How many answers are kept: each can be a whole list of events. */
export const MAX_ANSWERS = 500;
/** How soon an ask that came back empty may be asked again. */
export const EMPTY_RETRY_MS = 30_000;

/** Past this length a key is kept as a prefix and a hash of the whole. */
const LONG_KEY = 256;

/** cyrb53: a fast 53-bit string hash; two seeds make collisions negligible. */
function hash53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The key as kept: itself, or for a long one its start, its length and its hash. */
export function compactKey(key: string): string {
  if (key.length <= LONG_KEY) return key;
  return `${key.slice(0, 96)}…${key.length}:${hash53(key, 1)}${hash53(key, 2)}`;
}

/**
 * Whether an answer says the relays had nothing (or couldn't say): an empty
 * list, which is what `requestAll` answers when every relay failed. A null
 * stays a real answer — `refreshProfileEvent`'s "nothing newer than held".
 */
function isEmptyAnswer(answer: unknown): boolean {
  return Array.isArray(answer) && answer.length === 0;
}

export interface AskWindow {
  /** Shortest wait before the same key is asked again. */
  minMs: number;
  /** Random extra on top, so many keys asked together don't come due together. */
  spreadMs?: number;
}

/** The window a store-read hook asks one replaceable in (`useStoreReplaceable`'s default). */
export const REPLACEABLE_ASK_WINDOW: AskWindow = { minMs: 5 * 60_000 };

/**
 * The key `useStoreReplaceable` asks a replaceable event under. Named here so
 * a non-hook caller (lib/eventCache's boot revalidation) can make the same ask
 * and have the hook join it, rather than both asking.
 */
export const replaceableAskKey = (kind: number, pubkey: string, identifier?: string) =>
  `replaceable:${kind}:${pubkey}:${identifier ?? ""}`;

/** Whether `key` is due an ask now: never asked, or its window has passed. */
export function isDue(key: string, now = Date.now()): boolean {
  const k = compactKey(key);
  return !inFlight.has(k) && (askedUntil.get(k) ?? 0) <= now;
}

/** Mark `key` asked, starting its window. */
export function claim(key: string, window: AskWindow, now = Date.now()): void {
  const k = compactKey(key);
  // Re-inserted, so the map's order is the order keys were last asked in.
  askedUntil.delete(k);
  askedUntil.set(k, now + window.minMs + Math.random() * (window.spreadMs ?? 0));
  trim();
}

/**
 * Record `ask` as the one in flight for every key, and its answer once it
 * lands. A failed ask gives up its window; an empty one keeps it for
 * `EMPTY_RETRY_MS` at most.
 */
export function track<T>(keys: string[], ask: Promise<T>): Promise<T> {
  const ks = keys.map(compactKey);
  ks.forEach((key) => inFlight.set(key, ask));
  const ours = (key: string) => inFlight.get(key) === ask;
  const clear = () => ks.forEach((key) => ours(key) && inFlight.delete(key));
  ask.then(
    (answer) => {
      const retryAt = isEmptyAnswer(answer) ? Date.now() + EMPTY_RETRY_MS : Infinity;
      ks.forEach((key) => {
        if (!ours(key)) return;
        answers.delete(key);
        answers.set(key, answer);
        const until = askedUntil.get(key);
        if (until !== undefined && until > retryAt) askedUntil.set(key, retryAt);
      });
      clear();
      trim();
    },
    () => {
      ks.forEach((key) => ours(key) && askedUntil.delete(key));
      clear();
    },
  );
  return ask;
}

/** Forget the keys asked longest ago, past the cap — never one whose ask is still out. */
function trim(): void {
  for (const [map, max] of [
    [askedUntil, MAX_KEYS],
    [answers, MAX_ANSWERS],
  ] as [Map<string, unknown>, number][]) {
    if (map.size <= max) continue;
    for (const key of map.keys()) {
      if (map.size <= max) break;
      if (!inFlight.has(key)) map.delete(key);
    }
  }
}

export function inFlightFor(key: string): Promise<unknown> | undefined {
  return inFlight.get(compactKey(key));
}

/** What the last ask for `key` answered, if it has. */
export function lastAnswer(key: string): unknown {
  return answers.get(compactKey(key));
}

/** Ask now if due; else the ask already out, if any. */
export function askOnce<T>(key: string, window: AskWindow, ask: () => Promise<T>): Promise<unknown> | undefined {
  if (!isDue(key)) return inFlightFor(key);
  claim(key, window);
  return track([key], ask());
}

/**
 * The answer for `key`: the ask's, if it is due or out, else the one kept from
 * its window. For an ask whose answer is derived (a tally, a status map) and is
 * asked batch by batch from an effect, where useStoreEvents' one key per mount
 * doesn't fit.
 */
export function askAnswer<T>(key: string, window: AskWindow, ask: () => Promise<T>): Promise<T | undefined> {
  return (askOnce(key, window, ask) ?? Promise.resolve(lastAnswer(key))) as Promise<T | undefined>;
}

/** Drop what is kept of `key`: its answer and its window. For a key that will not be asked again. */
export function forget(key: string): void {
  const k = compactKey(key);
  askedUntil.delete(k);
  answers.delete(k);
}

/**
 * Forget every window and answer, keeping the asks still out. For when the
 * store has dropped events (lib/storePruning): a key asked inside its window
 * would otherwise not be asked again, and its screen, mounted next, would find
 * neither the events nor an ask to bring them back.
 */
export function forgetSettled(): void {
  askedUntil.clear();
  answers.clear();
}

/**
 * Re-open every window, keeping the answers (still shown) and the asks still
 * out: the app is back from an absence (services/appResume), and what it
 * showed is worth asking for again on the next mount.
 */
export function reopenWindows(): void {
  askedUntil.clear();
}

/** Test seam. */
export function __resetAsks(): void {
  askedUntil.clear();
  inFlight.clear();
  answers.clear();
}

/** Test seam: how many keys are remembered. */
export function __askSizes(): { windows: number; answers: number } {
  return { windows: askedUntil.size, answers: answers.size };
}
