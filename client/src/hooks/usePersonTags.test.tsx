// @vitest-environment jsdom
/**
 * The tags on a handful of people — the rows of a typeahead, the cards of a
 * People page — filling in as each answer lands. One ask per person per
 * session under the surface's perspective; only tags the network counts.
 * Plain state, no query client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ProfileTag } from "@/services/tags";

const profileTagsMock =
  vi.fn<
    (pubkeys: readonly string[], viewer?: string, observer?: string) => Promise<Map<string, { tags: ProfileTag[] }>>
  >();
vi.mock("@/services/tags", () => ({
  fetchProfileTagsBatch: (pks: readonly string[], viewer?: string, observer?: string) =>
    profileTagsMock(pks, viewer, observer),
}));

import { usePersonTags } from "./usePersonTags";
import { __resetPersonTags } from "@/services/personTags";

const pk = (c: string) => c.repeat(64);
const tag = (slug: string, applications: number, counted = true): ProfileTag => ({
  key: `${pk("9")}|${slug}`,
  authorPubkey: pk("9"),
  slug,
  name: slug,
  applications,
  disputes: 0,
  asserters: [],
  selfDeclared: false,
  subjectDisagreed: false,
  counted,
  sharesName: 1,
  addedAt: 0,
});

beforeEach(() => {
  __resetPersonTags();
  profileTagsMock.mockReset();
  profileTagsMock.mockImplementation(
    async (pks) =>
      new Map(
        pks.map((p) => [
          p,
          p === pk("a")
            ? { tags: [tag("author", 1), tag("verified-human", 3), tag("self-only", 0, false)] }
            : { tags: [] },
        ]),
      ),
  );
});

describe("usePersonTags", () => {
  it("answers each person's counted tags, most applied first, once the lookup lands", async () => {
    const { result } = renderHook(() => usePersonTags([pk("a"), pk("b")], { pov: "nosfabrica" }));
    expect(result.current.get(pk("a"))).toBeUndefined();
    await waitFor(() => expect(result.current.get(pk("a"))).toBeDefined());
    expect(result.current.get(pk("a"))?.map((t) => t.slug)).toEqual(["verified-human", "author"]);
    expect(result.current.get(pk("b"))).toEqual([]);
  });

  it("asks for the whole row set in one batch, once, however the rows are reordered", async () => {
    const { result, rerender } = renderHook(({ pks }) => usePersonTags(pks, { pov: "nosfabrica" }), {
      initialProps: { pks: [pk("a"), pk("b")] },
    });
    await waitFor(() => expect(result.current.get(pk("b"))).toBeDefined());
    await act(async () => rerender({ pks: [pk("b"), pk("a")] }));
    expect(profileTagsMock).toHaveBeenCalledTimes(1);
    expect(profileTagsMock.mock.calls[0][0]).toEqual([pk("a"), pk("b")]);
  });

  it("still lands an answer that was out while the rows grew", async () => {
    let release!: (m: Map<string, { tags: ProfileTag[] }>) => void;
    profileTagsMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const { result, rerender } = renderHook(({ pks }) => usePersonTags(pks, { pov: "nosfabrica" }), {
      initialProps: { pks: [pk("a")] },
    });
    // The row set changes before the first batch answers.
    await act(async () => rerender({ pks: [pk("a"), pk("b")] }));
    await act(async () => release(new Map([[pk("a"), { tags: [tag("author", 1)] }]])));
    await waitFor(() => expect(result.current.get(pk("a"))?.map((t) => t.slug)).toEqual(["author"]));
  });

  it("asks under the viewer's own perspective only when they chose it and are signed in", async () => {
    renderHook(() => usePersonTags([pk("a")], { pov: "mywot", viewerPubkey: pk("5") }));
    await waitFor(() => expect(profileTagsMock).toHaveBeenCalledWith([pk("a")], pk("5"), pk("5")));
    profileTagsMock.mockClear();
    __resetPersonTags();
    renderHook(() => usePersonTags([pk("a")], { pov: "mywot" }));
    await waitFor(() => expect(profileTagsMock).toHaveBeenCalledWith([pk("a")], undefined, "house"));
  });
});
