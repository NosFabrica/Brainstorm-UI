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
import DeveloperTrustedAssertionsPage from "./DeveloperTrustedAssertionsPage";
import DeveloperNip50Page from "./DeveloperNip50Page";
import DeveloperOpenRankingPage from "./DeveloperOpenRankingPage";

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

/** Each protocol page names who reads it and who serves it, each a link out. */
describe("the protocol pages' app lists", () => {
  const pages = [
    { name: "Trusted Assertions", Page: DeveloperTrustedAssertionsPage, testId: "card-ta-apps" },
    { name: "NIP-50", Page: DeveloperNip50Page, testId: "card-dev-apps" },
    { name: "Open Ranking", Page: DeveloperOpenRankingPage, testId: "card-ore-apps" },
  ];

  it.each(pages)("$name lists consumers and producers, each opening in a new tab", ({ Page, testId }) => {
    render(<Page />);
    for (const role of ["consumers", "producers"]) {
      const links = within(screen.getByTestId(`${testId}-${role}`)).getAllByRole("link");
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link.getAttribute("href")).toMatch(/^https:\/\//);
        expect(link.getAttribute("target")).toBe("_blank");
      }
    }
  });

  it("Trusted Assertions names Nostria and Amethyst as consumers", () => {
    render(<DeveloperTrustedAssertionsPage />);
    const consumers = screen.getByTestId("card-ta-apps-consumers");
    expect(within(consumers).getByText("Nostria")).toBeTruthy();
    expect(within(consumers).getByText("Amethyst")).toBeTruthy();
  });
});
