// @vitest-environment jsdom
/**
 * A quoted kind-38000 or other thing is read once per event (lib/thing's
 * `describeThing` walks every tag and parses its content), not once by the
 * shape, again by the inline check, again by the body and again by the card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
const describeSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/thing", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/thing")>();
  return {
    ...real,
    describeThing: (...args: Parameters<typeof real.describeThing>) => {
      describeSpy.calls++;
      return real.describeThing(...args);
    },
  };
});

import { EmbeddedNoteCard } from "./EmbeddedNoteCard";

const ev = (kind: number, tags: string[][], content = ""): MinimalEvent => ({
  id: "1".repeat(64),
  kind,
  pubkey: "4".repeat(64),
  created_at: 1_790_000_000,
  tags,
  content,
});

beforeEach(() => {
  describeSpy.calls = 0;
});

describe("EmbeddedNoteCard — a quoted thing is read once", () => {
  it("a community drawn as its thing card", () => {
    renderWithProviders(
      <EmbeddedNoteCard
        event={ev(34550, [
          ["d", "club"],
          ["name", "Club"],
        ])}
        author={{ name: "M" }}
      />,
    );
    expect(describeSpy.calls).toBe(1);
  });

  it("a mint review drawn as its card", () => {
    renderWithProviders(
      <EmbeddedNoteCard
        event={ev(
          38000,
          [
            ["d", "mint"],
            ["k", "38172"],
            ["u", "https://mint.example"],
          ],
          "Fast",
        )}
        author={{ name: "M" }}
      />,
    );
    expect(describeSpy.calls).toBe(1);
  });
});
