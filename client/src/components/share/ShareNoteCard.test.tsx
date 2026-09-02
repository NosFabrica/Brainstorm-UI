import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrap = (event: MinimalEvent) => <QueryClientProvider client={client}>{card(event)}</QueryClientProvider>;
    const { rerender } = render(wrap(repost));
    expect(screen.getByTestId("note-repost")).toBeInTheDocument();

    expect(() => rerender(wrap(note))).not.toThrow();
    expect(screen.getByTestId("note-card")).toBeInTheDocument();

    expect(() => rerender(wrap(repost))).not.toThrow();
    expect(screen.getByTestId("note-repost")).toBeInTheDocument();
  });
});
