// @vitest-environment jsdom
/**
 * The article reader's way out to the app that published the piece. A recipe
 * from zap.cooking gets an explicit "Open in Zap.cooking" beside the ⋯ menu —
 * the primary hand-off to where the recipe has its timings and servings —
 * while an ordinary article gets nothing new: Brainstorm is the destination,
 * and other clients stay behind the menu.
 *
 * The page had no test until now, so the mocks are the page's whole world:
 * the relays, the author's profile, the trust score, and the heavy siblings
 * (thread, header, more-from-author) that would otherwise reach the network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { nip19 } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";

const COOK = "9".repeat(64);
const recipeEvent = vi.fn((): Record<string, unknown> | null => null);

vi.mock("@/services/nostr", () => ({
  fetchAddressableEvents: async (ptrs: { kind: number; pubkey: string; identifier: string }[]) => {
    const map = new Map<string, unknown>();
    const ev = recipeEvent();
    if (ev) map.set(`${ptrs[0].kind}:${ptrs[0].pubkey}:${ptrs[0].identifier}`, ev);
    return map;
  },
  fetchProfile: async () => ({ name: "SkyLords" }),
}));
vi.mock("@/services/api", () => ({ apiClient: { getHouseInfluence: async () => null } }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => <button type="button" data-testid="article-menu">⋯</button> }));

import ArticlePage from "./ArticlePage";

const article = (tags: string[][]) => ({
  id: "2".repeat(64),
  kind: 30023,
  pubkey: COOK,
  created_at: 1_790_000_000,
  content: "# Gırık\n\nHandmade dough, chicken and rice.",
  sig: "s".repeat(128),
  tags: [["d", "girik"], ["title", "Gırık"], ...tags],
});

/** The page's providers, with nobody signed in: the store the app mounts, an empty account manager, a query client. */
const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>() as any}>
          <ArticlePage />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

const open = async (ev: ReturnType<typeof article>) => {
  recipeEvent.mockReturnValue(ev);
  const naddr = nip19.naddrEncode({ kind: 30023, pubkey: COOK, identifier: "girik" });
  window.history.pushState({}, "", `/a/${naddr}`);
  renderPage();
  await waitFor(() => expect(screen.getByTestId("article-body")).toBeInTheDocument());
  return naddr;
};

describe("the article reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers a recipe's own home — Open in Zap.cooking — beside the menu", async () => {
    const naddr = await open(article([["t", "zapcooking"], ["t", "zapcooking-girik"]]));

    const link = screen.getByTestId("article-source-app");
    expect(link).toHaveTextContent(/^Open in Zap\.cooking$/);
    expect(link.getAttribute("href")).toBe(`https://zap.cooking/recipe/${naddr}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByTestId("article-menu")).toBeInTheDocument();
  });

  it("offers an ordinary article nothing extra", async () => {
    await open(article([["t", "bitcoin"]]));

    expect(screen.queryByTestId("article-source-app")).toBeNull();
    expect(screen.getByTestId("article-menu")).toBeInTheDocument();
  });
});
