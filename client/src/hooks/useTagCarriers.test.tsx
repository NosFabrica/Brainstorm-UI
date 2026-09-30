// @vitest-environment jsdom
/**
 * The people the matched tags are on, for the rows of a typeahead or a People
 * page: asked once per tag for the session, filling in as answers land, under
 * the perspective the surface shows. Plain state, no query client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { TagSummary } from "@/services/tags";
import type { CarrierPerson } from "@/lib/tagCarrierPeople";

const carriersMock = vi.fn<(tag: TagSummary, observer: string) => Promise<CarrierPerson[]>>();
vi.mock("@/services/tagCarriers", () => ({
  fetchTagCarrierPeople: (tag: TagSummary, observer: string) => carriersMock(tag, observer),
}));

import { useTagCarriers } from "./useTagCarriers";

const pk = (c: string) => c.repeat(64);
const person = (c: string): CarrierPerson => ({
  pubkey: pk(c),
  npub: `npub${c}`,
  name: c,
  applications: 1,
  addedAt: 0,
});
const tag = (slug: string): TagSummary => ({
  key: `39999:${pk("9")}:${slug}`,
  authorPubkey: pk("9"),
  slug,
  name: slug,
  people: 1,
  vouches: 1,
  sharesName: 0,
  unverified: false,
});
const human = tag("verified-human"),
  author = tag("author");

beforeEach(() => {
  carriersMock.mockReset();
  carriersMock.mockImplementation(async (t) =>
    t.slug === "verified-human" ? [person("a"), person("b")] : [person("a")],
  );
});

describe("useTagCarriers", () => {
  it("with no matched tags asks nobody and is settled at once", () => {
    const { result } = renderHook(() => useTagCarriers([], { pov: "nosfabrica" }));
    expect(result.current).toEqual({ byPubkey: new Map(), people: [], settled: true });
    expect(carriersMock).not.toHaveBeenCalled();
  });

  it("lists every carrier once, and each person under every matched tag they carry", async () => {
    const { result } = renderHook(() => useTagCarriers([human, author], { pov: "nosfabrica" }));
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.people.map((p) => p.name)).toEqual(["a", "b"]);
    expect(result.current.byPubkey.get(pk("a"))?.map((t) => t.slug)).toEqual(["verified-human", "author"]);
    expect(result.current.byPubkey.get(pk("b"))?.map((t) => t.slug)).toEqual(["verified-human"]);
  });

  it("asks once per tag, however the matches are reordered on later renders", async () => {
    const { result, rerender } = renderHook(({ tags }) => useTagCarriers(tags, { pov: "nosfabrica" }), {
      initialProps: { tags: [human, author] },
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    await act(async () => rerender({ tags: [author, human] }));
    expect(carriersMock).toHaveBeenCalledTimes(2);
  });

  it("asks under the viewer's own perspective only when they chose it and are signed in", async () => {
    renderHook(() => useTagCarriers([human], { pov: "mywot", viewerPubkey: pk("5") }));
    await waitFor(() => expect(carriersMock).toHaveBeenCalledWith(human, pk("5")));
    carriersMock.mockClear();
    renderHook(() => useTagCarriers([human], { pov: "mywot" }));
    await waitFor(() => expect(carriersMock).toHaveBeenCalledWith(human, "house"));
  });
});
