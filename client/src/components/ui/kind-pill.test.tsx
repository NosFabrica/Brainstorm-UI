// @vitest-environment jsdom
/**
 * The pill that says what a thing is — Spec, Article, Listing, App … — on
 * every content card, row and tile. The team (2026-09-24): a spec from Nostr
 * Hub has no NIP number, so the kind's word is what tells a reader what they
 * are looking at. One quiet slate chip, never for a person: the avatar
 * already says that.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KindPill } from "./kind-pill";

const ev = (kind: number, tags: string[][] = []) => ({ id: "1".repeat(64), kind, pubkey: "a".repeat(64), tags, content: "", created_at: 1 });

describe("KindPill", () => {
  it("says what a thing is, as the design-system chip", () => {
    render(<KindPill event={ev(30817)} />);
    const pill = screen.getByTestId("kind-pill");
    expect(pill).toHaveTextContent(/^Spec$/);
    expect(pill.className).toMatch(/rounded-full/);
  });

  it("takes a word of its own where the content's shape is the label — a news-shaped note", () => {
    render(<KindPill label="News" />);
    expect(screen.getByTestId("kind-pill")).toHaveTextContent(/^News$/);
  });

  it("never labels a person", () => {
    render(<KindPill event={ev(0)} />);
    expect(screen.queryByTestId("kind-pill")).toBeNull();
  });
});
