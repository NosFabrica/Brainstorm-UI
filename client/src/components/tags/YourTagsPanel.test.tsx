/**
 * The note about disagreeing on `/tags/mine` is advice about tags that exist.
 * On a page with none (every new account) it was a paragraph about votes and
 * take-backs before there was anything to vote on, so it waits for a tag.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MyAssertion, ProfileTagsResult } from "@/services/tags";

const ME = "a".repeat(64);
const OTHER = "b".repeat(64);

const h = vi.hoisted(() => ({
  onMe: undefined as unknown,
  said: undefined as unknown,
  loading: false,
  items: new Map<string, unknown>(),
  lists: new Map<string, { singular: string; plural: string }>(),
  itemsLoading: false,
  profiles: new Map<string, { name?: string; picture?: string }>(),
  views: new Map<string, unknown>(),
}));
// How a Dictionary list's item reads (hooks/useItemView): what its own page and cards draw from.
vi.mock("@/hooks/useItemView", () => ({
  useItemView: (item: { id?: string }) =>
    h.views.get(item.id ?? "") ?? { pending: false, resolved: null, shown: null, links: [], usedFields: new Set() },
  isReady: (v: { resolved: unknown; shown: unknown }) => !!v.resolved && !!v.shown,
}));
// What was tagged, read from the relays (hooks/useTaggedItems): the events by the target a
// tagging names, and what a Dictionary list calls its items.
vi.mock("@/hooks/useTaggedItems", () => ({
  useTaggedItems: () => ({
    eventOf: (target: string) => h.items.get(target),
    listOf: (target: string) => h.lists.get(target) ?? null,
    loading: h.itemsLoading,
  }),
}));
vi.mock("@/hooks/useTags", () => ({
  useProfileTags: () => ({ data: h.onMe, isLoading: h.loading }),
  useMyAssertions: () => ({ data: h.said, isLoading: h.loading }),
  usePinnedTags: () => ({ data: [] }),
  useApplyTag: () => ({ mutate: vi.fn(), isPending: false }),
  useTogglePin: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => h.profiles }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { YourTagsPanel } from "./YourTagsPanel";

const nothingOnMe: ProfileTagsResult = { tags: [], mine: [], trustUnverified: false, viewerUnscored: false };
const oneSaid: MyAssertion = {
  key: `${OTHER}:coffee`,
  authorPubkey: OTHER,
  slug: "coffee",
  name: "Coffee",
  target: OTHER,
  targetKind: "pubkey",
  stance: "apply",
  at: 1_700_000_000,
};

describe("the note about disagreeing on Your tags", () => {
  beforeEach(() => {
    h.onMe = nothingOnMe;
    h.said = [];
    h.loading = false;
  });

  it("stays off a page with no tags on it", () => {
    render(<YourTagsPanel />);
    expect(screen.getByText("Nobody has tagged you yet")).toBeInTheDocument();
    expect(screen.queryByTestId("my-tags-no-delete")).toBeNull();
  });

  it("is there once the person has tagged someone", () => {
    h.said = [oneSaid];
    render(<YourTagsPanel />);
    expect(screen.getByTestId("my-tags-no-delete")).toHaveTextContent("See a tag that's wrong? Disagree with it.");
  });

  it("is there once someone has tagged them", () => {
    h.onMe = {
      ...nothingOnMe,
      tags: [
        {
          key: `${OTHER}:coffee`,
          authorPubkey: OTHER,
          slug: "coffee",
          name: "Coffee",
          applications: 1,
          disputes: 0,
          asserters: [OTHER],
          selfDeclared: false,
          subjectDisagreed: false,
          counted: true,
          sharesName: 0,
          addedAt: 1_700_000_000,
        },
      ],
    };
    render(<YourTagsPanel />);
    expect(screen.getByTestId("my-tags-no-delete")).toBeInTheDocument();
  });

  it("doesn't flash in while the tags are still loading", () => {
    h.onMe = undefined;
    h.said = undefined;
    h.loading = true;
    render(<YourTagsPanel />);
    expect(screen.queryByTestId("my-tags-no-delete")).toBeNull();
  });
});

/**
 * Your tags, by what was tagged (2026-11-20). People and content are two things: a tag on
 * a person says who they are, a tag on a post, an issue or a repo says what it is about.
 * They used to share one list, where a tagged video read "Dance · 1 person" and opened to
 * "a post". Now people have their section, and each kind of content in use has its own.
 */
describe("Your tags — people and content, each kind of content on its own", () => {
  const NOTE = "1".repeat(64);
  const ISSUE = "2".repeat(64);
  const ISSUE_2 = "3".repeat(64);
  const REPO = `30617:${OTHER}:amethyst`;
  const ACCOUNT = `39999:${OTHER}:octocat`;
  const event = (id: string, kind: number, tags: string[][] = [], content = "") => ({
    id,
    kind,
    pubkey: OTHER,
    created_at: 1,
    tags,
    content,
  });
  const on = (target: string, name: string, at: number, stance: "apply" | "dispute" = "apply"): MyAssertion => ({
    key: `${OTHER}:${name.toLowerCase()}`,
    authorPubkey: OTHER,
    slug: name.toLowerCase(),
    name,
    target,
    targetKind: target === OTHER ? "pubkey" : "event",
    stance,
    at,
  });

  beforeEach(() => {
    h.onMe = nothingOnMe;
    h.loading = false;
    h.itemsLoading = false;
    h.profiles = new Map();
    h.views = new Map();
    h.items = new Map<string, unknown>([
      [NOTE, event(NOTE, 1, [], "Swing dancing at the old hall tonight")],
      [ISSUE, event(ISSUE, 1621, [["subject", "Let users choose on-chain or lightning"]])],
      [ISSUE_2, event(ISSUE_2, 1621, [["subject", "Crash on startup"]])],
      [
        REPO,
        event("4".repeat(64), 30617, [
          ["d", "amethyst"],
          ["name", "Amethyst"],
        ]),
      ],
      [
        ACCOUNT,
        event("5".repeat(64), 39999, [
          ["d", "octocat"],
          ["name", "octocat"],
        ]),
      ],
    ]);
    h.lists = new Map([[ACCOUNT, { singular: "GitHub Account", plural: "GitHub Accounts" }]]);
    h.said = [
      on(OTHER, "Coffee", 50),
      on(NOTE, "Dance", 40),
      on(ISSUE, "Bug", 30),
      on(ISSUE_2, "Bug", 20),
      on(REPO, "Android", 10),
      on(ACCOUNT, "Maintainer", 5),
    ];
  });

  it("keeps the people you tagged apart from the content you tagged", () => {
    render(<YourTagsPanel />);
    const people = screen.getByTestId("my-tags-said-people");
    expect(people).toHaveTextContent("People you've tagged");
    expect(within(people).getAllByTestId("my-tag-said-group")).toHaveLength(1);
    expect(people).toHaveTextContent("Coffee");
    expect(people).not.toHaveTextContent("Dance");

    const content = screen.getByTestId("my-tags-said-content");
    expect(content).toHaveTextContent("Content you've tagged");
    expect(content).not.toHaveTextContent("Coffee");
  });

  it("gives each kind of content in use a section of its own, named as what it is", () => {
    render(<YourTagsPanel />);
    const sections = screen.getAllByTestId("my-tags-said-type");
    expect(sections.map((s) => within(s).getByTestId("my-tags-said-type-name").textContent)).toEqual([
      "Posts",
      "Issues",
      "Repos",
      // As the filter menu writes it.
      "GitHub accounts",
    ]);
    const issues = sections[1];
    expect(issues).toHaveTextContent("Bug");
    expect(issues).not.toHaveTextContent("Dance");
    expect(issues).not.toHaveTextContent("Android");
  });

  it("counts what was tagged in its own word, never people for a post", () => {
    render(<YourTagsPanel />);
    const [posts, issues, repos, accounts] = screen.getAllByTestId("my-tags-said-type");
    expect(within(posts).getByTestId("my-tag-said-group")).toHaveTextContent("1 post");
    expect(within(issues).getByTestId("my-tag-said-group")).toHaveTextContent("2 issues");
    expect(within(repos).getByTestId("my-tag-said-group")).toHaveTextContent("1 repo");
    expect(within(accounts).getByTestId("my-tag-said-group")).toHaveTextContent("1 GitHub account");
    expect(screen.getByTestId("my-tags-said-content")).not.toHaveTextContent(/person|people/);
    expect(within(screen.getByTestId("my-tags-said-people")).getByTestId("my-tag-said-group")).toHaveTextContent(
      "1 person",
    );
  });

  it('names each thing by its own title and links to it, not "a post"', () => {
    render(<YourTagsPanel />);
    const [posts, issues, repos] = screen.getAllByTestId("my-tags-said-type");
    fireEvent.click(within(issues).getByTestId("my-tag-said-group-toggle"));
    const rows = within(issues).getAllByTestId("my-tag-said-target");
    expect(rows.map((r) => r.textContent)).toEqual(["Let users choose on-chain or lightning", "Crash on startup"]);
    expect(rows[0].getAttribute("href")).toMatch(/^\/e\/nevent1/);

    fireEvent.click(within(repos).getByTestId("my-tag-said-group-toggle"));
    const repo = within(repos).getByTestId("my-tag-said-target");
    expect(repo).toHaveTextContent("Amethyst");
    // Linked as the rest of the app links a repo (lib/shareId eventPath).
    expect(repo.getAttribute("href")).toMatch(/^\/e\/nevent1/);

    fireEvent.click(within(posts).getByTestId("my-tag-said-group-toggle"));
    expect(within(posts).getByTestId("my-tag-said-target")).toHaveTextContent("Swing dancing at the old hall tonight");
    expect(screen.getByTestId("my-tags-said-content")).not.toHaveTextContent("a post");
  });

  it("shows no content block to someone who has only tagged people, and no people block the other way round", () => {
    h.said = [on(OTHER, "Coffee", 50)];
    const { unmount } = render(<YourTagsPanel />);
    expect(screen.getByTestId("my-tags-said-people")).toBeInTheDocument();
    expect(screen.queryByTestId("my-tags-said-content")).toBeNull();
    unmount();
    h.said = [on(NOTE, "Dance", 40)];
    render(<YourTagsPanel />);
    expect(screen.queryByTestId("my-tags-said-people")).toBeNull();
    expect(screen.getByTestId("my-tags-said-content")).toBeInTheDocument();
  });

  it("files a thing it couldn't read under what its address says it is, or as an item", () => {
    h.items = new Map();
    h.lists = new Map();
    h.said = [on(REPO, "Android", 10), on(NOTE, "Dance", 5)];
    render(<YourTagsPanel />);
    const names = screen
      .getAllByTestId("my-tags-said-type")
      .map((s) => within(s).getByTestId("my-tags-said-type-name").textContent);
    // A coordinate carries its kind; an id says nothing until the event is read.
    expect(names).toEqual(["Repos", "Other items"]);
    // Unread, it still has somewhere to open: its address.
    const [repos] = screen.getAllByTestId("my-tags-said-type");
    fireEvent.click(within(repos).getByTestId("my-tag-said-group-toggle"));
    const row = within(repos).getByTestId("my-tag-said-target");
    expect(row).toHaveTextContent("Untitled repo");
    expect(row.getAttribute("href")).toMatch(/^\/e\/naddr1/);
  });

  it("waits for what was tagged before it sorts content into sections", () => {
    h.itemsLoading = true;
    h.items = new Map();
    render(<YourTagsPanel />);
    expect(screen.getByTestId("my-tags-said-people")).toBeInTheDocument();
    expect(screen.queryAllByTestId("my-tags-said-type")).toHaveLength(0);
    expect(screen.getByTestId("my-tags-said-content-loading")).toBeInTheDocument();
  });

  // Sections are the search filters (2026-11-20): an app handler sat under "App handlers"
  // beside a filter called "Apps", which holds Zap Store apps and handlers alike.
  describe("filed the way the search filters file them", () => {
    const HANDLER = `31990:${OTHER}:garden`;
    const APP = `32267:${OTHER}:zapstore`;
    beforeEach(() => {
      h.items = new Map<string, unknown>([
        [
          HANDLER,
          event(
            "6".repeat(64),
            31990,
            [["d", "garden"]],
            '{"name": "Garden & Growth", "picture": "https://example.com/garden.png"}',
          ),
        ],
        [
          APP,
          event("7".repeat(64), 32267, [
            ["d", "zapstore"],
            ["name", "Zap Store"],
          ]),
        ],
        [NOTE, event(NOTE, 1, [], "Swing dancing at the old hall tonight")],
      ]);
      h.said = [on(HANDLER, "Outdoors", 10), on(APP, "Outdoors", 9), on(NOTE, "Dance", 5, "dispute")];
    });

    it("puts an app handler and an app in one Apps section, counted as apps", () => {
      render(<YourTagsPanel />);
      const sections = screen.getAllByTestId("my-tags-said-type");
      expect(sections.map((s) => within(s).getByTestId("my-tags-said-type-name").textContent)).toEqual([
        "Apps",
        "Posts",
      ]);
      expect(within(sections[0]).getByTestId("my-tag-said-group")).toHaveTextContent("2 apps");
    });

    it("says on each row what the thing is and whose it is", () => {
      h.profiles = new Map([[OTHER, { name: "Sam" }]]);
      render(<YourTagsPanel />);
      const [apps] = screen.getAllByTestId("my-tags-said-type");
      fireEvent.click(within(apps).getByTestId("my-tag-said-group-toggle"));
      const rows = within(apps).getAllByTestId("my-tag-said-row");
      expect(within(rows[0]).getByTestId("my-tag-said-target")).toHaveTextContent("Garden & Growth");
      expect(within(rows[0]).getByTestId("my-tag-said-about")).toHaveTextContent("App handler · Sam");
      expect(within(rows[1]).getByTestId("my-tag-said-about")).toHaveTextContent("App · Sam");
    });

    // An app published by an account of the same name read "Garden & Growth / App handler · Garden & Growth".
    it("doesn't say the name twice when the thing and whoever published it share one", () => {
      h.profiles = new Map([[OTHER, { name: "Garden & Growth" }]]);
      render(<YourTagsPanel />);
      const [apps] = screen.getAllByTestId("my-tags-said-type");
      fireEvent.click(within(apps).getByTestId("my-tag-said-group-toggle"));
      const rows = within(apps).getAllByTestId("my-tag-said-row");
      expect(within(rows[0]).getByTestId("my-tag-said-about").textContent).toBe("App handler");
      expect(within(rows[1]).getByTestId("my-tag-said-about").textContent).toBe("App · Garden & Growth");
    });

    it("shows the thing's own picture, and what kind of thing it is where it has none", () => {
      render(<YourTagsPanel />);
      const [apps] = screen.getAllByTestId("my-tags-said-type");
      fireEvent.click(within(apps).getByTestId("my-tag-said-group-toggle"));
      const rows = within(apps).getAllByTestId("my-tag-said-row");
      expect(within(rows[0]).getByTestId("my-tag-said-thumb").getAttribute("src")).toBe(
        "https://example.com/garden.png",
      );
      expect(within(rows[1]).queryByTestId("my-tag-said-thumb")).toBeNull();
      expect(within(rows[1]).getByTestId("my-tag-said-icon")).toBeInTheDocument();
    });

    it("marks a thing you disagreed on, once, on its row", () => {
      render(<YourTagsPanel />);
      const posts = screen.getAllByTestId("my-tags-said-type")[1];
      fireEvent.click(within(posts).getByTestId("my-tag-said-group-toggle"));
      const row = within(posts).getByTestId("my-tag-said-row");
      expect(within(row).getByTestId("my-tag-said-disagreed")).toHaveTextContent("Disagreed");
      const [apps] = screen.getAllByTestId("my-tags-said-type");
      fireEvent.click(within(apps).getByTestId("my-tag-said-group-toggle"));
      expect(within(apps).queryByTestId("my-tag-said-disagreed")).toBeNull();
    });
  });

  // A tagged Event Index event showed a blank box and "Event · Event Index" beside an article
  // with its cover (2026-11-20). Every row shows the most its thing has to show.
  describe("each thing shown with the most it has", () => {
    const SPRINT = `39999:${OTHER}:sprint`;
    const SPRINT_ID = "8".repeat(64);
    const MEETUP = `31923:${OTHER}:meetup`;
    const view = (shown: Record<string, unknown>) => ({
      pending: false,
      resolved: { governing: { singular: "Event", plural: "Events" } },
      shown: { title: null, summary: null, image: null, listImage: null, facts: [], ...shown },
      links: [],
      usedFields: new Set(),
    });
    const open = (section: HTMLElement) => fireEvent.click(within(section).getByTestId("my-tag-said-group-toggle"));

    beforeEach(() => {
      h.items = new Map<string, unknown>([
        [
          SPRINT,
          event(SPRINT_ID, 39999, [
            ["d", "sprint"],
            ["title", "AI Build Sprint"],
            ["when", "Mon 28 Sep to Fri 27 Nov 2026"],
          ]),
        ],
        [NOTE, event(NOTE, 1, [], "Swing dancing at the old hall tonight")],
      ]);
      h.lists = new Map([[SPRINT, { singular: "Event", plural: "Events" }]]);
      h.views = new Map([
        [
          SPRINT_ID,
          view({
            title: "AI Build Sprint",
            summary: "Mon 28 Sep to Fri 27 Nov 2026",
            listImage: "https://example.com/event-index.png",
          }),
        ],
      ]);
      h.said = [on(SPRINT, "AI Event", 10), on(NOTE, "Dance", 5)];
    });

    it("reads a list's item as its own page does: its list's mark and what its page says under the title", () => {
      h.profiles = new Map([[OTHER, { name: "Event Index" }]]);
      render(<YourTagsPanel />);
      const [events] = screen.getAllByTestId("my-tags-said-type");
      expect(within(events).getByTestId("my-tags-said-type-name")).toHaveTextContent("Events");
      open(events);
      const row = within(events).getByTestId("my-tag-said-row");
      expect(within(row).getByTestId("my-tag-said-target")).toHaveTextContent("AI Build Sprint");
      expect(within(row).getByTestId("my-tag-said-thumb").getAttribute("src")).toBe(
        "https://example.com/event-index.png",
      );
      // When it is, not who listed it: the importer's name says nothing about the event.
      expect(within(row).getByTestId("my-tag-said-about").textContent).toBe("Event · Mon 28 Sep to Fri 27 Nov 2026");
    });

    it("shows an item's own picture before its list's mark", () => {
      h.views = new Map([
        [
          SPRINT_ID,
          view({
            title: "AI Build Sprint",
            image: "https://example.com/sprint.jpg",
            listImage: "https://example.com/event-index.png",
          }),
        ],
      ]);
      render(<YourTagsPanel />);
      const [events] = screen.getAllByTestId("my-tags-said-type");
      open(events);
      expect(within(events).getByTestId("my-tag-said-thumb").getAttribute("src")).toBe(
        "https://example.com/sprint.jpg",
      );
    });

    it("says when a calendar event is, beside the list's events", () => {
      h.items.set(
        MEETUP,
        event("9".repeat(64), 31923, [
          ["d", "meetup"],
          ["title", "Nostr meetup"],
          ["start", "1797076800"],
          ["image", "https://example.com/meetup.jpg"],
        ]),
      );
      h.said = [on(MEETUP, "AI Event", 20), on(SPRINT, "AI Event", 10)];
      render(<YourTagsPanel />);
      // One Events section for both: the list's item and the calendar event.
      const sections = screen.getAllByTestId("my-tags-said-type");
      expect(sections).toHaveLength(1);
      expect(within(sections[0]).getByTestId("my-tag-said-group")).toHaveTextContent("2 events");
      open(sections[0]);
      const [meetup] = within(sections[0]).getAllByTestId("my-tag-said-row");
      expect(within(meetup).getByTestId("my-tag-said-about").textContent).toMatch(/^Event · .*2026/);
      expect(within(meetup).getByTestId("my-tag-said-thumb").getAttribute("src")).toBe(
        "https://example.com/meetup.jpg",
      );
    });

    it("shows who wrote a post that has no picture, in place of a blank mark", () => {
      h.profiles = new Map([[OTHER, { name: "Sam", picture: "https://example.com/sam.jpg" }]]);
      render(<YourTagsPanel />);
      const posts = screen.getAllByTestId("my-tags-said-type")[1];
      open(posts);
      const row = within(posts).getByTestId("my-tag-said-row");
      expect(within(row).getByTestId("my-tag-said-author-face")).toBeInTheDocument();
      expect(within(row).queryByTestId("my-tag-said-icon")).toBeNull();
    });

    // A people group leads with their faces; a content group led with nothing, so the two
    // lists did not line up and a closed group said nothing about what was in it.
    it("leads a closed group with pictures of what is in it, as a people group leads with faces", () => {
      h.items.set(
        MEETUP,
        event("9".repeat(64), 31923, [
          ["d", "meetup"],
          ["title", "Nostr meetup"],
          ["image", "https://example.com/meetup.jpg"],
        ]),
      );
      h.said = [on(MEETUP, "AI Event", 20), on(SPRINT, "AI Event", 10), on(OTHER, "Coffee", 5)];
      render(<YourTagsPanel />);
      const [events] = screen.getAllByTestId("my-tags-said-type");
      const pile = within(events).getByTestId("my-tag-said-group-thumbs");
      // Closed: nothing has been opened.
      expect(within(events).queryByTestId("my-tag-said-row")).toBeNull();
      expect([...pile.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual([
        "https://example.com/meetup.jpg",
        "https://example.com/event-index.png",
      ]);
      expect(within(screen.getByTestId("my-tags-said-people")).queryByTestId("my-tag-said-group-thumbs")).toBeNull();
    });

    it("leads with the section's mark when nothing in the group has a picture", () => {
      h.said = [on(NOTE, "Dance", 5)];
      render(<YourTagsPanel />);
      const pile = screen.getByTestId("my-tag-said-group-thumbs");
      expect(pile.querySelectorAll("img")).toHaveLength(0);
      expect(within(pile).getByTestId("my-tag-said-group-mark")).toBeInTheDocument();
    });

    it("marks a list's section with the list's own mark", () => {
      const BOOK = `39999:${OTHER}:dune`;
      const BOOK_ID = "c".repeat(64);
      h.items.set(BOOK, event(BOOK_ID, 39999, [["d", "dune"]]));
      h.lists.set(BOOK, { singular: "Book", plural: "Books" });
      h.views.set(BOOK_ID, view({ title: "Dune", listImage: "https://example.com/books.png" }));
      h.said = [on(BOOK, "Sci-fi", 30)];
      render(<YourTagsPanel />);
      const [books] = screen.getAllByTestId("my-tags-said-type");
      expect(within(books).getByTestId("my-tags-said-type-name")).toHaveTextContent("Books");
      expect(within(books).getByTestId("my-tags-said-type-mark").getAttribute("src")).toBe(
        "https://example.com/books.png",
      );
    });
  });

  it("filters people and content together by what you said", () => {
    h.said = [on(OTHER, "Coffee", 50), on(NOTE, "Dance", 40, "dispute")];
    render(<YourTagsPanel />);
    fireEvent.click(screen.getByTestId("filter-disagreed"));
    expect(screen.queryByTestId("my-tags-said-people")).toBeNull();
    expect(screen.getByTestId("my-tags-said-content")).toHaveTextContent("Dance");
  });
});
