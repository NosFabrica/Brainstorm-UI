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
  // Pinned to the window, not to the page (2026-11-19): the bar used to take its page's
  // width, so the B mark, the box and the avatar sat somewhere else on a profile, a tag and
  // the dashboard. It runs edge to edge on every page, with the one gutter, so they sit in
  // the same place whatever the page and however wide the screen.
  it("runs edge to edge on every page, with no cap of its own", () => {
    render(<HeaderBar testId="bar" />);
    const classes = screen.getByTestId("bar").firstElementChild!.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["px-4", "sm:px-6"]));
    expect(classes.filter((c) => c.startsWith("max-w-") || c === "mx-auto")).toEqual([]);
  });

  it("is the same row in the full-screen app view: only its surface differs", () => {
    render(<HeaderBar testId="page" />);
    const page = screen.getByTestId("page").firstElementChild!.className;
    cleanup();
    render(<HeaderBar testId="app" fullBleed />);
    expect(screen.getByTestId("app").firstElementChild!.className).toBe(page);
  });

  // The bar is wider than any page's content, so a box pushed up against the mark sat off to
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
  });

  // Centred only where both ends have room to be the same size, or the box would sit
  // somewhere else on each page: the account end is one button on one page and three on
  // the next. From a desktop width each end keeps a floor wider than the usual buttons, so
  // the box is in the middle on every page; narrower, it starts beside the mark on every page.
  it("centres the box from a desktop width, and starts it beside the mark below that", () => {
    at(1280);
    render(
      <HeaderBar testId="bar">
        <span data-testid="account" />
      </HeaderBar>,
    );
    const row = screen.getByTestId("bar").firstElementChild!;
    const classes = row.className.split(" ");
    expect(classes).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(classes).toContain("lg:grid-cols-[1fr_minmax(0,42rem)_1fr]");
    // The floor is inside each end, not on it: an end holding more than the floor (an
    // admin's badge, a count) then takes the room it needs and the box gives way, where a
    // floor on the cell itself let those buttons run off the edge of the window.
    const [left, , right] = Array.from(row.children);
    for (const end of [left, right]) {
      expect(end.className.split(" ")).not.toContain("lg:min-w-64");
      expect(end.firstElementChild!.className.split(" ")).toContain("lg:min-w-64");
    }
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
