/**
 * The DM engine's time: its clock in seconds, the signer's stopwatch in
 * milliseconds, and its timers. Built once from the engine's deps, so tests
 * can drive every timer the engine and its parts set.
 */
export interface Clock {
  /** Seconds since the epoch: rumors' and wraps' `created_at`. */
  now(): number;
  /** Milliseconds, for timing how fast the signer answers. */
  ms(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  repeat(fn: () => void, ms: number): unknown;
  clearRepeat(handle: unknown): void;
}

export interface ClockDeps {
  now?: () => number;
  clockMs?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  setRepeating?: (fn: () => void, ms: number) => unknown;
  clearRepeating?: (handle: unknown) => void;
}

/** The deps' own functions where given, the platform's otherwise. */
export function makeClock(deps: ClockDeps): Clock {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const ms = deps.clockMs ?? Date.now;
  const set = deps.setTimer ?? ((fn: () => void, wait: number) => setTimeout(fn, wait));
  const clear = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const repeat = deps.setRepeating ?? ((fn: () => void, wait: number) => setInterval(fn, wait));
  const clearRepeat = deps.clearRepeating ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  return {
    now: () => now(),
    ms: () => ms(),
    set: (fn, wait) => set(fn, wait),
    clear: (h) => clear(h),
    repeat: (fn, wait) => repeat(fn, wait),
    clearRepeat: (h) => clearRepeat(h),
  };
}
