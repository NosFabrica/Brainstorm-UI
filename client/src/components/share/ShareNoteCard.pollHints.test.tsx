// @vitest-environment jsdom
/**
 * A poll on its own page asks for its answers where it was found, too: the
 * page's relay hints reach the full poll card.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/components/share/PollCard", () => ({
  PollCard: ({ compact, relayHints }: { compact?: boolean; relayHints?: string[] }) => (
    <div data-testid="poll-card" data-compact={String(!!compact)}>
      {(relayHints ?? []).join(" ")}
    </div>
  ),
}));

import { ShareNoteCard } from "./ShareNoteCard";

const poll: MinimalEvent = {
  id: "p".repeat(64),
  pubkey: "a".repeat(64),
  kind: 1068,
  created_at: 1_760_000_000,
  content: "Best relay?",
  tags: [["option", "x1", "damus"]],
};

describe("ShareNoteCard — a poll's relay hints", () => {
  it("reach the full poll card on the poll's page", () => {
    renderWithProviders(
      <ShareNoteCard
        event={poll}
        profiles={new Map()}
        eventsById={new Map()}
        reading
        forceExpanded
        relayHints={["wss://found.example.com"]}
      />,
    );
    expect(screen.getByTestId("poll-card")).toHaveAttribute("data-compact", "false");
    expect(screen.getByTestId("poll-card")).toHaveTextContent("wss://found.example.com");
  });
});
