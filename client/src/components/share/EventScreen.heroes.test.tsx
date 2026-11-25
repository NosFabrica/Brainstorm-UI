// @vitest-environment jsdom
/**
 * What the page asks and draws around the hero follows the hero it picks
 * (heroFor): the "Open in" origin client only under the generic fallback; the
 * refs of a note's words only for a page that draws them (not a follow set's
 * thousands of `p`s); the thread above only where the hero does not already
 * draw what the event is about.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";

const asked = vi.hoisted(() => ({ ids: [] as string[][], profiles: [] as string[][] }));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[]) => {
    asked.ids.push(ids);
    return [];
  },
}));
vi.mock("@/hooks/useLiveProfile", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useLiveProfile")>();
  return {
    ...real,
    useLiveProfiles: (pks: string[]) => {
      if (pks.length) asked.profiles.push(pks);
      return new Map();
    },
  };
});
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/ThreadAncestors", () => ({
  ThreadAncestors: () => <div data-testid="thread-ancestors" />,
}));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
const menus = vi.hoisted(() => [] as { entity: { origin?: string } }[]);
vi.mock("@/components/share/EntityMenu", () => ({
  EntityMenu: (p: { entity: { origin?: string } }) => {
    menus.push(p);
    return null;
  },
}));

import { EventScreen } from "./EventScreen";

const PK = "4".repeat(64);
let n = 0;
const ev = (kind: number, tags: string[][], content = ""): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey: PK,
  created_at: 1_790_000_000,
  tags,
  content,
});
const open = (event: MinimalEvent) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <EventScreen event={event} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );
const key = (i: number) => i.toString(16).padStart(64, "a");

beforeEach(() => {
  stubVisibleIntersectionObserver();
  asked.ids.length = 0;
  asked.profiles.length = 0;
  menus.length = 0;
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("the origin client is offered exactly when the page draws the event generically", () => {
  it("a listing kind that reads as no listing is drawn generically, so its client is offered", () => {
    open(
      ev(
        30402,
        [
          ["d", "x"],
          ["client", "Shopstr"],
        ],
        "not a listing",
      ),
    );
    expect(screen.queryByTestId("listing-hero")).toBeNull();
    expect(menus.at(-1)?.entity.origin).toBe("Shopstr");
  });

  it("a note has its own card, and no origin", () => {
    open(ev(1, [["client", "Damus"]], "gm"));
    expect(menus.at(-1)?.entity.origin).toBeUndefined();
  });
});

describe("the refs a page asks for", () => {
  it("a list of people asks for its members only as its roster shows them, and for none of its notes", () => {
    const members = Array.from({ length: 50 }, (_, i) => ["p", key(i)]);
    for (const kind of [30000, 39089, 30392, 10040]) {
      open(ev(kind, [["d", "people"], ...members, ["e", key(999)]])).unmount();
    }
    // Only the hero's own roster asks, a fold at a time: never the whole list at once.
    expect(asked.profiles.flat()).not.toContain(key(49));
    expect(Math.max(...asked.profiles.map((a) => a.length))).toBeLessThanOrEqual(25);
    expect(asked.ids).toEqual([]);
  });

  it("a note still asks for the people and notes it names", () => {
    open(
      ev(
        1,
        [
          ["p", key(1)],
          ["q", key(2)],
        ],
        "hey",
      ),
    );
    expect(asked.profiles.flat()).toContain(key(1));
    expect(asked.ids.flat()).toContain(key(2));
  });
});

describe("the thread above the page", () => {
  it("is not drawn above a git status or a legacy git reply: its hero draws the item", () => {
    for (const kind of [1630, 1631, 1632, 1633, 1622]) {
      const { unmount } = open(ev(kind, [["e", key(7), "", "root"]]));
      expect(screen.queryByTestId("thread-ancestors")).toBeNull();
      unmount();
    }
  });

  it("is drawn above a reply", () => {
    open(ev(1, [["e", key(7), "", "root"]], "yes"));
    expect(screen.getByTestId("thread-ancestors")).toBeInTheDocument();
  });
});
