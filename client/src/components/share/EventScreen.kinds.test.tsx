// @vitest-environment jsdom
/**
 * Every content and media kind on its own page (EventScreen, and the article
 * reader it hands long-form to): each gets the hero its kind has and says what
 * its spec's fields say — never the structural card that shows a kind's raw
 * tags and JSON. One spec-shaped fixture per kind (test/contentKindFixtures).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";
import { CONTENT_KIND_FIXTURES, OTHER } from "@/test/contentKindFixtures";
import { npubFromPubkey } from "@/lib/shareId";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
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
vi.mock("@/components/share/ThreadAncestors", () => ({ ThreadAncestors: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import { EventScreen } from "./EventScreen";
import { ShareNoteCard } from "./ShareNoteCard";

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
const fixture = (name: string) => CONTENT_KIND_FIXTURES.find((f) => f.name.startsWith(name))!.event;

afterEach(() => window.history.replaceState(null, "", "/"));

// 30024's page is the draft reader's business (a separate change); a profile's is the person's page.
const PAGES = CONTENT_KIND_FIXTURES.filter((f) => f.event.kind !== 0 && f.event.kind !== 30024);

describe("every content kind's own page", () => {
  it.each(PAGES.map((f) => [f.name, f] as const))("%s", (name, { event, shows }) => {
    stubVisibleIntersectionObserver();
    open(event);
    expect(screen.queryByTestId("structural-hero")).toBeNull();
    expect(document.body.textContent).not.toContain('"id":');
    expect(document.body).toHaveTextContent(/^(1222|1244) /.test(name) ? "Voice" : shows);
  });
});

describe("the pages a fix put right", () => {
  it("a profile event's page is the person's page, never its JSON", () => {
    open(fixture("0 "));
    expect(window.location.pathname).toBe(`/p/${npubFromPubkey(fixture("0 ").pubkey)}`);
    expect(screen.queryByTestId("structural-hero")).toBeNull();
  });

  it("a NIP-94 file is named by its caption, its summary under it, its alt for the picture", () => {
    stubVisibleIntersectionObserver();
    open(fixture("1063 "));
    expect(screen.getByTestId("file-hero-name")).toHaveTextContent("The north ridge trail map");
    expect(screen.getByTestId("file-hero-summary")).toHaveTextContent("Trail map of the north ridge");
    expect(document.querySelector("img[alt='A hand-drawn trail map']")).not.toBeNull();
  });

  it("a generic repost that names its post by address shows that post, else says what kind it was (NIP-18)", () => {
    const coord = `30023:${OTHER}:guide`;
    const repost: MinimalEvent = {
      ...fixture("16 "),
      content: "",
      tags: [
        ["a", coord],
        ["k", "30023"],
        ["p", OTHER],
      ],
    };
    const article: MinimalEvent = {
      ...fixture("30023 "),
      pubkey: OTHER,
      tags: [
        ["d", "guide"],
        ["title", "The reposted guide"],
      ],
    };
    const card = (addrByCoord: Map<string, MinimalEvent>) => (
      <ShareNoteCard event={repost} profiles={new Map()} eventsById={new Map()} addrByCoord={addrByCoord} />
    );
    const view = render(card(new Map([[coord, article]])));
    expect(view.container).toHaveTextContent("The reposted guide");
    view.rerender(card(new Map()));
    expect(screen.getByTestId("note-repost-missing")).toHaveTextContent("Reposted an article");
  });
});

describe("a live event, a space or a meeting that names a host (NIP-53)", () => {
  const SIGNER = "5".repeat(64);
  const HOSTED = "6".repeat(64);
  const live = (p: string[], kind = 30311): MinimalEvent => ({
    id: kind.toString(16).padStart(64, "7"),
    kind,
    pubkey: SIGNER,
    created_at: 1_790_000_000,
    content: "",
    tags: [["d", "show"], kind === 30312 ? ["room", "The room"] : ["title", "The show"], ["status", "ended"], p],
  });
  const signerLink = () => document.querySelector(`a[href="/p/${npubFromPubkey(SIGNER)}"]`);

  it("survives a host that is not a key (it threw while naming the author)", () => {
    stubVisibleIntersectionObserver();
    expect(() => open(live(["p", "not-a-key", "", "Host"]))).not.toThrow();
    expect(screen.getByTestId("live-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("live-host")).toBeNull();
  });

  it("is its signer's page; the host it names is a line, unconfirmed without their proof", () => {
    stubVisibleIntersectionObserver();
    for (const kind of [30311, 30312]) {
      const { unmount } = open(live(["p", HOSTED, "", "Host"], kind));
      expect(signerLink()).not.toBeNull();
      expect(document.querySelector(`[data-testid="live-host"] a[href="/p/${npubFromPubkey(HOSTED)}"]`)).not.toBeNull();
      expect(screen.getByTestId("live-host-unconfirmed")).toBeInTheDocument();
      unmount();
    }
  });

  it("a stream's first `p`, with no role, is nobody's byline but the signer's", () => {
    stubVisibleIntersectionObserver();
    open(live(["p", HOSTED]));
    expect(signerLink()).not.toBeNull();
    expect(document.querySelector(`a[href="/p/${npubFromPubkey(HOSTED)}"]`)).toBeNull();
  });
});
