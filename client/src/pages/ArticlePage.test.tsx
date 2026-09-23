// @vitest-environment jsdom
/**
 * How the reader shows a spec. Benjamin (2026-09-23), reading NIP-21 on the
 * page: the title appeared twice, `` `draft` `optional` `` showed as raw
 * backticks, and the example URIs ran off the side of the screen. The reader
 * shows the title once, the status as chips, the kinds a spec covers, and
 * inline code that wraps and wears no decorative backticks.
 *
 * The page had no test until now; the mocks are its whole world.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { nip19 } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";

const AUTHOR = "9".repeat(64);
const served = vi.fn((): Record<string, unknown> | null => null);

vi.mock("@/services/nostr", () => ({
  fetchAddressableEvents: async (ptrs: { kind: number; pubkey: string; identifier: string }[]) => {
    const map = new Map<string, unknown>();
    const ev = served();
    if (ev) map.set(`${ptrs[0].kind}:${ptrs[0].pubkey}:${ptrs[0].identifier}`, ev);
    return map;
  },
  fetchProfile: async () => ({ name: "hzrd149" }),
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

const NIP21 = "# NIP-21\n\n## `nostr:` URI scheme\n\n`draft` `optional`\n\nThis NIP standardizes a URI scheme.\n\n- `nostr:npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9`";

const spec = (kind: number, tags: string[][], content = NIP21) => ({
  id: "2".repeat(64),
  kind,
  pubkey: AUTHOR,
  created_at: 1_727_798_308,
  content,
  sig: "s".repeat(128),
  tags: [["d", "nip-21"], ["title", "NIP-21"], ["summary", "Nostr - URI scheme"], ...tags],
});

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

const open = async (ev: ReturnType<typeof spec>) => {
  served.mockReturnValue(ev);
  window.history.pushState({}, "", `/a/${nip19.naddrEncode({ kind: ev.kind, pubkey: AUTHOR, identifier: "nip-21" })}`);
  renderPage();
  await waitFor(() => expect(screen.getByTestId("article-body")).toBeInTheDocument());
};

describe("reading a spec", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the title once, and the status as chips instead of raw backticks", async () => {
    await open(spec(30817, [["k", "1"]]));

    const body = screen.getByTestId("article-body");
    expect(body.querySelector("h1")).toBeNull(); // the page's own title is above the byline
    const status = screen.getByTestId("article-status");
    expect(status).toHaveTextContent("draft");
    expect(status).toHaveTextContent("optional");
    expect(body.textContent).not.toContain("`draft`");
    expect(body.textContent).not.toMatch(/`nostr:`/); // inline code without backtick decoration
  });

  it("names the kinds a spec covers", async () => {
    await open(spec(30817, [["k", "5905", "DVM Job Request"], ["k", "7000"]]));

    const kinds = screen.getByTestId("article-kinds");
    expect(within(kinds).getByText(/5905/)).toBeInTheDocument();
    expect(within(kinds).getByText(/7000/)).toBeInTheDocument();
  });

  it("a wiki mirror of a NIP gets the same treatment", async () => {
    await open(spec(30818, []));

    expect(screen.getByTestId("article-body").querySelector("h1")).toBeNull();
    expect(screen.getByTestId("article-status")).toHaveTextContent("draft");
    expect(screen.queryByTestId("article-kinds")).toBeNull();
  });

  it("lets long inline code wrap instead of pushing the page sideways", async () => {
    await open(spec(30817, []));

    const code = [...screen.getByTestId("article-body").querySelectorAll("code")].find((c) => /npub1/.test(c.textContent ?? ""));
    expect(code).toBeTruthy();
    expect(screen.getByTestId("article-body").className).toMatch(/prose-code:break-all|prose-code:\[overflow-wrap:anywhere\]/);
    expect(screen.getByTestId("article-body").className).toMatch(/prose-code:before:content-none/);
  });
});
