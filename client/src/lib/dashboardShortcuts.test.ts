// @vitest-environment jsdom
/**
 * The dashboard's single-key shortcuts (E exports, H goes home, ? opens the
 * sheet) must never fire while the reader is typing — the header's search box
 * is a contenteditable, not an input, and an "e" typed there downloaded a
 * file — nor when a modifier is held (⌘E is the browser's, not ours).
 */
import { describe, expect, it } from "vitest";
import { dashboardShortcutFor } from "./dashboardShortcuts";

const key = (k: string, target: EventTarget | null, extra: Partial<KeyboardEvent> = {}) =>
  ({ key: k, target, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, ...extra }) as KeyboardEvent;

const el = (tag: string, attrs: Record<string, string> = {}) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  document.body.appendChild(node);
  return node;
};

describe("dashboardShortcutFor", () => {
  it("maps E, H and ? on the page body", () => {
    expect(dashboardShortcutFor(key("e", document.body))).toBe("export");
    expect(dashboardShortcutFor(key("E", document.body))).toBe("export");
    expect(dashboardShortcutFor(key("h", document.body))).toBe("home");
    expect(dashboardShortcutFor(key("?", document.body))).toBe("help");
    expect(dashboardShortcutFor(key("x", document.body))).toBeNull();
  });

  it("is nothing while typing: inputs, textareas, selects, and any contenteditable", () => {
    expect(dashboardShortcutFor(key("e", el("input")))).toBeNull();
    expect(dashboardShortcutFor(key("e", el("textarea")))).toBeNull();
    expect(dashboardShortcutFor(key("e", el("select")))).toBeNull();
    const box = el("div", { contenteditable: "true", role: "combobox" });
    expect(dashboardShortcutFor(key("e", box))).toBeNull();
    // A pill inside the box: the editable ancestor still counts.
    const inside = document.createElement("span");
    box.appendChild(inside);
    expect(dashboardShortcutFor(key("h", inside))).toBeNull();
    expect(dashboardShortcutFor(key("?", box))).toBeNull();
  });

  it("is nothing with a modifier held, or mid-composition", () => {
    expect(dashboardShortcutFor(key("e", document.body, { metaKey: true }))).toBeNull();
    expect(dashboardShortcutFor(key("e", document.body, { ctrlKey: true }))).toBeNull();
    expect(dashboardShortcutFor(key("e", document.body, { altKey: true }))).toBeNull();
    expect(dashboardShortcutFor(key("e", document.body, { isComposing: true }))).toBeNull();
  });
});
