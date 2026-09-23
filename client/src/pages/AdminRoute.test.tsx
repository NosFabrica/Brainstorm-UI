// @vitest-environment jsdom
/** The operator console is its own download, and still only for admins. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const display = vi.hoisted(() => ({ current: null as { isAdmin?: boolean } | null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => display.current }));
vi.mock("@/pages/AdminPage", () => ({ default: () => <p>operator console</p> }));

import { AdminRoute } from "./AdminRoute";

beforeEach(() => {
  window.history.replaceState({}, "", "/admin");
});

describe("AdminRoute", () => {
  it("shows an admin the console once it has loaded", async () => {
    display.current = { isAdmin: true };
    render(<AdminRoute />);
    expect(await screen.findByText("operator console")).toBeInTheDocument();
  });

  it("sends anyone else to the dashboard", async () => {
    display.current = { isAdmin: false };
    render(<AdminRoute />);
    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
    expect(screen.queryByText("operator console")).toBeNull();
  });
});
