// @vitest-environment jsdom
/**
 * Every "thing" kind as the search grid draws it (SearchResults' tab grid): a
 * kind lib/thing reads is its ThingCard, whichever tab it is on; a listing is
 * its ListingCard (a NIP-99 draft too), a stream its LiveTile, a Zap Store app
 * its AppCard, a git item its RepoCard, and a list its ListCard — each with its
 * title and spec'd facts. The grid's routing is by these same families.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { THING_KIND_FIXTURES } from "@/test/thingKindFixtures";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useBtcRates", () => ({ useBtcRates: () => null }));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
  fetchAddressableEvents: vi.fn(() => Promise.resolve(new Map())),
  fetchEventsByIds: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchRepoCounts: async () => ({ issues: 0, patches: 0, contributors: [], lastAt: null }),
}));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: {
    ...(await import("@/test/fakeEventStore")).eventStoreDefaults,
    getReplaceable: () => undefined,
    getEvent: () => undefined,
    add: (e: NostrEvent) => e,
  },
}));

import { ThingCard } from "./thingCards";
import { AppCard, ListCard, ListingCard, LiveTile, RepoCard } from "./cards";
import { describeThing } from "@/lib/thing";
import { embedShapeOf } from "@/lib/embedShape";
import { liveStateOf } from "@/lib/liveStream";

afterEach(cleanup);

function gridCard(event: NostrEvent) {
  const typed = { event, author: null, score: null };
  const thing = describeThing(event);
  if (thing) return <ThingCard {...typed} thing={thing} />;
  switch (embedShapeOf(event)) {
    case "listing":
      return <ListingCard {...typed} />;
    case "live":
      return <LiveTile {...typed} state={liveStateOf(event)} />;
    case "app":
      return <AppCard {...typed} />;
    case "repo":
      return <RepoCard {...typed} counts={false} />;
    case "item-list":
    case "people-list":
      return <ListCard {...typed} />;
    default:
      return null;
  }
}

describe.each(THING_KIND_FIXTURES)("$name", ({ event, shows }) => {
  it("is a grid card of its own with its title", () => {
    const card = gridCard(event as NostrEvent);
    expect(card).not.toBeNull();
    render(card!);
    const text = document.body.textContent ?? "";
    // A community card shows its moderators as faces, not as a count.
    const counted = event.kind === 34550 ? shows.filter((w) => !/moderator/.test(w)) : shows;
    for (const words of counted) expect(text).toContain(words);
    if (event.kind === 34550)
      expect(document.querySelector(`[data-testid="thing-moderators-${event.id}"]`)).not.toBeNull();
  });
});
