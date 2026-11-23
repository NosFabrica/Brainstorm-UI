/**
 * One relay ask per key per window, shared by every hook that wants it.
 *
 * Hooks render from the EventStore; this only decides when to ask the relays
 * again. A key asked within its window is not asked again, and a hook mounting
 * while the ask is out joins it rather than sending a second.
 *
 * Bounded: an installed app left open for days asks about thousands of keys
 * (every profile, note and tag it showed), and both what was answered and
 * when each key may be asked again used to be kept for good. Past
 * `MAX_KEYS`, the keys asked longest ago are forgotten — which costs them, at
 * worst, an ask before their window would have let them.
 */
const askedUntil = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();
const answers = new Map<string, unknown>();

/** How many keys are remembered; a session showing more forgets the oldest. */
export const MAX_KEYS = 2000;

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
  return !inFlight.has(key) && (askedUntil.get(key) ?? 0) <= now;
}

/** Mark `key` asked, starting its window. */
export function claim(key: string, window: AskWindow, now = Date.now()): void {
  // Re-inserted, so the map's order is the order keys were last asked in.
  askedUntil.delete(key);
  askedUntil.set(key, now + window.minMs + Math.random() * (window.spreadMs ?? 0));
  trim();
}

/** Record `ask` as the one in flight for every key, and its answer once it lands. */
export function track<T>(keys: string[], ask: Promise<T>): Promise<T> {
  keys.forEach((key) => inFlight.set(key, ask));
  const clear = () => keys.forEach((key) => inFlight.get(key) === ask && inFlight.delete(key));
  ask.then((answer) => {
    keys.forEach((key) => {
      answers.delete(key);
      answers.set(key, answer);
    });
    clear();
    trim();
  }, clear);
  return ask;
}

/** Forget the keys asked longest ago, past the cap — never one whose ask is still out. */
function trim(): void {
  for (const map of [askedUntil, answers] as Map<string, unknown>[]) {
    if (map.size <= MAX_KEYS) continue;
    for (const key of map.keys()) {
      if (map.size <= MAX_KEYS) break;
      if (!inFlight.has(key)) map.delete(key);
    }
  }
}

export function inFlightFor(key: string): Promise<unknown> | undefined {
  return inFlight.get(key);
}

/** What the last ask for `key` answered, if it has. */
export function lastAnswer(key: string): unknown {
  return answers.get(key);
}

/** Ask now if due; else the ask already out, if any. */
export function askOnce<T>(key: string, window: AskWindow, ask: () => Promise<T>): Promise<unknown> | undefined {
  if (!isDue(key)) return inFlight.get(key);
  claim(key, window);
  return track([key], ask());
}

/** Drop what is kept of `key`: its answer and its window. For a key that will not be asked again. */
export function forget(key: string): void {
  askedUntil.delete(key);
  answers.delete(key);
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
