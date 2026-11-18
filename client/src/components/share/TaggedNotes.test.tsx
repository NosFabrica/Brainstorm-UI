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

import { TaggedNotes } from "./TaggedNotes";

beforeEach(() => {
  h.tagged = [];
  h.store.clear();
});

describe("TaggedNotes", () => {
  it("shows a thing tagged by its coordinate, as search shows it, counted as an item", () => {
    h.tagged = [{ address: ADDRESS, applications: 1, disputes: 0, asserters: [], addedAt: 1, relays: [] }];
    h.store.set("tag-item-events", [item]);
    render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="fake-repo-owner" />);
    expect(screen.getByTestId("tag-notes")).toHaveTextContent("1 item");
    expect(screen.getAllByTestId("tag-item-row").map((r) => r.textContent)).toEqual(["bog-us"]);
    expect(screen.queryByTestId("tag-notes-unreachable")).toBeNull();
  });

  it("says it couldn't load them only when nothing tagged could be read", () => {
    h.tagged = [{ address: ADDRESS, applications: 1, disputes: 0, asserters: [], addedAt: 1, relays: [] }];
    render(<TaggedNotes authorPubkey={"a".repeat(64)} slug="fake-repo-owner" />);
    expect(screen.getByTestId("tag-notes-unreachable")).toHaveTextContent("1 item");
  });
});
