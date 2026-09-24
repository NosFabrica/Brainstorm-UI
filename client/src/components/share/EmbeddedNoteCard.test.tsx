/**
 * A quoted note that its author deleted by overwriting is a quiet stub in
 * the quote's place — the reader still learns what the note was about,
 * and nothing asks to be clicked.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MinimalEvent } from "@/lib/noteRefs";
import { EmbeddedNoteCard } from "./EmbeddedNoteCard";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));

const PK = "a".repeat(64);
const note = (content: string, tags: string[][] = []): MinimalEvent =>
  ({ id: "e".repeat(64), kind: 1, pubkey: PK, tags, content, created_at: 1_700_000_000 }) as MinimalEvent;

describe("EmbeddedNoteCard", () => {
  it("a quoted note deleted by overwriting is a quiet stub — named when we know who, generic when we don't", () => {
    const { rerender } = render(<EmbeddedNoteCard event={note("")} author={{ display_name: "Zap Cooking" }} href="/e/x" />);
    const stub = screen.getByTestId("embedded-deleted");
    expect(stub).toHaveTextContent("Zap Cooking deleted this post.");
    expect(screen.queryByTestId("embedded-note")).toBeNull();
    expect(stub.querySelector("a, button, img")).toBeNull();
    rerender(<EmbeddedNoteCard event={note("")} href="/e/x" />);
    expect(screen.getByTestId("embedded-deleted")).toHaveTextContent("This post was deleted by its author.");
  });

  it("a note with words is a note", () => {
    render(<EmbeddedNoteCard event={note("gm")} author={{ display_name: "Zap Cooking" }} />);
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("gm");
    expect(screen.queryByTestId("embedded-deleted")).toBeNull();
  });
});
