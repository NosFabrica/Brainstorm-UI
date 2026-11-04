// @vitest-environment jsdom
/**
 * Settings › Assistants › Yours grows with the User. While everything happens
 * on this site it is one card — this site's Assistant, the big card passed in
 * as the child. Once another Assistant holds a Duty: a sentence saying where
 * the Duties live, the card, then "Also working for you" with the others only.
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
  [HERE]: "This site's Brainstorm Assistant",
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

const Card = () => <div data-testid="this-site-card">This site's Assistant card</div>;
const show = () =>
  render(
    <YourAssistants viewer={ME}>
      <Card />
    </YourAssistants>,
  );

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

  it("is just this site's card while everything happens here", () => {
    h.map = {
      tags: [
        ["30382:rank", HERE, "wss://nip85.example"],
        ["30392", HERE, "wss://nip85.example"],
      ],
    };
    show();
    expect(screen.getByTestId("this-site-card")).toBeInTheDocument();
    expect(screen.queryByTestId("your-assistants-summary")).toBeNull();
    expect(screen.queryByTestId("also-working-for-you")).toBeNull();
    expect(screen.queryByTestId("your-assistants-change")).toBeNull();
  });

  it("is just the card before this site's Assistant is known — its onboarding carries the page", () => {
    h.taPubkey = null;
    show();
    expect(screen.getByTestId("this-site-card")).toBeInTheDocument();
    expect(screen.queryByTestId("your-assistants-summary")).toBeNull();
  });

  it("once another Assistant holds a Duty: where the Duties live, the card, then the others", () => {
    show();
    const summary = screen.getByTestId("your-assistants-summary");
    const card = screen.getByTestId("this-site-card");
    const also = screen.getByTestId("also-working-for-you");
    expect(summary).toHaveTextContent(
      "Scores come from brainstorm.nosfabrica.com. Lists and Concepts come from this site.",
    );
    expect(summary.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(also) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(also).toHaveTextContent("Also working for you");
    const cards = within(also).getAllByTestId(/^assistant-card-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([`assistant-card-${PROD.slice(0, 8)}`]);
    expect(cards[0]).toHaveTextContent("Pip's Brainstorm Assistant");
    expect(cards[0]).toHaveTextContent("brainstorm.nosfabrica.com");
    expect(within(cards[0]).getByText("Scores")).toBeInTheDocument();
  });

  /**
   * Only an Assistant's own site holds its key, so another site's Assistant is
   * changed there: its card links to that site's Assistants page — but only to
   * a site its NIP-05 proves; an unverified Assistant has nowhere proven to go.
   */
  it("links each verified other-site Assistant to its own site, and an unverified one nowhere", () => {
    const EXT = "c".repeat(64);
    h.map = {
      tags: [
        ["30382:rank", PROD, "wss://scores.example"],
        ["30392", EXT, "wss://lists.example"],
      ],
    };
    show();
    const prod = screen.getByTestId(`assistant-card-${PROD.slice(0, 8)}`);
    const open = within(prod).getByTestId("assistant-open-site");
    expect(open).toHaveTextContent("Open on brainstorm.nosfabrica.com");
    expect(open).toHaveAttribute("href", "https://brainstorm.nosfabrica.com/settings?tab=assistants&view=yours");
    expect(open).toHaveAttribute("target", "_blank");

    const ext = screen.getByTestId(`assistant-card-${EXT.slice(0, 8)}`);
    expect(ext).toHaveTextContent("Unverified");
    expect(within(ext).queryByTestId("assistant-open-site")).toBeNull();
  });

  it("points to the Treasure Map editor for changing who does what", () => {
    show();
    expect(screen.getByTestId("your-assistants-change")).toHaveAttribute("href", "/settings?tab=assistants&view=map");
  });
});
