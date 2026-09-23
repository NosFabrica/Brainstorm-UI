import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { ShareNoteCard } from "./ShareNoteCard";
import type { MinimalEvent } from "@/lib/noteRefs";

// The page is not what's under test; the card is a player either way.
vi.mock("@/lib/fountain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fountain")>()),
  useFountainItem: () => ({ loading: false, item: null }),
}));
const unfurlMock = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: unfurlMock }));

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

  // Like Wavlake and YouTube, a Fountain link plays where it sits in the text.
  // It used to get an inline chip and a second player card below the note.
  it("renders a Fountain link once, inline, not as chip plus card", () => {
    const fountain: MinimalEvent = { ...base, id: "f".repeat(64), kind: 1, content: "listen https://fountain.fm/episode/abc123" };
    renderWithProviders(card(fountain));
    expect(screen.queryAllByTestId("link-chip")).toHaveLength(0);
    expect(unfurlMock).not.toHaveBeenCalled();
  });
});
