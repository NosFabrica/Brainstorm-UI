/**
 * One ledger for what occupies the bottom of the window — the phone tab bar,
 * the now-playing bar. Each part publishes its own height as
 * `--bs-chrome-<key>`; the total is `--bs-bottom-chrome`, and the page is
 * padded by it, so content is never hidden under the stack and every floating
 * bottom-anchored thing (back to top, the scoring pill) offsets by one number.
 * Framework-free; components register in an effect and unregister on cleanup.
 */
const parts = new Map<string, string>();

function publish() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  if (parts.size === 0) {
    root.removeProperty("--bs-bottom-chrome");
    document.body.style.paddingBottom = "";
    return;
  }
  const total = `calc(0px + ${[...parts.values()].join(" + ")})`;
  root.setProperty("--bs-bottom-chrome", total);
  document.body.style.paddingBottom = total;
}

/** Occupy `height` (any CSS length) under `key`; returns the release. */
export function registerBottomChrome(key: string, height: string): () => void {
  parts.set(key, height);
  if (typeof document !== "undefined") document.documentElement.style.setProperty(`--bs-chrome-${key}`, height);
  publish();
  return () => {
    if (parts.get(key) !== height) return; // a newer registration owns the key
    parts.delete(key);
    if (typeof document !== "undefined") document.documentElement.style.removeProperty(`--bs-chrome-${key}`);
    publish();
  };
}

/** The stack's total as registered — the same string the page is padded by. */
export function bottomChromeTotal(): string {
  return parts.size === 0 ? "" : `calc(0px + ${[...parts.values()].join(" + ")})`;
}

/** Test seam: forget every part. */
export function __resetBottomChrome() {
  for (const key of [...parts.keys()]) {
    parts.delete(key);
    if (typeof document !== "undefined") document.documentElement.style.removeProperty(`--bs-chrome-${key}`);
  }
  publish();
}
