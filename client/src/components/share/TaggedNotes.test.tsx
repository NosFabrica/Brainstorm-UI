// @vitest-environment jsdom
/**
 * A tag page's posts and things: a note tagged by id, and an addressable thing — a Dictionary
 * list item, tagged by its coordinate — drawn as search's All draws it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ITEM = { kind: 39999, pubkey: "b".repeat(64), d: "bog-us" };
const ADDRESS = `${ITEM.kind}:${ITEM.pubkey}:${ITEM.d}`;
const item = {
  id: "1".repeat(64),
  kind: ITEM.kind,
  pubkey: ITEM.pubkey,
  created_at: 10,
  tags: [["d", ITEM.d]],
  content: "",
  sig: "",
};

const h = vi.hoisted(() => ({
  tagged: [] as unknown[],
  store: new Map<string, unknown[]>(),
}));
vi.mock("@/hooks/useTags", () => ({ useTagNotes: () => ({ data: h.tagged, isLoading: false }) }));
// What the store and the relays hold, by the ask's key: tag-item-events for things, tag-note-events for notes.
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null) => ({
    events: key ? (h.store.get(key.split(":")[0]) ?? []) : [],
    loading: false,
  }),
}));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));
vi.mock("@/components/search/AllResults", () => ({
  AllResults: ({ hits }: { hits: { event: { tags: string[][] } }[] }) => (
    <ul>
      {hits.map((h) => (
        <li key={h.event.tags[0][1]} data-testid="tag-item-row">
          {h.event.tags[0][1]}
        </li>
      ))}
    </ul>
  ),
}));

vi.mock("@/components/share/EmbeddedNoteCard", () => ({
  EmbeddedNoteCard: ({ event }: { event: { content: string } }) => (
    <div data-testid="tag-note-card">{event.content}</div>
  ),
}));
// A Dictionary list's mark beside its heading (hooks/useItemView): none here.
vi.mock("@/hooks/useItemView", () => ({
  useItemView: () => ({ pending: false, resolved: null, shown: null, links: [], usedFields: new Set() }),
  isReady: () => false,
}));

import { TaggedNotes } from "./TaggedNotes";

beforeEach(() => {
  h.tagged = [];
  h.store.clear();
});

describe("TaggedNotes", () => {
  // The page said "1 post and item" over a post, a repo and a book alike (2026-11-20). It is
  // sectioned as Your tags is: each kind of content under the search filter it is found under.
  describe("by what was tagged", () => {
    const AUTHOR = "c".repeat(64);
    const NOTE = "2".repeat(64);
    const ISSUE = "3".repeat(64);
    const REPO = `30617:${AUTHOR}:amethyst`;
    const BOOK = `39999:${AUTHOR}:dune`;
    const LIST = `39998:${AUTHOR}:books`;
    const event = (id: string, kind: number, tags: string[][], content = "") => ({
      id,
      kind,
      pubkey: AUTHOR,
      created_at: 10,
      tags,
      content,
      sig: "",
    });
    const tagging = (target: { id?: string; address?: string }) => ({
      ...target,
      applications: 1,
      disputes: 0,
      asserters: [],
      addedAt: 1,
      relays: [],
    });
    const names = () =>
      screen
        .getAllByTestId("tag-notes-type")
        .map((s) => s.querySelector("[data-testid=tag-notes-type-name]")!.textContent);

    beforeEach(() => {
      h.tagged = [
        tagging({ id: NOTE }),
        tagging({ address: REPO }),
        tagging({ id: ISSUE }),
        tagging({ address: BOOK }),
      ];
      h.store.set("tag-note-events", [
        event(NOTE, 1, [], "Swing dancing tonight"),
        event(ISSUE, 1621, [["subject", "Crash on startup"]]),
      ]);
      h.store.set("tag-item-events", [
        event("4".repeat(64), 30617, [
          ["d", "amethyst"],
          ["name", "Amethyst"],
        ]),
        event("5".repeat(64), 39999, [
          ["d", "dune"],
          ["z", LIST],
        ]),
      ]);
      h.store.set("tagged-items", [
        event("6".repeat(64), 39998, [
          ["d", "books"],
          ["names", "Book", "Books"],
        ]),
      ]);
    });

    it("heads each kind of content with the name its search filter has, in the order they were vouched", () => {
      render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="mixed" />);
      expect(names()).toEqual(["Posts", "Repos", "Issues", "Books"]);
      expect(screen.getByTestId("tag-notes")).not.toHaveTextContent(/post and item/i);
    });

    it("counts each section's own things", () => {
      h.tagged = [...h.tagged, tagging({ id: "7".repeat(64) })];
      h.store.set("tag-note-events", [...h.store.get("tag-note-events")!, event("7".repeat(64), 1, [], "Second post")]);
      render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="mixed" />);
      const [posts, repos] = screen.getAllByTestId("tag-notes-type");
      expect(posts.querySelector("[data-testid=tag-notes-type-count]")).toHaveTextContent("2");
      expect(repos.querySelector("[data-testid=tag-notes-type-count]")).toHaveTextContent("1");
    });

    it("draws a post as a post, and anything else as search draws it: an issue is not a note", () => {
      render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="mixed" />);
      const [posts, , issues] = screen.getAllByTestId("tag-notes-type");
      expect(posts.querySelectorAll("[data-testid=tag-note-card]")).toHaveLength(1);
      expect(posts).toHaveTextContent("Swing dancing tonight");
      expect(issues.querySelectorAll("[data-testid=tag-note-card]")).toHaveLength(0);
      expect(issues.querySelectorAll("[data-testid=tag-item-row]")).toHaveLength(1);
    });
  });

  it("shows a thing tagged by its coordinate, as search shows it, counted as an item", () => {
    h.tagged = [{ address: ADDRESS, applications: 1, disputes: 0, asserters: [], addedAt: 1, relays: [] }];
    h.store.set("tag-item-events", [item]);
    render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="fake-repo-owner" />);
    // A list's item whose list couldn't be read is an item, never a post.
    expect(screen.getByTestId("tag-notes-type-name")).toHaveTextContent("Other items");
    expect(screen.getByTestId("tag-notes-type-count")).toHaveTextContent("1");
    expect(screen.getAllByTestId("tag-item-row").map((r) => r.textContent)).toEqual(["bog-us"]);
    expect(screen.queryByTestId("tag-notes-unreachable")).toBeNull();
  });

  // A post only the viewer tagged, from an account the trust filter doesn't count yet
  // (services/tags fetchTagNotes): it is on their list and nobody else's, and the page says so,
  // or a tag that works for them looks, to them, like one everybody sees.
  it("says a post only you tagged is shown to you alone, while your tags aren't counted", () => {
    h.tagged = [
      { address: ADDRESS, applications: 0, disputes: 0, asserters: [], myStance: "apply", addedAt: 1, relays: [] },
    ];
    h.store.set("tag-item-events", [item]);
    render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="fake-repo-owner" />);
    expect(screen.getByTestId("tag-notes-only-you")).toHaveTextContent("Only you can see this here for now");
  });

  it("says nothing of the kind about a post other people's tags already count for", () => {
    h.tagged = [
      { address: ADDRESS, applications: 2, disputes: 0, asserters: [], myStance: "apply", addedAt: 1, relays: [] },
    ];
    h.store.set("tag-item-events", [item]);
    render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="fake-repo-owner" />);
    expect(screen.queryByTestId("tag-notes-only-you")).toBeNull();
  });

  it("says it couldn't load them only when nothing tagged could be read", () => {
    h.tagged = [{ address: ADDRESS, applications: 1, disputes: 0, asserters: [], addedAt: 1, relays: [] }];
    render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="fake-repo-owner" />);
    expect(screen.getByTestId("tag-notes-unreachable")).toHaveTextContent("Tagged with this");
    expect(screen.getByTestId("tag-notes-unreachable")).toHaveTextContent("We couldn't load it right now.");
  });
});
