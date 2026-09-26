import { useEffect, useState } from "react";

/** Input types that bring up a keyboard. Checkboxes, buttons and ranges do not. */
const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", ""]);

/** Is this element one a person types into? */
export function isTextEditing(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return !(el as HTMLTextAreaElement).readOnly;
  if (el.tagName === "INPUT") {
    const input = el as HTMLInputElement;
    return TEXT_INPUTS.has((input.getAttribute("type") ?? "").toLowerCase()) && !input.readOnly;
  }
  return false;
}

/**
 * True while focus is in something a person types into.
 *
 * iOS Safari swaps its bottom toolbar for the shorter keyboard bar when a text field takes
 * focus, and hands the page nothing for it: innerHeight and visualViewport stay the same,
 * so a `position: fixed` bottom bar stays where the toolbar used to end, with page content
 * showing through the strip under it. Focus is the one signal there is.
 */
export function useEditingText(): boolean {
  const [editing, setEditing] = useState(() => typeof document !== "undefined" && isTextEditing(document.activeElement));
  useEffect(() => {
    const sync = () => setEditing(isTextEditing(document.activeElement));
    // focusout fires before focus lands on the next element; read it once it has.
    const onOut = () => setTimeout(sync, 0);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onOut);
    sync();
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return editing;
}
