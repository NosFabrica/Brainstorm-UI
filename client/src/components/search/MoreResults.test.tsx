// @vitest-environment jsdom
/** The next page turns itself as the reader reaches the end — unless the connection is poor. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoreResults } from "./MoreResults";
import { __resetConnectionSpeed } from "@/lib/connection";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";

let io: ReturnType<typeof stubControllableIntersectionObserver>;
const onMore = vi.fn();

function setConnection(value: { effectiveType?: string; saveData?: boolean } | undefined) {
  Object.defineProperty(window.navigator, "connection", { value, configurable: true });
  __resetConnectionSpeed();
}

beforeEach(() => {
  onMore.mockClear();
  setConnection(undefined);
  io = stubControllableIntersectionObserver();
});
afterEach(() => {
  setConnection(undefined);
  vi.unstubAllGlobals();
});

describe("MoreResults", () => {
  it("turns the page itself when the end comes into view", () => {
    render(<MoreResults show loading={false} onMore={onMore} />);
    io.bringAllIntoView();
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("waits to be asked on a slow connection, and still offers the button", () => {
    setConnection({ effectiveType: "3g" });
    render(<MoreResults show loading={false} onMore={onMore} />);
    io.bringAllIntoView();
    expect(onMore).not.toHaveBeenCalled();
    expect(screen.getByTestId("search-more")).toBeInTheDocument();
  });

  it("waits to be asked on a very slow connection", () => {
    setConnection({ saveData: true });
    render(<MoreResults show loading={false} onMore={onMore} />);
    io.bringAllIntoView();
    expect(onMore).not.toHaveBeenCalled();
  });
});
