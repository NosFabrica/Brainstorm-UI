import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { ShareNoteCard } from "./ShareNoteCard";
import type { MinimalEvent } from "@/lib/noteRefs";

const PUBKEY = "a".repeat(64);
const base = { pubkey: PUBKEY, tags: [] as string[][], created_at: 1_700_000_000 };
const repost: MinimalEvent = { ...base, id: "r".repeat(64), kind: 6, content: "" };
const note: MinimalEvent = { ...base, id: "n".repeat(64), kind: 1, content: "hello" };

function card(event: MinimalEvent) {
  return <ShareNoteCard event={event} profiles={new Map()} eventsById={new Map()} />;
}

describe("ShareNoteCard", () => {
  // Rendered unkeyed on the featured slot and the /e page, so one instance can
  // flip between a repost and a note. The repost early return must not change
  // the hook count (React: "Rendered fewer hooks than expected").
  it("survives the same instance flipping between repost and note", () => {
    const { rerender } = renderWithProviders(card(repost));
    expect(screen.getByTestId("note-repost")).toBeInTheDocument();

    expect(() => rerender(card(note))).not.toThrow();
    expect(screen.getByTestId("note-card")).toBeInTheDocument();

    expect(() => rerender(card(repost))).not.toThrow();
    expect(screen.getByTestId("note-repost")).toBeInTheDocument();
  });
});
