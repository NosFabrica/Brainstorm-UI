/**
 * "(3) Brainstorm" — an unread count in front of whatever title the page has
 * set. Pages set `document.title` themselves (share meta, legal pages), so the
 * count is re-applied whenever the title changes underneath it.
 */
const PREFIX = /^\(\d+\+?\) /;

let count = 0;
let observer: MutationObserver | null = null;
let writing = false;

function apply() {
  const base = document.title.replace(PREFIX, "");
  const next = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
  if (next === document.title) return;
  writing = true;
  document.title = next;
  writing = false;
}

function watch() {
  if (observer || typeof MutationObserver === "undefined") return;
  const head = document.head;
  if (!head) return;
  observer = new MutationObserver(() => {
    if (!writing) apply();
  });
  observer.observe(head, { subtree: true, childList: true, characterData: true });
}

export function setTitleCount(n: number): void {
  if (typeof document === "undefined") return;
  count = Math.max(0, n);
  watch();
  apply();
}
