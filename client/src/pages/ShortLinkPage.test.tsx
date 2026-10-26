/**
 * Resolving `/s/<code>` and continuing to the full link.
 *
 * Issue: .scratch/shorturl/issues/04-share-short-link.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";

const PUBKEY = "f4d1866e8599563c52ceeedf11c28b8567e465c6e9a91df92add535d57f02ab0";
const navigate = vi.fn();
const resolveShortUrl = vi.fn();

vi.mock("wouter", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("wouter");
  return {
    ...actual,
    useRoute: () => [true, { code: "AB3XK9QZ" }],
    useLocation: () => ["/s/AB3XK9QZ", (to: string, opts?: unknown) => navigate(to, opts)],
  };
});
vi.mock("@/services/api", () => ({
  apiClient: { resolveShortUrl: (code: string) => resolveShortUrl(code) },
}));
// The real NotFound renders PublicPageHeader, which wants app-wide account
// context. What matters here is that this page *delegates* to it rather than
// hand-rolling its own dead end.
vi.mock("@/pages/not-found", () => ({
  default: () => <div data-testid="app-not-found" />,
}));

import ShortLinkPage from "./ShortLinkPage";

beforeEach(() => {
  navigate.mockClear();
  resolveShortUrl.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("resolving a short link", () => {
  it("continues to the full link the server built", async () => {
    resolveShortUrl.mockResolvedValue({ kind: "event", key: "e".repeat(64), relays: [], path: "/e/nevent1abc" });

    renderWithProviders(<ShortLinkPage />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/e/nevent1abc", { replace: true }));
  });

  it("shows not-found rather than leaving the site for an off-site path", async () => {
    resolveShortUrl.mockResolvedValue({ kind: "profile", key: PUBKEY, relays: [], path: "//evil.example/p" });

    renderWithProviders(<ShortLinkPage />);

    await waitFor(() => expect(screen.getByTestId("app-not-found")).toBeInTheDocument());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows not-found for a path the browser would read as off-site", async () => {
    resolveShortUrl.mockResolvedValue({ kind: "profile", key: PUBKEY, relays: [], path: "/\t/evil.example/p" });

    renderWithProviders(<ShortLinkPage />);

    await waitFor(() => expect(screen.getByTestId("app-not-found")).toBeInTheDocument());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("passes the code through untouched, whatever its length", async () => {
    resolveShortUrl.mockResolvedValue({ kind: "profile", key: PUBKEY, relays: [], path: "/p/npub1x" });

    renderWithProviders(<ShortLinkPage />);

    await waitFor(() => expect(resolveShortUrl).toHaveBeenCalledWith("AB3XK9QZ"));
  });

  it("shows the not-found treatment for an unknown code", async () => {
    const err = new Error("404") as Error & { status?: number };
    err.status = 404;
    resolveShortUrl.mockRejectedValue(err);

    renderWithProviders(<ShortLinkPage />);

    await waitFor(() => expect(screen.getByTestId("app-not-found")).toBeInTheDocument());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows not-found rather than a blank page when the server errors", async () => {
    resolveShortUrl.mockRejectedValue(new Error("500"));

    renderWithProviders(<ShortLinkPage />);

    await waitFor(() => expect(screen.getByTestId("app-not-found")).toBeInTheDocument());
  });

  it("does not flash a spinner on a fast response", async () => {
    resolveShortUrl.mockResolvedValue({ kind: "profile", key: PUBKEY, relays: [], path: "/p/npub1x" });

    renderWithProviders(<ShortLinkPage />);

    // Nothing visible immediately — the spinner is delayed so a quick resolve
    // goes straight to the profile without a flicker.
    expect(screen.queryByTestId("short-link-loading")).not.toBeInTheDocument();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it("does show a spinner once the wait is noticeable", async () => {
    vi.useFakeTimers();
    resolveShortUrl.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<ShortLinkPage />);
    await vi.advanceTimersByTimeAsync(1000);

    expect(screen.getByTestId("short-link-loading")).toBeInTheDocument();
  });
});
