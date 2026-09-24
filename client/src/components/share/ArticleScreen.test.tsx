// @vitest-environment jsdom
/**
 * The article reader. Benjamin (2026-09-24), on an article that listed
 * notes by their `nostr:nevent…` strings and named a person by
 * `nostr:npub…`: it is showing a lot of raw data — the same references a
 * note renders as a person and a card must read that way in an article.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { nip19 } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";

const AUTHOR = "9".repeat(64);
const DEREK = "7".repeat(64);
const QUOTED = { id: "d".repeat(64), kind: 1, pubkey: DEREK, created_at: 1_779_000_000, sig: "", content: "Some days posting here feels like nobody's listening.", tags: [] };
const LINKED = { id: "a".repeat(64), kind: 30023, pubkey: DEREK, created_at: 1_779_000_000, sig: "", content: "Zaps, explained.", tags: [["d", "zaps"], ["title", "What a zap is"], ["summary", "The 21-sat handshake."]] };
const profiles = new Map([[DEREK, { name: "Derek Ross" }], [AUTHOR, { name: "hzrd149" }]]);

vi.mock("@/services/nostr", () => ({
  fetchProfile: async (pk: string) => profiles.get(pk) ?? null,
  fetchProfileMap: async (pks: string[]) => new Map(pks.flatMap((pk) => (profiles.has(pk) ? [[pk, profiles.get(pk)!]] : []))),
  fetchEventsByIds: async (ids: string[]) => (ids.includes(QUOTED.id) ? [QUOTED] : []),
  fetchAddressableEvents: async (refs: { kind: number; pubkey: string; identifier: string }[]) =>
    new Map(refs.filter((r) => r.identifier === "zaps").map((r) => [`${r.kind}:${r.pubkey}:${r.identifier}`, LINKED])),
}));
vi.mock("@/services/api", () => ({ apiClient: { getHouseInfluence: async () => null } }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import { ArticleScreen } from "./ArticleScreen";
import { __resetQuotedNotes } from "@/hooks/useQuotedNotes";
import { __resetLinkedArticles } from "@/hooks/useLinkedArticles";

const npub = nip19.npubEncode(DEREK);
const nevent = nip19.neventEncode({ id: QUOTED.id });
const naddr = nip19.naddrEncode({ kind: 30023, pubkey: DEREK, identifier: "zaps" });

const article = (content: string, tags: string[][] = [["d", "zap-week"], ["title", "Zap week"]]) => ({ id: "2".repeat(64), kind: 30023, pubkey: AUTHOR, created_at: 1_727_798_308, sig: "", content, tags });
const ptr = { kind: 30023, pubkey: AUTHOR, identifier: "zap-week" };

const open = (content: string, tags?: string[][]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>() as any}>
          <ArticleScreen ev={article(content, tags)} naddr={nip19.naddrEncode({ ...ptr })} ptr={ptr} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  __resetQuotedNotes();
  __resetLinkedArticles();
});

const expectRendered = async () => {
  const body = screen.getByTestId("article-body");
  await waitFor(() => expect(body).toHaveTextContent("Derek Ross"));
  await waitFor(() => expect(body).toHaveTextContent("Some days posting here feels like nobody's listening."));
  await waitFor(() => expect(body).toHaveTextContent("What a zap is"));
  expect(body).not.toHaveTextContent(/nostr:n/);
};

describe("the article reader — nostr references", () => {
  it("in a markdown article, an npub is the person, an nevent the quoted note, an naddr the article's card", async () => {
    open(`# Zap week\n\nThanks to nostr:${npub} for the push.\n\n## 1. Let's name it\n\nnostr:${nevent}\n\n## 2. Read this\n\nnostr:${naddr}\n\n- a list\n- to make it markdown`);
    await expectRendered();
  });

  it("in a plain-text article, the same", async () => {
    open(`Thanks to nostr:${npub} for the push.\n\nnostr:${nevent}\n\nnostr:${naddr}`);
    await expectRendered();
  });

  it("a link that wraps an nevent — Primal's, njump's — is the quoted note too", async () => {
    open(`# Zap week\n\nSee https://primal.net/e/${nevent} and https://njump.me/${npub}\n\n- a list\n- to make it markdown`);
    const body = screen.getByTestId("article-body");
    await waitFor(() => expect(body).toHaveTextContent("Some days posting here feels like nobody's listening."));
    await waitFor(() => expect(body).toHaveTextContent("Derek Ross"));
    expect(body).not.toHaveTextContent("primal.net");
  });
});

describe("the article reader — a stub whose summary is a link to a note", () => {
  // Geyser publishes an "article" for a shared Primal link: the title is the
  // host, the summary is the link, the body is empty. Read as written it was
  // "primal.net" over a raw URL over nothing (Benjamin, 2026-09-24).
  const stub = [["d", "primalnet-1"], ["title", "primal.net"], ["summary", `https://primal.net/e/${nevent}`]];

  it("shows the quoted note where the summary would be, not the URL", async () => {
    open("", stub);
    await waitFor(() => expect(screen.getByTestId("article-summary")).toHaveTextContent("Some days posting here feels like nobody's listening."));
    expect(screen.getByTestId("article-summary")).toHaveTextContent("Derek Ross");
    expect(screen.getByTestId("article-summary")).not.toHaveTextContent("https://");
  });

  it("when the body is that same link, the note appears once", async () => {
    open(`https://primal.net/e/${nevent}`, stub);
    await waitFor(() => expect(screen.getAllByTestId("embedded-note")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByTestId("embedded-note")).toHaveLength(1);
  });
});
