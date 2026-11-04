// @vitest-environment jsdom
/**
 * Settings › Assistants › Yours: the Assistants the User's Treasure Map uses,
 * one card each — this deployment's first — with the site each is verified
 * on and the Duty categories it holds, under one sentence saying where the
 * Duties live. Changing who does what stays in the Treasure Map editor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const ME = "1".repeat(64);
const HERE = "a".repeat(64);
const PROD = "b".repeat(64);
const h = vi.hoisted(() => ({
  taPubkey: "a".repeat(64) as string | null,
  map: undefined as undefined | { tags: string[][] },
}));
const NAMES: Record<string, string> = {
  [HERE]: "Relay Op's Brainstorm Assistant",
  [PROD]: "Pip's Brainstorm Assistant",
};
const SITES: Record<string, string> = {
  [HERE]: "brainstorm-staging.nosfabrica.com",
  [PROD]: "brainstorm.nosfabrica.com",
};

vi.mock("wouter", () => ({
  Link: ({ href, children, ...p }: { href: string; children: unknown }) => (
    <a href={href} {...p}>
      {children as never}
    </a>
  ),
}));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ taPubkey: h.taPubkey }) }));
vi.mock("@/hooks/useTrustProviderStatus", () => ({ useTrustProviderList: () => ({ event: h.map, settled: true }) }));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfiles: (pks: string[]) => new Map(pks.map((pk) => [pk, { name: NAMES[pk] }])),
}));
vi.mock("@/hooks/useVerifiedHost", () => ({
  useVerifiedHost: (pk: string | null | undefined) => (pk ? (SITES[pk] ?? null) : null),
}));

import { YourAssistants } from "./YourAssistants";

describe("YourAssistants", () => {
  beforeEach(() => {
    h.taPubkey = HERE;
    h.map = {
      tags: [
        ["30382:rank", PROD, "wss://scores.example"],
        ["30392", HERE, "wss://nip85.example"],
        ["39998", HERE, "wss://dcosl.example"],
      ],
    };
  });

  it("says where the Duties live, then one card per Assistant, this site's first", () => {
    render(<YourAssistants viewer={ME} />);
    expect(screen.getByTestId("your-assistants-summary")).toHaveTextContent(
      "Scores come from brainstorm.nosfabrica.com. Lists and Concepts come from this site.",
    );
    const cards = screen.getAllByTestId(/^assistant-card-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      `assistant-card-${HERE.slice(0, 8)}`,
      `assistant-card-${PROD.slice(0, 8)}`,
    ]);

    const here = cards[0];
    expect(here).toHaveTextContent("Relay Op's Brainstorm Assistant");
    expect(here).toHaveTextContent("This site");
    expect(within(here).getByText("Lists")).toBeInTheDocument();
    expect(within(here).getByText("Concepts")).toBeInTheDocument();

    const prod = cards[1];
    expect(prod).toHaveTextContent("Pip's Brainstorm Assistant");
    expect(prod).toHaveTextContent("brainstorm.nosfabrica.com");
    expect(within(prod).getByText("Scores")).toBeInTheDocument();
  });

  it("shows this site's Assistant holding nothing when the Map gives it nothing", () => {
    h.map = { tags: [["30382:rank", PROD, "wss://scores.example"]] };
    render(<YourAssistants viewer={ME} />);
    expect(screen.getByTestId(`assistant-card-${HERE.slice(0, 8)}`)).toHaveTextContent(
      "Holds nothing on your Treasure Map yet.",
    );
  });

  it("points to the Treasure Map editor for changing who does what", () => {
    render(<YourAssistants viewer={ME} />);
    expect(screen.getByTestId("your-assistants-change")).toHaveAttribute("href", "/settings?tab=assistants&view=map");
  });

  it("renders nothing until this deployment's Assistant is known", () => {
    h.taPubkey = null;
    const { container } = render(<YourAssistants viewer={ME} />);
    expect(container).toBeEmptyDOMElement();
  });
});
