/**
 * Copy text to the clipboard, reliably across desktop and mobile. The async
 * Clipboard API works on secure contexts (HTTPS / localhost) but is blocked or
 * absent in many in-app webviews (Slack, Twitter, Instagram browsers) — exactly
 * where shared links get opened. So we fall back to a hidden-textarea +
 * execCommand("copy"), which works in those older/restricted contexts.
 * Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
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
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS Safari needs an explicit range
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
