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
    expect(hero).toHaveTextContent("App data");
    expect(hero).toHaveTextContent("kind 30078");
    expect(screen.getByTestId("structural-alt")).toHaveTextContent("Nostr Mail settings");
    // The alt line is said once, above — not again as a row.
    const rows = screen.getAllByTestId("structural-tag");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("d");
    expect(rows[0]).toHaveTextContent("nostrmail/settings");
    expect(rows[1]).toHaveTextContent("wss://relay.example");
    // A row with fewer values spans the width — "metadata" never wraps mid-word
    // because another row had three cells.
    expect(rows[0].querySelectorAll("td")[0].getAttribute("colspan")).toBe("2");
    expect(hero).not.toHaveTextContent("Post");
  });

  it("links the specs that cover the kind, when the relay has any", async () => {
    specsMock.mockResolvedValueOnce([
      { id: "s".repeat(64), kind: 30817, pubkey: "b".repeat(64), tags: [["d", "app-data"], ["title", "Arbitrary public custom app data"]], content: "#", created_at: 1 },
      { id: "t".repeat(64), kind: 30817, pubkey: "c".repeat(64), tags: [["d", "noornote"], ["title", "NoorNote"]], content: "#", created_at: 1 },
      { id: "u".repeat(64), kind: 30817, pubkey: "d".repeat(64), tags: [["d", "x"], ["title", "X"]], content: "#", created_at: 1 },
    ]);
    render(<StructuralHero event={event(30078, [["d", "x"]])} />);
    const link = await screen.findByTestId("structural-spec");
    expect(link).toHaveTextContent("Arbitrary public custom app data, NoorNote +1");
    expect(link.getAttribute("href")).toBe("/?t=nips&q=kind%3A30078");
    expect(specsMock).toHaveBeenCalledWith(30078);
  });

  // The content of app data is ciphertext or JSON: the page says which, and
  // prints JSON readably — the raw event stays behind the disclosure.
  it("says encrypted content is encrypted, and prints structured content readably", () => {
    const blob = "AgkXT1NChTXAHiDpLZZwu5PO5rAVpAxTeRwbCyrcWYDpXson5eEnf/JjsvZqC+V/P5uTF4sbspmfOlVeCi8aJb/oceACXS4VBRcA6s3FxVx0AUbFFqpQGtWjw7a4fu51pNS";
    const { unmount } = render(<StructuralHero event={event(30078, [["d", "ditto"]], blob)} />);
    expect(screen.getByTestId("structural-content-shape")).toHaveTextContent("Encrypted — only its owner can read it");
    expect(screen.getByTestId("structural-hero").textContent).not.toContain("AgkXT1NCh");
    unmount();

    render(<StructuralHero event={event(30078, [["d", "armada"]], '{"theme":"dark","lang":"en"}')} />);
    expect(screen.getByTestId("structural-content-shape")).toHaveTextContent("Structured data · 2 fields");
    expect(screen.getByTestId("structural-json")).toHaveTextContent('"theme": "dark"');
  });

  it("keeps the raw event behind a disclosure", () => {
    render(<StructuralHero event={event(10002, [["r", "wss://relay.damus.io"]])} />);
    expect(screen.queryByTestId("structural-raw")).toBeNull();
    fireEvent.click(screen.getByTestId("structural-raw-toggle"));
    expect(screen.getByTestId("structural-raw")).toHaveTextContent('"kind": 10002');
  });
});
