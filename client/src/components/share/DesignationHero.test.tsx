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

const specsMock = vi.fn(() => Promise.resolve([] as { id: string; kind: number; pubkey: string; tags: string[][]; content: string; created_at: number }[]));
vi.mock("@/services/search", () => ({ fetchSpecsForKind: (kind: number) => specsMock(kind) }));

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

  it("links the spec that defines the kind, when the relay has it", async () => {
    specsMock.mockResolvedValueOnce([{ id: "s".repeat(64), kind: 30817, pubkey: "b".repeat(64), tags: [["d", "trusted-assertions"], ["title", "Trusted Assertions"]], content: "#", created_at: 1 }]);
    render(<DesignationHero event={event([["30382:rank", TA, "wss://scores.brainstorm.world"]])} />);

    const link = await screen.findByTestId("designation-spec");
    expect(link).toHaveTextContent("Trusted Assertions");
    expect(link.getAttribute("href")).toMatch(/^\/a\/naddr1/);
    expect(specsMock).toHaveBeenCalledWith(10040);
  });

  it("a designation of someone else's provider does not claim Brainstorm", () => {
    render(<DesignationHero event={event([["30382:rank", "b".repeat(64), "wss://nip85.example.com"]])} />);
    const hero = screen.getByTestId("designation-hero");
    expect(hero).toHaveTextContent("Trusts a provider for Rank");
    expect(hero).toHaveTextContent("nip85.example.com");
    expect(hero).not.toHaveTextContent("Brainstorm trust signals");
  });
});
