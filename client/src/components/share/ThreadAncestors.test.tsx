// @vitest-environment jsdom
/**
 * The conversation above a reply: a NIP-22 comment's parent may be an address
 * (an article — its latest version) or something off Nostr (a web page, a
 * book); a chat message's parent is its `q`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map(), useLiveProfile: () => ({}) }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: vi.fn(() => Promise.resolve(null)) }));

type Filter = { ids?: string[]; kinds?: number[]; authors?: string[]; "#d"?: string[] };
/** The store: what each filter matches among these events. */
let held: MinimalEvent[] = [];
const matches = (f: Filter, e: MinimalEvent) =>
  (!f.ids || f.ids.includes(e.id)) &&
  (!f.kinds || f.kinds.includes(e.kind)) &&
  (!f.authors || f.authors.includes(e.pubkey)) &&
  (!f["#d"] || e.tags.some((t) => t[0] === "d" && f["#d"]!.includes(t[1])));
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (_key: string | null, filters: Filter[] | null) => ({
    events: filters ? held.filter((e) => filters.some((f) => matches(f, e))) : [],
    loading: false,
    settled: true,
  }),
}));

import { ThreadAncestors } from "./ThreadAncestors";

const AUTHOR = "b".repeat(64);
const base = { pubkey: AUTHOR, created_at: 1_760_000_000, content: "" };

beforeEach(() => {
  held = [];
});

describe("ThreadAncestors", () => {
  it("a comment on a web page shows the page it is about", () => {
    const comment: MinimalEvent = {
      ...base,
      id: "c".repeat(64),
      kind: 1111,
      content: "Nice post",
      tags: [
        ["I", "https://example.com/post"],
        ["K", "web"],
        ["i", "https://example.com/post"],
        ["k", "web"],
      ],
    };
    renderWithProviders(<ThreadAncestors note={comment} relayHints={[]} />);
    expect(screen.getByTestId("thread-external")).toHaveTextContent("Web page");
    expect(screen.getByTestId("thread-external-link").getAttribute("href")).toBe("https://example.com/post");
    // Root and parent are the same page: drawn once.
    expect(screen.getAllByTestId("thread-external")).toHaveLength(1);
  });

  it("a comment on a book names it", () => {
    const comment: MinimalEvent = {
      ...base,
      id: "c".repeat(64),
      kind: 1111,
      tags: [
        ["I", "isbn:9780765382030"],
        ["K", "isbn"],
        ["i", "isbn:9780765382030"],
        ["k", "isbn"],
      ],
    };
    renderWithProviders(<ThreadAncestors note={comment} relayHints={[]} />);
    expect(screen.getByTestId("thread-external")).toHaveTextContent("Book");
    expect(screen.getByTestId("thread-external")).toHaveTextContent("9780765382030");
  });

  it("a reply under a comment on a page: the page above, then the comment", () => {
    const parent: MinimalEvent = { ...base, id: "d".repeat(64), kind: 1111, content: "First!", tags: [] };
    held = [parent];
    const reply: MinimalEvent = {
      ...base,
      id: "c".repeat(64),
      kind: 1111,
      tags: [
        ["I", "https://example.com/post"],
        ["K", "web"],
        ["e", parent.id, "", AUTHOR],
        ["k", "1111"],
      ],
    };
    renderWithProviders(<ThreadAncestors note={reply} relayHints={[]} />);
    expect(screen.getByTestId("thread-external")).toBeInTheDocument();
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("First!");
  });

  it("a comment's addressable parent is read by its address", () => {
    const video: MinimalEvent = {
      ...base,
      id: "v".repeat(64),
      kind: 34235,
      content: "My video's summary",
      tags: [["d", "vid-1"]],
    };
    held = [video];
    const comment: MinimalEvent = {
      ...base,
      id: "c".repeat(64),
      kind: 1111,
      tags: [
        ["A", `34235:${AUTHOR}:vid-1`],
        ["K", "34235"],
        ["a", `34235:${AUTHOR}:vid-1`],
        ["k", "34235"],
      ],
    };
    renderWithProviders(<ThreadAncestors note={comment} relayHints={[]} />);
    expect(screen.getAllByTestId("embedded-note")).toHaveLength(1);
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("My video's summary");
  });

  it("a chat message shows the message its `q` answers", () => {
    const parent: MinimalEvent = { ...base, id: "d".repeat(64), kind: 9, content: "gm everyone", tags: [] };
    held = [parent];
    const msg: MinimalEvent = { ...base, id: "c".repeat(64), kind: 9, content: "gm", tags: [["q", parent.id]] };
    renderWithProviders(<ThreadAncestors note={msg} relayHints={[]} />);
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("gm everyone");
  });

  it("a note that answers nothing shows nothing", () => {
    const note: MinimalEvent = { ...base, id: "c".repeat(64), kind: 1, content: "hi", tags: [] };
    renderWithProviders(<ThreadAncestors note={note} relayHints={[]} />);
    expect(screen.queryByTestId("thread-ancestors")).toBeNull();
  });
});
