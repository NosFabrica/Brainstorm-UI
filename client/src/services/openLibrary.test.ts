// @vitest-environment jsdom
/**
 * What Open Library says about a book, asked of our own origin
 * (`/openlibrary/…`, which nginx proxies and caches), never of
 * openlibrary.org from the reader's browser — the link-preview rule. Only
 * for the one book on its page; a search never asks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal("fetch", (input: string, init?: RequestInit) => fetchMock(input, init));

import { fetchBookFacts, __resetOpenLibrary } from "./openLibrary";

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const status = (code: number) => Promise.resolve(new Response("", { status: code }));

// Recorded from openlibrary.org on 2026-10-12, trimmed to what the page reads.
const edition = {
  key: "/books/OL26935291M",
  title: "The storm before the storm",
  subtitle: "the beginning of the end of the Roman Republic",
  publishers: ["PublicAffairs"],
  publish_date: "2017",
  number_of_pages: 327,
  works: [{ key: "/works/OL19722168W" }],
  description: { type: "/type/text", value: "The creator of the award-winning podcast…" },
};
const work = {
  key: "/works/OL19722168W",
  title: "The storm before the storm",
  subjects: ["History", "Rome, history, republic, 510-30 b.c.", "nyt:combined-print-and-e-book-nonfiction=2017-11-12"],
  covers: [10092515],
  description: { type: "/type/text", value: "The creator of the award-winning podcast series The History of Rome…" },
};
const ratings = { summary: { average: 4.714285714285714, count: 7, sortable: 3.41 }, counts: { 4: 2, 5: 5 } };

const route = (url: string) => {
  if (url === "/openlibrary/isbn/9781610397216.json") return ok(edition);
  if (url === "/openlibrary/works/OL19722168W.json") return ok(work);
  if (url === "/openlibrary/works/OL19722168W/ratings.json") return ok(ratings);
  return status(404);
};

beforeEach(() => {
  fetchMock.mockReset();
  __resetOpenLibrary();
});

describe("fetchBookFacts", () => {
  it("asks our origin for the edition, the work and its ratings, and reads the page's facts from them", async () => {
    fetchMock.mockImplementation((url) => route(url));
    const facts = await fetchBookFacts({ isbn: "9781610397216", workId: "OL19722168W" });
    expect(facts).toEqual({
      subtitle: "the beginning of the end of the Roman Republic",
      description: "The creator of the award-winning podcast series The History of Rome…",
      publisher: "PublicAffairs",
      publishDate: "2017",
      pages: 327,
      rating: { average: 4.714285714285714, count: 7 },
    });
    const asked = fetchMock.mock.calls.map((c) => c[0]);
    expect(asked.every((u) => u.startsWith("/openlibrary/"))).toBe(true);
    expect(asked).not.toContainEqual(expect.stringContaining("openlibrary.org"));
  });

  it("without an ISBN, finds the work by its id alone; without ratings, says none", async () => {
    fetchMock.mockImplementation((url) =>
      url === "/openlibrary/works/OL19722168W.json" ? ok({ ...work, description: "Plain words." }) : status(404),
    );
    const facts = await fetchBookFacts({ isbn: null, workId: "OL19722168W" });
    expect(facts).toMatchObject({ description: "Plain words.", publisher: null, rating: null });
  });

  it("finds the work through the edition when the item names only an ISBN", async () => {
    fetchMock.mockImplementation((url) => route(url));
    const facts = await fetchBookFacts({ isbn: "9781610397216", workId: null });
    expect(facts?.rating).toEqual({ average: 4.714285714285714, count: 7 });
  });

  it("is null when Open Library knows nothing, and asks once per book", async () => {
    fetchMock.mockImplementation(() => status(404));
    expect(await fetchBookFacts({ isbn: "0000000000000", workId: null })).toBeNull();
    expect(await fetchBookFacts({ isbn: "0000000000000", workId: null })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
