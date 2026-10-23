/**
 * Copy text to the clipboard, reliably across desktop and mobile. The async
 * Clipboard API works on secure contexts (HTTPS / localhost) but is blocked or
 * absent in many in-app webviews (Slack, Twitter, Instagram browsers) — exactly
 * where shared links get opened. So we fall back to a hidden-textarea +
 * execCommand("copy"), which works in those older/restricted contexts.
 * Returns true on success.
 *
 * Inside a modal dialog, pass the dialog as `container`: the fallback's textarea
 * has to take focus, and a dialog traps focus inside itself — a textarea on the
 * page body behind it can't be focused, so nothing would be copied.
 */
export async function copyToClipboard(
  text: string,
  { container }: { container?: HTMLElement | null } = {},
): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    const host = container ?? document.body;
    host.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS Safari needs an explicit range
    const ok = document.execCommand("copy");
    host.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy a text still being fetched, starting the write inside the tap (WebKit needs that); `fallback` otherwise. */
export async function copyPromisedText(text: Promise<string>, fallback: string): Promise<boolean> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = text.catch(() => fallback).then((t) => new Blob([t], { type: "text/plain" }));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    } catch {
      // fall through to the plain copy
    }
  }
  return copyToClipboard(fallback);
}
