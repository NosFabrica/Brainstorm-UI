// @vitest-environment jsdom
/**
 * Inline prose rendering shared by release notes and reviews. Born from a
 * live review — "This user created www.relayop.xyz" — whose link wasn't one:
 * people write domains without https://, and they should still be clickable.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/services/nostr", () => ({ fetchProfileMap: vi.fn(() => Promise.resolve(new Map())) }));
vi.mock("@/lib/eventStore", () => ({ eventStore: { getReplaceable: () => undefined, getEvent: () => undefined, add: (e: unknown) => e } }));

import { NotesInline } from "./NotesInline";

describe("NotesInline", () => {
  it("links a bare www. domain as https, keeping the words around it", () => {
    render(<NotesInline text="This user created www.relayop.xyz - a solution for the next phase." />);
    const chip = screen.getByTestId("link-chip");
    expect(chip.getAttribute("href")).toBe("https://www.relayop.xyz");
    expect(chip).toHaveTextContent("relayop.xyz");
    expect(screen.getByText(/a solution for the next phase/)).toBeInTheDocument();
  });

  it("links a scheme-less domain with a common ending, but not a plain word with a dot", () => {
    render(<NotesInline text="see relayop.xyz/docs and e.g. this" />);
    const chip = screen.getByTestId("link-chip");
    expect(chip.getAttribute("href")).toBe("https://relayop.xyz/docs");
    expect(screen.queryAllByTestId("link-chip")).toHaveLength(1);
  });

  it("still renders full URLs as chips", () => {
    render(<NotesInline text="read https://example.org/post now" />);
    expect(screen.getByTestId("link-chip").getAttribute("href")).toBe("https://example.org/post");
  });
});
