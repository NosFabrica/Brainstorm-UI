// @vitest-environment jsdom
/**
 * A kind-10040 on /e — a NIP-85 designation. Every one on the search relay
 * is a Brainstorm activation, and the page showed an empty white box
 * (Benjamin, 2026-09-23). The card says what the person designated, whose
 * signals they are, where they are served from — and, since the reader may
 * not have done this yet, where to.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";

const specsMock = vi.fn(() => Promise.resolve([] as { id: string; kind: number; pubkey: string; tags: string[][]; content: string; created_at: number }[]));
vi.mock("@/services/search", () => ({ fetchSpecsForKind: (kind: number) => specsMock(kind) }));
// What the designated provider is doing on its relay — answered per test.
const footprintMock = vi.fn<(provider: string, relay: string) => Promise<{ people: number; capped: boolean; updatedAt: number } | null>>(() => Promise.resolve(null));
vi.mock("@/services/assertionFootprint", () => ({ fetchAssertionFootprint: (p: string, r: string) => footprintMock(p, r), FOOTPRINT_CAP: 200 }));

import { DesignationHero } from "./DesignationHero";

const TA = "a".repeat(64);
const event = (tags: string[][]) => ({ id: "1".repeat(64), kind: 10040, pubkey: "c".repeat(64), tags, content: "", created_at: 1_758_500_000 });

describe("DesignationHero", () => {
  it("names the signals, the lists, and where they come from — and offers the reader theirs", async () => {
    render(<DesignationHero event={event([
      ["30382:rank", TA, "wss://scores.brainstorm.world"],
      ["30382:followers", TA, "wss://scores.brainstorm.world"],
      ["30392", TA, "wss://scores.brainstorm.world"],
    ])} />);

    const hero = screen.getByTestId("designation-hero");
    expect(hero).toHaveTextContent("Trust designation");
    expect(hero).toHaveTextContent("Activated Brainstorm trust signals");
    expect(screen.getByTestId("designation-signals")).toHaveTextContent("Rank");
    expect(screen.getByTestId("designation-signals")).toHaveTextContent("Followers");
    expect(screen.getByTestId("designation-signals")).toHaveTextContent("Trusted Lists");
    expect(hero).toHaveTextContent("scores.brainstorm.world");
    expect(screen.getByTestId("designation-activate").getAttribute("href")).toBe("/activate");
  });

  // Four specs on the relay cover kind 10040 and the page linked whichever
  // came back first — a fork, "Trusted Assertions (Sovereign Version)"
  // (Benjamin, 2026-09-23: "is this the right spec?"). The right ones are
  // pinned by author: NIP-85 by Vitor Pamplona for the signals, and
  // Brainstorm's own Trusted Lists by David when lists are designated.
  it("links NIP-85 for the signals, and Trusted Lists when lists are designated", () => {
    const VITOR = "460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c";
    const DAVID = "e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f";
    const { unmount } = render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"]])} />);
    const spec = screen.getByTestId("designation-spec");
    expect(spec).toHaveTextContent("Trusted Assertions (NIP-85)");
    expect(spec.getAttribute("href")).toBe(`/e/${nip19.naddrEncode({ kind: 30817, pubkey: VITOR, identifier: "trusted-assertions" })}`);
    expect(screen.queryByTestId("designation-lists-spec")).toBeNull();
    expect(specsMock).not.toHaveBeenCalled();
    unmount();

    render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"], ["30392", TA, "wss://scores.brainstorm.world"]])} />);
    const lists = screen.getByTestId("designation-lists-spec");
    expect(lists).toHaveTextContent("Trusted Lists");
    expect(lists.getAttribute("href")).toBe(`/e/${nip19.naddrEncode({ kind: 30817, pubkey: DAVID, identifier: "trusted-lists" })}`);
  });

  // scores.brainstorm.world is a wss:// relay — nothing to open there. What
  // links is the meaning: what Brainstorm trust signals are.
  it("links what the signals mean, and leaves the relay address as text", () => {
    render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"]])} />);
    const link = screen.getByTestId("designation-signals-link");
    expect(link).toHaveTextContent("Brainstorm trust signals");
    expect(link.getAttribute("href")).toBe("/how-search-works");
    expect(screen.getByTestId("designation-hero").querySelector('a[href*="scores.brainstorm.world"]')).toBeNull();
  });

  // The payoff of a designation is a provider that is live: the page reads
  // the provider's relay and says how many people it scores and how fresh.
  it("says what the provider is doing on its relay: how many people, how fresh", async () => {
    footprintMock.mockResolvedValueOnce({ people: 200, capped: true, updatedAt: Math.floor(Date.now() / 1000) - 7200 });
    render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"]])} />);
    const line = await screen.findByTestId("designation-footprint");
    expect(line).toHaveTextContent("Scoring 200+ people · updated 2h ago");
    expect(footprintMock).toHaveBeenCalledWith(TA, "wss://scores.brainstorm.world");
  });

  it("says nothing about the relay when it holds nothing for the provider", async () => {
    footprintMock.mockResolvedValueOnce(null);
    render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"]])} />);
    await screen.findByTestId("designation-spec");
    expect(screen.queryByTestId("designation-footprint")).toBeNull();
  });

  // The card's glyph was a generic shield that meant nothing (Benjamin,
  // 2026-09-23: "I don't want to represent Brainstorm where it isn't true").
  // The Brainstorm mark where every designated provider is ours; no glyph
  // otherwise.
  it("wears the Brainstorm mark only when every provider is ours", () => {
    const { unmount } = render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"]])} />);
    expect(screen.getByTestId("designation-mark")).toBeInTheDocument();
    unmount();
    render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"], ["30382:followers", "b".repeat(64), "wss://nip85.example.com"]])} />);
    expect(screen.queryByTestId("designation-mark")).toBeNull();
    expect(screen.getByTestId("designation-hero").querySelector("svg.lucide-shield-check")).toBeNull();
  });

  it("a designation of someone else's provider does not claim Brainstorm", () => {
    render(<DesignationHero event={event([["30382:rank", "b".repeat(64), "wss://nip85.example.com"]])} />);
    const hero = screen.getByTestId("designation-hero");
    expect(hero).toHaveTextContent("Trusts a provider for Rank");
    expect(hero).toHaveTextContent("nip85.example.com");
    expect(hero).not.toHaveTextContent("Brainstorm trust signals");
  });
});
