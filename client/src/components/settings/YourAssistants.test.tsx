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
const APP = "d".repeat(64);
const SITES: Record<string, string> = {
  [HERE]: "brainstorm-staging.nosfabrica.com",
  [PROD]: "brainstorm.nosfabrica.com",
  // Another app's Assistant, whose NIP-05 verifies on that app's site.
  [APP]: "scores.example",
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
  useVerifiedHosts: () => (pk: string) => SITES[pk] ?? null,
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

  // The Assistants page is ours: another app's site has no such path, so its
  // Assistant links to the front page of the site its NIP-05 proves.
  it("links another app's Assistant to its site's front page, not to a Brainstorm page", () => {
    h.map = { tags: [["30382:rank", APP, "wss://scores.example"]] };
    show();
    const open = within(screen.getByTestId(`assistant-card-${APP.slice(0, 8)}`)).getByTestId("assistant-open-site");
    expect(open).toHaveTextContent("Open scores.example");
    expect(open).toHaveAttribute("href", "https://scores.example/");
  });

  // Read as the Duties view reads the Map: a group split between this site
  // and another names both, and this site's Assistant isn't left out of it.
  it("names both Assistants of a split group", () => {
    h.map = {
      tags: [
        ["30382:rank", PROD, "wss://scores.example"],
        ["30382:followers", PROD, "wss://scores.example"],
        ["30382:hops", HERE, "wss://nip85.example"],
      ],
    };
    show();
    expect(screen.getByTestId("your-assistants-summary")).toHaveTextContent(
      "Scores come from this site and brainstorm.nosfabrica.com. Nobody has Lists and Concepts yet.",
    );
  });

  // However many Assistants the Map names, each card shows its own site.
  it("shows every Assistant the Map names, each with the site it verifies on", () => {
    const keys = ["2", "3", "4", "5", "6"].map((c) => c.repeat(64));
    keys.forEach((key, i) => (SITES[key] = `site${i + 1}.example`));
    h.map = {
      tags: keys.map((key, i) => [`30382:${["rank", "followers", "hops", "muters", "reporters"][i]}`, key, ""]),
    };
    show();
    const cards = within(screen.getByTestId("also-working-for-you")).getAllByTestId(/^assistant-card-/);
    expect(cards).toHaveLength(5);
    cards.forEach((card, i) => expect(card).toHaveTextContent(`site${i + 1}.example`));
  });

  it("points to the Treasure Map editor for changing who does what", () => {
    show();
    expect(screen.getByTestId("your-assistants-change")).toHaveAttribute("href", "/settings?tab=assistants&view=map");
  });
});
