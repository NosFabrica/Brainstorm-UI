/**
 * Run `work` once the browser has a quiet moment — work that matters, but not
 * before the screen the reader is waiting for. `timeoutMs` bounds the wait:
 * a page that never goes idle still gets it done. Safari has no
 * `requestIdleCallback`, nor has Node, so there it is a short timer instead.
 * Returns a cancel.
 */
export function whenIdle(work: () => void, { timeoutMs = 2000, fallbackMs = 200 } = {}): () => void {
  const scope = globalThis as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (scope.requestIdleCallback) {
    const handle = scope.requestIdleCallback(work, { timeout: timeoutMs });
    return () => scope.cancelIdleCallback?.(handle);
  }
  const timer = setTimeout(work, fallbackMs);
  return () => clearTimeout(timer);
}
