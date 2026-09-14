/**
 * The guard on every page that needs the Brainstorm server. Signed out, it
 * sends you to sign in; signed in with the server down, it shows the sorry
 * page where the page would have been — and public search keeps working,
 * so that is the way out it offers (the dev, 2026-09-09: "if just search is
 * down, may still let them browse the dashboard", and the reverse).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ServerStatus } from "@/lib/serverStatus";
import { RequireAuth } from "./RequireAuth";

const signedInMock = vi.fn(() => true);
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => signedInMock() }));
const OK: ServerStatus = { api: "ok", search: "ok", recovery: 0, checking: false, nextProbeAt: null };
const statusMock = vi.fn<() => ServerStatus>(() => OK);
const retryMock = vi.fn();
vi.mock("@/lib/serverStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/serverStatus")>();
  return { ...actual, useServerStatus: () => statusMock(), retryNow: (scope: "api" | "search") => retryMock(scope) };
});

const Page = () => <div data-testid="the-page">dashboard</div>;

beforeEach(() => {
  vi.clearAllMocks();
  signedInMock.mockReturnValue(true);
  statusMock.mockReturnValue(OK);
  window.history.replaceState({}, "", "/dashboard");
});

describe("RequireAuth", () => {
  it("signed in with the server up renders the page", () => {
    render(<RequireAuth component={Page} />);
    expect(screen.getByTestId("the-page")).toBeInTheDocument();
  });

  it("signed in with the API down shows the sorry page, offers the search, and Try again probes now", () => {
    statusMock.mockReturnValue({ ...OK, api: "down", nextProbeAt: Date.now() + 10_000 });
    render(<RequireAuth component={Page} />);
    expect(screen.queryByTestId("the-page")).toBeNull();
    expect(screen.getByTestId("sorry-api")).toBeInTheDocument();
    expect(screen.getByTestId("sorry-secondary")).toHaveAttribute("href", "/");
    expect(screen.getByTestId("sorry-countdown")).toHaveTextContent(/Checking again in (9|10)s/);
    screen.getByTestId("sorry-retry").click();
    expect(retryMock).toHaveBeenCalledWith("api");
  });

  it("signed out still goes to sign in, server or no server", () => {
    signedInMock.mockReturnValue(false);
    statusMock.mockReturnValue({ ...OK, api: "down" });
    render(<RequireAuth component={Page} />);
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByTestId("sorry-api")).toBeNull();
  });
});
