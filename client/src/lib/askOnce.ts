/**
 * One relay ask per key per window, shared by every hook that wants it.
 *
 * Hooks render from the EventStore; this only decides when to ask the relays
 * again. A key asked within its window is not asked again, and a hook mounting
 * while the ask is out joins it rather than sending a second.
 */
const askedUntil = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();
const answers = new Map<string, unknown>();

export interface AskWindow {
  /** Shortest wait before the same key is asked again. */
  minMs: number;
  /** Random extra on top, so many keys asked together don't come due together. */
  spreadMs?: number;
}

/** Whether `key` is due an ask now: never asked, or its window has passed. */
export function isDue(key: string, now = Date.now()): boolean {
  return !inFlight.has(key) && (askedUntil.get(key) ?? 0) <= now;
}

/** Mark `key` asked, starting its window. */
export function claim(key: string, window: AskWindow, now = Date.now()): void {
  askedUntil.set(key, now + window.minMs + Math.random() * (window.spreadMs ?? 0));
}

/** Record `ask` as the one in flight for every key, and its answer once it lands. */
export function track<T>(keys: string[], ask: Promise<T>): Promise<T> {
  keys.forEach((key) => inFlight.set(key, ask));
  const clear = () => keys.forEach((key) => inFlight.get(key) === ask && inFlight.delete(key));
  ask.then((answer) => {
    keys.forEach((key) => answers.set(key, answer));
    clear();
  }, clear);
  return ask;
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

/** Test seam. */
export function __resetAsks(): void {
  askedUntil.clear();
  inFlight.clear();
  answers.clear();
}
