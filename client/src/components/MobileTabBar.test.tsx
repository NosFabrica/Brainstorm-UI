// @vitest-environment jsdom
/**
 * The phone tab bar steps aside while someone types: iOS Safari shrinks its toolbar for a
 * focused field without telling the page, and the bar was left floating over the results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));

import { MobileTabBar } from "./MobileTabBar";
import { __resetBottomChrome } from "@/lib/bottomChrome";

let width: PropertyDescriptor | undefined;
beforeEach(() => {
  width = Object.getOwnPropertyDescriptor(window, "innerWidth");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
});
afterEach(() => {
  cleanup();
  if (width) Object.defineProperty(window, "innerWidth", width);
  __resetBottomChrome();
  document.body.innerHTML = "";
});

describe("the phone tab bar while someone types", () => {
  it("is out of the tab order and the accessibility tree, and back on blur", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    render(<MobileTabBar />);
    const bar = screen.getByTestId("mobile-tab-bar");
    expect(bar.hasAttribute("inert")).toBe(false);

    act(() => input.focus());
    expect(bar.hasAttribute("inert")).toBe(true);
    expect(bar.getAttribute("aria-hidden")).toBe("true");

    act(() => input.blur());
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(bar.hasAttribute("inert")).toBe(false);
  });

  // Released on focus, the reserved space reflowed the page on every focus and blur.
  it("keeps the space it reserves, so the page does not reflow on focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    render(<MobileTabBar />);
    const padded = document.body.style.paddingBottom;
    expect(padded).toContain("4rem");
    act(() => input.focus());
    expect(document.body.style.paddingBottom).toBe(padded);
  });
});
