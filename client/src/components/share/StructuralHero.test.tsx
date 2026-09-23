// @vitest-environment jsdom
/**
 * An event of a kind the page has no card for (kind 30078 app data, a
 * relay list, whatever a typed `kind:` finds) opened as an empty white box.
 * The card names the kind, links the spec that defines it, shows the
 * author's own NIP-31 `alt` line, and lays the tags out readably — the raw
 * JSON behind a disclosure for whoever wants it.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const specsMock = vi.fn(() => Promise.resolve([] as { id: string; kind: number; pubkey: string; tags: string[][]; content: string; created_at: number }[]));
vi.mock("@/services/search", () => ({ fetchSpecsForKind: (kind: number) => specsMock(kind) }));

import { StructuralHero } from "./StructuralHero";

const event = (kind: number, tags: string[][], content = "") => ({ id: "1".repeat(64), kind, pubkey: "c".repeat(64), tags, content, created_at: 1_758_500_000 });

describe("StructuralHero", () => {
  it("names the kind, shows the alt line, and lays the tags out", () => {
    render(<StructuralHero event={event(30078, [["d", "nostrmail/settings"], ["alt", "Nostr Mail settings"], ["p", "b".repeat(64), "wss://relay.example"]])} />);

    const hero = screen.getByTestId("structural-hero");
    expect(hero).toHaveTextContent("Kind 30078");
    expect(screen.getByTestId("structural-alt")).toHaveTextContent("Nostr Mail settings");
    // The alt line is said once, above — not again as a row.
    const rows = screen.getAllByTestId("structural-tag");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("d");
    expect(rows[0]).toHaveTextContent("nostrmail/settings");
    expect(rows[1]).toHaveTextContent("wss://relay.example");
    expect(hero).not.toHaveTextContent("Post");
  });

  it("links the spec that defines the kind, when the relay has one", async () => {
    specsMock.mockResolvedValueOnce([{ id: "s".repeat(64), kind: 30817, pubkey: "b".repeat(64), tags: [["d", "app-data"], ["title", "Arbitrary public custom app data"]], content: "#", created_at: 1 }]);
    render(<StructuralHero event={event(30078, [["d", "x"]])} />);
    const link = await screen.findByTestId("structural-spec");
    expect(link).toHaveTextContent("Arbitrary public custom app data");
    expect(link.getAttribute("href")).toMatch(/^\/a\/naddr1/);
    expect(specsMock).toHaveBeenCalledWith(30078);
  });

  it("keeps the raw event behind a disclosure", () => {
    render(<StructuralHero event={event(10002, [["r", "wss://relay.damus.io"]])} />);
    expect(screen.queryByTestId("structural-raw")).toBeNull();
    fireEvent.click(screen.getByTestId("structural-raw-toggle"));
    expect(screen.getByTestId("structural-raw")).toHaveTextContent('"kind": 10002');
  });
});
