// @vitest-environment jsdom
/**
 * /developers is public, but "Set up with your AI agent" is internal for now:
 * admins see it, marked "internal" as Settings marks what only admins have;
 * a visitor or a regular user doesn't.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ user: null as { isAdmin: boolean } | null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => h.user }));
// The site chrome (header, footer) isn't what's under test.
vi.mock("@/components/InfoPageLayout", () => ({ InfoPageLayout: ({ children }: { children: ReactNode }) => children }));

import DevelopersPage from "./DevelopersPage";

beforeEach(() => {
  h.user = null;
});

describe("DevelopersPage", () => {
  it("an admin sees the AI agent setup, marked internal", () => {
    h.user = { isAdmin: true };
    render(<DevelopersPage />);
    const section = screen.getByTestId("section-agent-setup");
    expect(within(section).getByText("Set up with your AI agent")).toBeTruthy();
    expect(within(section).getByTestId("chip-internal").textContent).toBe("internal");
  });

  it("a regular user doesn't see it", () => {
    h.user = { isAdmin: false };
    render(<DevelopersPage />);
    expect(screen.queryByTestId("section-agent-setup")).toBeNull();
  });

  it("a signed-out visitor doesn't see it", () => {
    render(<DevelopersPage />);
    expect(screen.getByTestId("text-dev-title")).toBeTruthy();
    expect(screen.queryByTestId("section-agent-setup")).toBeNull();
  });
});
