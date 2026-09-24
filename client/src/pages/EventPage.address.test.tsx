// @vitest-environment jsdom
/**
 * The article reader, two ways in.
 *
 * A recipe from zap.cooking gets an explicit "Open in Zap.cooking" beside the
 * ⋯ menu — the primary hand-off to where the recipe has its timings and
 * servings — while an ordinary article gets nothing new: Brainstorm is the
 * destination, and other clients stay behind the menu.
 *
 * A spec (Benjamin, 2026-09-23, reading NIP-21 on the page: the title appeared
 * twice, `` `draft` `optional` `` showed as raw backticks, and the example
 * URIs ran off the side of the screen) shows its title once, its status as
 * chips, the kinds it covers, and inline code that wraps without decoration.
 *
 * The page had no test until now; the mocks are its whole world: the relays,
 * the author's profile, the trust score, and the heavy siblings (thread,
 * header, more-from-author) that would otherwise reach the network.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { nip19 } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";

const AUTHOR = "9".repeat(64);
const served = vi.fn((): Record<string, unknown> | null | Promise<Record<string, unknown> | null> => null);

vi.mock("@/services/nostr", () => ({
  fetchAddressableEvents: async (ptrs: { kind: number; pubkey: string; identifier: string }[]) => {
    const map = new Map<string, unknown>();
    const ev = await served();
    if (ev) map.set(`${ptrs[0].kind}:${ptrs[0].pubkey}:${ptrs[0].identifier}`, ev);
    return map;
  },
  fetchProfile: async () => ({ name: "hzrd149" }),
  // What the event layout (a non-article at an address) asks for; nothing here.
  fetchRecentByKinds: async () => [],
  fetchEventsByIds: async () => [],
  fetchProfileMap: async () => new Map(),
}));
vi.mock("@/services/api", () => ({ apiClient: { getHouseInfluence: async () => null } }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => <button type="button" data-testid="article-menu">⋯</button> }));

import EventPage, { AddressRedirect } from "./EventPage";

const NIP21 = "# NIP-21\n\n## `nostr:` URI scheme\n\n`draft` `optional`\n\nThis NIP standardizes a URI scheme.\n\n- `nostr:npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9`";

/** An addressable event as the relay would hand it back. */
const event = (kind: number, identifier: string, title: string, tags: string[][], content: string) => ({
  id: "2".repeat(64),
  kind,
  pubkey: AUTHOR,
  created_at: 1_727_798_308,
  content,
  sig: "s".repeat(128),
  tags: [["d", identifier], ["title", title], ...tags],
});
const article = (tags: string[][]) => event(30023, "girik", "Gırık", tags, "# Gırık\n\nHandmade dough, chicken and rice.");
const spec = (kind: number, tags: string[][]) => event(kind, "nip-21", "NIP-21", [["summary", "Nostr - URI scheme"], ...tags], NIP21);

/** The page's providers, with nobody signed in: the store the app mounts, an empty account manager, a query client. */
const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>() as any}>
          <EventPage />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

const open = async (ev: ReturnType<typeof event>) => {
  served.mockReturnValue(ev);
  const identifier = ev.tags.find((t) => t[0] === "d")![1];
  const naddr = nip19.naddrEncode({ kind: ev.kind, pubkey: AUTHOR, identifier });
  window.history.pushState({}, "", `/e/${naddr}`);
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

  // A kind number alone tells a reader nothing (Benjamin: "kind 37570 — how
  // can we enhance this?"). Each kind wears the name its author gave it and
  // opens the NIPs tab on the specs that cover it — the search relay holds
  // no events of most spec kinds (probed 2026-09-23), so "events of this
  // kind" landed on an empty page; the specs always answer, this one among
  // them. Kinds read in order, however the author tagged them.
  it("names the kinds a spec covers, in order, and each one opens the specs that cover it", async () => {
    await open(spec(30817, [["k", "7000"], ["k", "5905", "DVM Job Request"], ["k", "nip"]])); // "nip" is not a kind

    const kinds = screen.getByTestId("article-kinds");
    const job = within(kinds).getByTestId("article-kind-5905");
    expect(job).toHaveTextContent("5905");
    expect(job).toHaveTextContent("DVM Job Request");
    expect(job.getAttribute("href")).toBe("/?t=nips&q=kind%3A5905");
    expect(within(kinds).getByTestId("article-kind-7000")).toHaveTextContent("7000");
    expect([...kinds.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["5905DVM Job Request", "7000"]);
  });

  it("reads a spec's front matter as its details: id gone, status, kinds named, tags listed", async () => {
    const TSM = "Trust Service Machines (TSM)\n===\n\n`tsm`\n\n`draft`\n\n`kind` `37570` \"TSM Service Announcement\"\n\n`tag` `B` \"price in millisats\"\n\n---\n\nNostr needs a standard.";
    await open(event(30817, "tsm", "Trust Service Machines (TSM )", [["k", "37570"]], TSM));

    const body = screen.getByTestId("article-body");
    expect(body.querySelector("h1")).toBeNull();
    expect(body.textContent).not.toContain("tsm-trust");
    expect(body.textContent).not.toContain("kind");
    expect(body.textContent).toContain("Nostr needs a standard.");
    expect(screen.getByTestId("article-status")).toHaveTextContent("draft");
    expect(within(screen.getByTestId("article-kinds")).getByTestId("article-kind-37570")).toHaveTextContent("TSM Service Announcement");
    expect(screen.getByTestId("article-tags")).toHaveTextContent("B");
    expect(screen.getByTestId("article-tags")).toHaveTextContent("price in millisats");
  });

  it("a wiki mirror of a NIP gets the same treatment", async () => {
    await open(spec(30818, []));

    expect(screen.getByTestId("article-body").querySelector("h1")).toBeNull();
    expect(screen.getByTestId("article-status")).toHaveTextContent("draft");
    expect(screen.queryByTestId("article-kinds")).toBeNull();
  });

  it("lets long inline code wrap instead of pushing the page sideways", async () => {
    await open(spec(30817, []));

    const body = screen.getByTestId("article-body");
    const code = [...body.querySelectorAll("code")].find((c) => /npub1/.test(c.textContent ?? ""));
    expect(code).toBeTruthy();
    // The wrap and tint live in a stylesheet rule scoped to inline code only
    // (`.article-prose :where(code):not(:where(pre *))`), so a fenced block
    // never gets striped; the class hook and the backtick reset are the seam.
    expect(screen.getByTestId("article-body").className).toMatch(/\barticle-prose\b/);
    expect(screen.getByTestId("article-body").className).toMatch(/prose-code:before:content-none/);
  });
});

// The kind decides how an event reads, not the route that found it, and the
// content decides its format (real shapes from kind-30023 events on relays:
// ~4% of long-form separates paragraphs with single line breaks, ~1% is HTML).
describe("the kind and the content decide, not the route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a plain-text article keeps its single-line-break paragraphs", async () => {
    await open(event(30023, "plain", "Plain", [], [1, 2, 3].map((n) => `Paragraph ${n} runs on the way an article's paragraphs do, past a hundred characters, with no blank line after it.`).join("\n")));
    const body = screen.getByTestId("article-body");
    expect(body.querySelectorAll(".note-reading > div")).toHaveLength(3);
  });

  it("a plain-text article still plays its YouTube link in place", async () => {
    await open(event(30023, "yt", "Plain", [], "Watch this first, it explains the whole thing better than I can.\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\nThen come back and read the rest of the post."));
    expect(screen.getByTestId("article-body").querySelector('[data-testid="video-embed"]')).not.toBeNull();
  });

  it("an HTML article reads as text instead of disappearing", async () => {
    await open(event(30023, "html", "HTML", [], "<div style='text-align: justify;'>\n<p>Sudoroso, no sabía si dar cuenta.</p><p>Second <b>part</b>.</p></div>"));
    const body = screen.getByTestId("article-body");
    expect(body).toHaveTextContent("Sudoroso, no sabía si dar cuenta.");
    expect(body.querySelector("strong")).toHaveTextContent("part");
    expect(body.textContent).not.toContain("<p>");
  });

  it("an address that is not an article renders on its kind's layout", async () => {
    served.mockReturnValue(event(30402, "vpn", "Obscura VPN", [["image", "https://img/vpn.png"]], "A VPN that cannot log you."));
    const naddr = nip19.naddrEncode({ kind: 30402, pubkey: AUTHOR, identifier: "vpn" });
    window.history.pushState({}, "", `/e/${naddr}`);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("listing-hero-title")).toHaveTextContent("Obscura VPN"));
    expect(screen.queryByTestId("article-body")).toBeNull();
  });
});

describe("audit of #97 (articles)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an HTML article's decoded <div> and 2*3*4 stay as written", async () => {
    await open(event(30023, "html2", "HTML", [], "<h2>Intro</h2><h2>Usage</h2><p>Wrap it in &lt;div&gt; tags, 2*3*4.</p>"));
    expect(screen.getByTestId("article-body")).toHaveTextContent("Wrap it in <div> tags, 2*3*4.");
  });
});

describe("one route for every event: the id decides", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an naddr on /e/ reads the address's latest version", async () => {
    const naddr = await open(article([["t", "bitcoin"]]));
    expect(window.location.pathname).toBe(`/e/${naddr}`);
    expect(screen.getByTestId("article-body")).toHaveTextContent("Handmade dough");
  });

  it("an old /a/ link lands on /e/, query and fragment kept", async () => {
    served.mockReturnValue(article([]));
    const naddr = nip19.naddrEncode({ kind: 30023, pubkey: AUTHOR, identifier: "girik" });
    window.history.pushState({}, "", `/a/${naddr}?ref=x#part`);
    render(<AddressRedirect />);
    await waitFor(() => expect(window.location.pathname).toBe(`/e/${naddr}`));
    expect(window.location.search).toBe("?ref=x");
    expect(window.location.hash).toBe("#part");
  });

  it("a profile's id on /e/ goes to /p/", async () => {
    const npub = nip19.npubEncode(AUTHOR);
    window.history.pushState({}, "", `/e/${npub}`);
    renderPage();
    await waitFor(() => expect(window.location.pathname).toBe(`/p/${npub}`));
  });

  it("an naddr that isn't on the relays says so, by kind", async () => {
    served.mockReturnValue(null);
    window.history.pushState({}, "", `/e/${nip19.naddrEncode({ kind: 30402, pubkey: AUTHOR, identifier: "gone" })}`);
    renderPage();
    expect(await screen.findByText("We couldn’t find this post on the relays.")).toBeInTheDocument();
  });
});

// Brainstorm spun for a second or two on an article it already held (Vitor,
// 2026-09-24): the page waited on every relay before showing anything. A held
// copy shows at once; the relays are still asked, and a newer version takes
// its place when it lands.
describe("a copy the device already holds", () => {
  const realVerify = eventStore.verifyEvent;
  beforeAll(() => { eventStore.verifyEvent = undefined; });
  afterAll(() => { eventStore.verifyEvent = realVerify; });
  beforeEach(() => vi.clearAllMocks());

  const version = (id: string, created_at: number, content: string) =>
    ({ ...event(30023, "held", "Held", [], content), id: id.repeat(64), created_at });

  it("shows at once, and gives way to a newer version when one arrives", async () => {
    eventStore.add(version("a", 1_700_000_000, "The version on the device.") as any);
    served.mockReturnValue(new Promise(() => {})); // the relays never finish
    window.history.pushState({}, "", `/e/${nip19.naddrEncode({ kind: 30023, pubkey: AUTHOR, identifier: "held" })}`);
    renderPage();

    expect(await screen.findByTestId("article-body")).toHaveTextContent("The version on the device.");

    act(() => { eventStore.add(version("b", 1_700_000_100, "The author's edit, just in.") as any); });
    await waitFor(() => expect(screen.getByTestId("article-body")).toHaveTextContent("The author's edit, just in."));
  });

  it("does not fall back to an older version the relays hand back", async () => {
    eventStore.add(version("c", 1_800_000_000, "Newest, already here.") as any);
    served.mockReturnValue(version("d", 1_600_000_000, "An old copy from a stale relay."));
    window.history.pushState({}, "", `/e/${nip19.naddrEncode({ kind: 30023, pubkey: AUTHOR, identifier: "held" })}`);
    renderPage();

    expect(await screen.findByTestId("article-body")).toHaveTextContent("Newest, already here.");
    await waitFor(() => expect(served).toHaveBeenCalled());
    expect(screen.getByTestId("article-body")).toHaveTextContent("Newest, already here.");
  });
});
