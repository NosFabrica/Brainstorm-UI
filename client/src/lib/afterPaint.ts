/**
 * Yield long enough for the browser to paint. Two frames, because a rAF callback
 * runs *before* the paint of its own frame.
 *
 * Every NIP-49 derivation in this app — unlocking, minting a Backup, checking a
 * Recovery password — blocks the main thread for 0.1–1.2s, so whatever pending
 * state explains the freeze has to be on screen before it starts.
 */
export function afterPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
