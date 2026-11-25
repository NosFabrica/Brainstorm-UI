// @vitest-environment jsdom
/**
 * Every "thing" kind as the Top page's row (SerpRow, and the ListCard it hands a
 * list of things to): its title and the facts its spec gives it — a price, a
 * goal, a stream's state, a count — and never "Structured data" for a kind whose
 * words are JSON. The page, the quote and the All row are walked with the same
 * fixtures in components/share/EventScreen.things.test.tsx and lib/thingSurfaces.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";
import { THING_KIND_FIXTURES, fixture } from "@/test/thingKindFixtures";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
  fetchEventsByIds: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: { ...(await import("@/test/fakeEventStore")).eventStoreDefaults, getReplaceable: () => undefined },
}));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
vi.mock("@/services/clientLinks", () => ({
  resolveClientLink: () => new Promise(() => {}),
  peekClientLink: () => undefined,
}));
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => () => {} }));

import { SerpRow } from "./SerpRow";

beforeEach(() => stubVisibleIntersectionObserver());
afterEach(cleanup);

const row = (event: NostrEvent) => render(<SerpRow event={event} author={null} score={null} query="" />);

describe.each(THING_KIND_FIXTURES)("$name", ({ event, shows }) => {
  it("is a Top row with its title and its spec'd facts, never structured data", () => {
    row(event as NostrEvent);
    expect(screen.queryByTestId("serp-content-shape")).toBeNull();
    const text = document.body.textContent ?? "";
    for (const words of shows) expect(text).toContain(words);
  });
});

describe("the Top row reads a listing and a stream as their other surfaces do", () => {
  it("a NIP-15 product's name and price, not its JSON", () => {
    const product = fixture(
      30018,
      [["d", "p"]],
      JSON.stringify({ name: "Beans", description: "Fresh", currency: "sat", price: 2100 }),
    );
    row(product as NostrEvent);
    expect(screen.getByText("Beans")).toBeInTheDocument();
    expect(screen.getByTestId(`serp-facts-${product.id}`)).toHaveTextContent("2,100 sats");
  });

  it("a stream's state is the Live tab's, not its stale tag", () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = fixture(
      30311,
      [
        ["d", "s"],
        ["title", "Old show"],
        ["status", "live"],
      ],
      "",
      now - 30 * 86_400,
    );
    row(stale as NostrEvent);
    expect(screen.getByTestId(`serp-facts-${stale.id}`)).toHaveTextContent("Ended");
  });

  it("a zap goal says its goal in sats, from NIP-75's millisats", () => {
    const goal = fixture(
      9041,
      [
        ["amount", "21000000"],
        ["relays", "wss://r.example"],
      ],
      "New mic",
    );
    row(goal as NostrEvent);
    expect(screen.getByTestId(`serp-facts-${goal.id}`)).toHaveTextContent("Goal 21,000 sats");
  });
});
