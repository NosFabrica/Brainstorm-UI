// @vitest-environment jsdom
/**
 * The bar under every header: the search box from `sm` up, the magnifier below it —
 * never both, and neither when the page says no — and an optional Back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/HeaderSearchBox", () => ({ HeaderSearchBox: () => <div data-testid="header-box" /> }));
const openMock = vi.fn();
vi.mock("@/components/MobileSearchOverlay", () => ({ openMobileSearch: () => openMock() }));
let installed = false;
vi.mock("@/lib/installedApp", () => ({ isInstalledPhoneApp: () => installed }));

import { HeaderBar } from "./HeaderBar";

function at(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
}
afterEach(() => {
  cleanup();
  at(1024);
  installed = false;
  window.history.replaceState(null, "", "/");
});

/** An in-app trip: `depth` screens deep, now at `path`. */
function visit(path: string, depth: number) {
  window.history.replaceState({ bsDepth: depth }, "", path);
}

describe("the header bar", () => {
  // One width on every page (2026-11-19): the bar used to take its page's width, so the B
  // mark, the box and the avatar sat somewhere else on a profile, a tag and the dashboard.
  it("is the wide page width, whatever page it is on", () => {
    render(<HeaderBar testId="bar" />);
    const row = screen.getByTestId("bar").firstElementChild!;
    expect(row.className.split(" ")).toEqual(expect.arrayContaining(["mx-auto", "w-full", "max-w-7xl"]));
  });

  // The bar is wider than most pages' content, so a box pushed up against the mark sat off to
  // one side of the page under it. It is centred: the mark on the left, the box in the middle
  // of the bar (and so over the middle of the page), the account on the right.
  it("puts the search box in the middle of the bar, between the mark and the account", () => {
    at(1024);
    render(
      <HeaderBar testId="bar">
        <span data-testid="account" />
      </HeaderBar>,
    );
    const [left, middle, right] = Array.from(screen.getByTestId("bar").firstElementChild!.children);
    expect(left).toContainElement(screen.getByTestId("header-brand"));
    expect(middle).toBe(screen.getByTestId("header-box"));
    expect(right).toContainElement(screen.getByTestId("account"));
    // Equal room either side of the box, whatever the two ends hold.
    expect(screen.getByTestId("bar").firstElementChild!.className).toContain("grid-cols-[1fr_minmax(0,42rem)_1fr]");
  });

  it("keeps the mark left and the account right on a page with no search box", () => {
    at(1024);
    render(
      <HeaderBar testId="bar" search={false}>
        <span data-testid="account" />
      </HeaderBar>,
    );
    const cells = Array.from(screen.getByTestId("bar").firstElementChild!.children);
    expect(cells).toHaveLength(3);
    expect(cells[0]).toContainElement(screen.getByTestId("header-brand"));
    expect(cells[1]).toBeEmptyDOMElement();
    expect(cells[2]).toContainElement(screen.getByTestId("account"));
  });

  it("mounts the search box on a wide screen, with no magnifier", () => {
    at(1024);
    render(<HeaderBar />);
    expect(screen.getByTestId("header-box")).toBeInTheDocument();
    expect(screen.queryByTestId("header-search-mobile")).toBeNull();
  });

  it("on a phone the box is not mounted at all — the magnifier opens the sheet", () => {
    at(390);
    render(<HeaderBar />);
    expect(screen.queryByTestId("header-box")).toBeNull();
    fireEvent.click(screen.getByTestId("header-search-mobile"));
    expect(openMock).toHaveBeenCalled();
  });

  it("search={false} leaves out both", () => {
    at(1024);
    render(<HeaderBar search={false} />);
    expect(screen.queryByTestId("header-box")).toBeNull();
    at(390);
    cleanup();
    render(<HeaderBar search={false} />);
    expect(screen.queryByTestId("header-search-mobile")).toBeNull();
  });

  it("pins a Back that says where it goes", () => {
    const onClick = vi.fn();
    render(<HeaderBar back={{ label: "Back to Staci", onClick }} />);
    const back = screen.getByTestId("header-back");
    expect(back).toHaveAttribute("aria-label", "Back to Staci");
    fireEvent.click(back);
    expect(onClick).toHaveBeenCalled();
  });

  describe("in the installed phone app, with no browser Back to fall back on", () => {
    it("offers Back on a screen reached from inside the app, and goes back", () => {
      installed = true;
      visit("/p/npub1abc", 2);
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      render(<HeaderBar />);
      fireEvent.click(screen.getByTestId("header-back"));
      expect(back).toHaveBeenCalled();
      back.mockRestore();
    });

    it("not on a tab's own screen, nor where nothing in the app sits behind", () => {
      installed = true;
      visit("/dashboard", 3);
      render(<HeaderBar />);
      expect(screen.queryByTestId("header-back")).toBeNull();
      cleanup();
      visit("/p/npub1abc", 0);
      render(<HeaderBar />);
      expect(screen.queryByTestId("header-back")).toBeNull();
    });

    it("never in a browser tab, which has its own", () => {
      visit("/p/npub1abc", 2);
      render(<HeaderBar />);
      expect(screen.queryByTestId("header-back")).toBeNull();
    });
  });
});
