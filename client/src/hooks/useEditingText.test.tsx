// @vitest-environment jsdom
/**
 * Whether someone is typing — the phone tab bar steps aside while they are, because iOS
 * Safari shrinks its toolbar for a focused field without telling the page, and the bar was
 * left floating over a strip of results.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { isTextEditing, useEditingText } from "./useEditingText";

function add<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isTextEditing", () => {
  it("counts the things a keyboard comes up for", () => {
    expect(isTextEditing(add("input"))).toBe(true);
    expect(isTextEditing(add("input", { type: "search" }))).toBe(true);
    expect(isTextEditing(add("input", { type: "email" }))).toBe(true);
    expect(isTextEditing(add("textarea"))).toBe(true);
    const ce = add("div", { contenteditable: "true" });
    // jsdom does not compute isContentEditable; a browser does.
    Object.defineProperty(ce, "isContentEditable", { value: true });
    expect(isTextEditing(ce)).toBe(true);
  });

  it("does not count buttons, checkboxes, read-only fields or nothing", () => {
    expect(isTextEditing(add("button"))).toBe(false);
    expect(isTextEditing(add("input", { type: "checkbox" }))).toBe(false);
    expect(isTextEditing(add("input", { type: "range" }))).toBe(false);
    expect(isTextEditing(add("input", { readonly: "" }))).toBe(false);
    expect(isTextEditing(document.body)).toBe(false);
    expect(isTextEditing(null)).toBe(false);
  });
});

describe("useEditingText", () => {
  it("follows focus into a field and back out", async () => {
    const input = add("input", { type: "search" });
    const { result } = renderHook(() => useEditingText());
    expect(result.current).toBe(false);
    act(() => input.focus());
    expect(result.current).toBe(true);
    act(() => input.blur());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("stays on when focus moves from one field to the next", async () => {
    const a = add("input");
    const b = add("textarea");
    const { result } = renderHook(() => useEditingText());
    act(() => a.focus());
    act(() => b.focus());
    await new Promise((r) => setTimeout(r, 5));
    expect(result.current).toBe(true);
  });
});
