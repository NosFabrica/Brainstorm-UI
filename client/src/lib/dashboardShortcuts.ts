/**
 * The dashboard's single-key shortcuts — E exports the scores, H goes home,
 * ? opens the sheet — and when a keystroke is one.
 *
 * Never while the reader is typing. The old guard only knew inputs and
 * textareas; the header's search box is a contenteditable, so an "e" typed
 * into it downloaded a JSON file (Benjamin, 2026-09-30). Any editable
 * element, or anything inside one, is typing. Never with a modifier held
 * either: ⌘E and Ctrl+E belong to the browser.
 */
export type DashboardShortcut = "export" | "home" | "help";

/** Is this element, or an ancestor, something a person types into? */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if ((target as HTMLElement).isContentEditable) return true;
  return !!target.closest(
    '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], input, textarea, select',
  );
}

export function dashboardShortcutFor(
  e: Pick<KeyboardEvent, "key" | "target" | "metaKey" | "ctrlKey" | "altKey" | "isComposing">,
): DashboardShortcut | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return null;
  if (isTypingTarget(e.target)) return null;
  switch (e.key.toLowerCase()) {
    case "e":
      return "export";
    case "h":
      return "home";
    case "?":
      return "help";
    default:
      return null;
  }
}
