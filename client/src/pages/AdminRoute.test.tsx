// @vitest-environment jsdom
/** The operator console is its own download, and still only for admins. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const display = vi.hoisted(() => ({ current: null as { pubkey?: string; isAdmin?: boolean } | null }));
const session = vi.hoisted(() => ({ current: true }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => display.current }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => session.current }));
vi.mock("@/pages/AdminPage", () => ({ default: () => <p>operator console</p> }));
vi.mock("@/pages/ProfilePage", () => ({ default: () => <p>analytics profile</p> }));
vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: ({ component: C }: { component: () => JSX.Element }) => <C />,
}));
// The loading screen draws the app's header, which needs the app's providers; its own test covers it.
vi.mock("@/components/RouteFallback", () => ({ RouteFallback: () => <p>loading</p> }));

import { Route } from "wouter";
import { AdminProfileRoute, AdminRoute } from "./AdminRoute";

beforeEach(() => {
  window.history.replaceState({}, "", "/admin");
  session.current = true;
});

describe("AdminRoute", () => {
  it("shows an admin the console once it has loaded", async () => {
    display.current = { pubkey: "a", isAdmin: true };
    render(<AdminRoute />);
    expect(await screen.findByText("operator console")).toBeInTheDocument();
  });

  it("sends anyone else to the dashboard", async () => {
    display.current = { pubkey: "b", isAdmin: false };
    render(<AdminRoute />);
    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
    expect(screen.queryByText("operator console")).toBeNull();
  });

  it("keeps the console while a 401 re-mints the admin's Session", async () => {
    display.current = { pubkey: "a", isAdmin: true };
    const { rerender } = render(<AdminRoute />);
    expect(await screen.findByText("operator console")).toBeInTheDocument();
    // refreshSession clears the Session (and its claim) for one round-trip.
    act(() => {
      display.current = { pubkey: "a", isAdmin: false };
      session.current = false;
    });
    rerender(<AdminRoute />);
    expect(screen.getByText("operator console")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin");
  });

  it("waits, rather than redirecting, while a Session is still being decided", () => {
    display.current = { pubkey: "c", isAdmin: false };
    session.current = false;
    render(<AdminRoute />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin");
  });

  it("does not carry one identity's claim to another", async () => {
    display.current = { pubkey: "a", isAdmin: true };
    const { rerender } = render(<AdminRoute />);
    expect(await screen.findByText("operator console")).toBeInTheDocument();
    display.current = { pubkey: "d", isAdmin: false };
    session.current = false;
    rerender(<AdminRoute />);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });
});

describe("AdminProfileRoute", () => {
  const renderAt = () => {
    window.history.replaceState({}, "", "/profile/npub1x");
    return render(<Route path="/profile/:npub" component={AdminProfileRoute} />);
  };

  it("shows an admin the analytics view", async () => {
    display.current = { pubkey: "a", isAdmin: true };
    renderAt();
    expect(await screen.findByText("analytics profile")).toBeInTheDocument();
  });

  it("sends an anonymous visitor to the public profile, not to /login", async () => {
    display.current = null;
    session.current = false;
    renderAt();
    await waitFor(() => expect(window.location.pathname).toBe("/p/npub1x"));
  });

  it("sends a signed-in non-admin to the public profile", async () => {
    display.current = { pubkey: "b", isAdmin: false };
    renderAt();
    await waitFor(() => expect(window.location.pathname).toBe("/p/npub1x"));
  });

  it("waits while the Session is being decided", () => {
    display.current = { pubkey: "c", isAdmin: false };
    session.current = false;
    renderAt();
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/profile/npub1x");
  });
});
