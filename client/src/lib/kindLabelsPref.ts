/**
 * Whether kind labels show on every card, on this device. Off until the
 * reader turns it on (Settings › Advanced): by default the pill earns its
 * place only where kinds mix on one surface — on a tab where every card is a
 * listing, "Listing" forty times says nothing (Benjamin, 2026-09-24). The
 * team and technical readers flip this for the full view.
 */
const KEY = "brainstorm_kind_labels_everywhere";

export function kindLabelsEverywhere(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setKindLabelsEverywhere(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private window, full quota — the default stands */
  }
}
