// @vitest-environment jsdom
/**
 * A tag's tab names each list among its rows by the list's header, read once. The other tags'
 * answers stream in (useResultTags) while a tag is pressed; each tick must not cancel the read
 * of the headers and send it again.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const OWNER = "a".repeat(64);
const HEADER = `39998:${OWNER}:books`;
const item = (id: string, z: string): NostrEvent =>
  ({ id, kind: 39999, pubkey: OWNER, created_at: 1, sig: "s", content: "", tags: [["z", z]] }) as NostrEvent;
const ROWS = [item("1".repeat(64), HEADER), { ...item("2".repeat(64), ""), kind: 1, tags: [] } as NostrEvent];

vi.mock("@/services/namedTags", () => ({
  fetchNamedTagRows: () => Promise.resolve(ROWS),
  namedTagCount: () => ROWS.length,
}));
let answerHeaders: (m: Map<string, NostrEvent>) => void = () => {};
const fetchHeaders = vi.fn(() => new Promise<Map<string, NostrEvent>>((r) => (answerHeaders = r)));
vi.mock("@/services/nostr", () => ({ fetchAddressableEvents: () => fetchHeaders() }));
// Every render a fresh byHit, as a streaming answer gives.
vi.mock("@/hooks/useResultTags", () => ({
  useResultTags: (hits: { event: NostrEvent }[]) => ({
    tags: [{ key: "other", name: "other" }],
    byHit: new Map(hits.map((h) => [h.event.id, new Set(["other"])])),
    settled: false,
  }),
}));
vi.mock("@/components/search/TagFacets", () => ({
  TagFacets: ({ onPress }: { onPress: (t: { key: string } | null) => void }) => (
    <button data-testid="press-other" onClick={() => onPress({ key: "other" })} />
  ),
}));
vi.mock("@/components/search/AllResults", () => ({ AllResults: () => null }));

import { TagTabResults } from "./TagTabResults";

describe("TagTabResults", () => {
  it("reads the lists' headers once, however often the other tags' answers tick", async () => {
    const tag = { key: "t", name: "reading" } as unknown as Parameters<typeof TagTabResults>[0]["tag"];
    const view = render(<TagTabResults tag={tag} scoreOf={() => null} query="" observer={{} as never} />);
    await screen.findByTestId("tag-tab-kind-books");
    fireEvent.click(screen.getByTestId("press-other"));
    view.rerender(<TagTabResults tag={tag} scoreOf={() => null} query="" observer={{} as never} />);
    await act(async () => {
      answerHeaders(
        new Map([[HEADER, { ...item("h".repeat(64), ""), kind: 39998, tags: [["names", "Book", "Books"]] }]]),
      );
    });
    expect(fetchHeaders).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("tag-tab-kind-books")).toHaveTextContent("Books");
  });
});
