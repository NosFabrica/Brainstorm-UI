// @vitest-environment jsdom
/** Event and article Share pill and Copy link hand out the event's short link. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import type { ReactNode } from "react";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { CopyItem } from "@/components/share/EntityMenu";

const createShortUrl = vi.fn();
const shares: { mint?: () => Promise<string> }[] = [];
const menus: { copies: CopyItem[] }[] = [];

const fetched: MinimalEvent[] = [];
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async () => fetched,
}));
vi.mock("@/services/api", () => ({
  apiClient: {
    getHouseInfluence: async () => null,
    getTrustSignals: async () => new Map(),
    createShortUrl: (...a: unknown[]) => createShortUrl(...a),
  },
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/components/PublicPageHeader", () => ({
  PublicPageHeader: ({ actions }: { actions?: ReactNode }) => <header>{actions}</header>,
}));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/ThreadAncestors", () => ({ ThreadAncestors: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({
  ShareButton: (p: { mint?: () => Promise<string> }) => {
    shares.push(p);
    return null;
  },
}));
vi.mock("@/components/share/EntityMenu", () => ({
  EntityMenu: (p: { copies: CopyItem[] }) => {
    menus.push(p);
    return null;
  },
}));

import { EventScreen } from "./EventScreen";

const ID = "1".repeat(64);
const PK = "9".repeat(64);
const event = (kind: number, tags: string[][] = []): MinimalEvent => ({
  id: ID,
  kind,
  pubkey: PK,
  created_at: 1_779_000_000,
  content: "hello",
  tags,
});

const open = (props: Parameters<typeof EventScreen>[0]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <EventScreen {...props} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

/** What the page's Share pill and its Copy link ask the shortener for. */
async function mintedBy() {
  const mint = shares.at(-1)?.mint;
  const copyLink = menus.at(-1)?.copies[0];
  expect(copyLink?.id).toBe("link");
  createShortUrl.mockResolvedValue({ shortCode: "AB3XK9QZ" });
  await expect(mint!()).resolves.toMatch(/\/s\/AB3XK9QZ$/);
  await expect(copyLink!.mint!()).resolves.toMatch(/\/s\/AB3XK9QZ$/);
  expect(createShortUrl).toHaveBeenCalledTimes(1);
  return createShortUrl.mock.calls[0][0];
}

beforeEach(() => {
  createShortUrl.mockReset();
  shares.length = 0;
  menus.length = 0;
  fetched.length = 0;
});

describe("sharing an event by short link", () => {
  it("mints a note by its id, with the hints its link carried", async () => {
    fetched.push(event(1));
    open({ ptr: { id: ID, relays: ["wss://relay.example"] } });

    await waitFor(() => expect(menus.length).toBeGreaterThan(0));
    expect(await mintedBy()).toEqual({ kind: "event", key: ID, relays: ["wss://relay.example/"] });
  });

  it("mints an event reached by address by its coordinate", async () => {
    open({ event: event(30402, [["d", "chair"]]), ptr: { id: ID } });

    expect(await mintedBy()).toEqual({ kind: "address", key: `30402:${PK}:chair`, relays: [] });
  });

  it("mints an article by its coordinate", async () => {
    open({
      event: event(30023, [
        ["d", "zaps"],
        ["title", "Zaps"],
      ]),
      ptr: { id: ID },
    });

    expect(await mintedBy()).toEqual({ kind: "address", key: `30023:${PK}:zaps`, relays: [] });
  });
});
