/**
 * What Open Library says about a book, for the book's own page (ADR 0007,
 * tier three): its subtitle, a description, the publisher and date, the
 * page count, and how readers there rated it.
 *
 * Asked of our own origin — `GET /openlibrary/isbn/<isbn>.json`,
 * `/openlibrary/works/<id>.json`, `/openlibrary/works/<id>/ratings.json`
 * — which nginx proxies to openlibrary.org and caches, never of Open
 * Library from the reader's browser: the link-preview rule
 * (services/unfurl). One upstream call per book, readers never contact the
 * site. In development Vite proxies the same path. Only on the book's
 * page: a search draws from the item alone (lib/books).
 *
 * Memoised for the session, failures included; a page is asked once.
 */

export interface BookFacts {
  subtitle: string | null;
  description: string | null;
  publisher: string | null;
  /** As Open Library writes it: "2017", "Nov 07, 2017". */
  publishDate: string | null;
  pages: number | null;
  /** Readers' average out of five, and how many rated — null when none have. */
  rating: { average: number; count: number } | null;
}

const TIMEOUT_MS = 8000;
const cache = new Map<string, Promise<BookFacts | null>>();

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** Open Library writes a text as a string or as `{ type: "/type/text", value }`. */
const text = (v: unknown): string | null =>
  str(v) ?? (v && typeof v === "object" ? str((v as { value?: unknown }).value) : null);

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;
const workIdOf = (key: unknown): string | null => str(key)?.replace(/^\/works\//, "") ?? null;

async function ask(isbn: string | null, workId: string | null): Promise<BookFacts | null> {
  const edition = isbn ? await getJson<Json>(`/openlibrary/isbn/${encodeURIComponent(isbn)}.json`) : null;
  const works = Array.isArray(edition?.works) ? (edition.works as Json[]) : [];
  const id = workId ?? workIdOf(works[0]?.key);
  const [work, ratings] = id
    ? await Promise.all([
        getJson<Json>(`/openlibrary/works/${encodeURIComponent(id)}.json`),
        getJson<Json>(`/openlibrary/works/${encodeURIComponent(id)}/ratings.json`),
      ])
    : [null, null];
  if (!edition && !work) return null;
  const summary = ratings?.summary as Json | undefined;
  const average = typeof summary?.average === "number" ? summary.average : null;
  const count = typeof summary?.count === "number" ? summary.count : 0;
  const pages = typeof edition?.number_of_pages === "number" ? edition.number_of_pages : null;
  return {
    subtitle: str(edition?.subtitle),
    description: text(work?.description) ?? text(edition?.description),
    publisher: Array.isArray(edition?.publishers) ? str(edition.publishers[0]) : null,
    publishDate: str(edition?.publish_date),
    pages: pages && pages > 0 ? pages : null,
    rating: average != null && count > 0 ? { average, count } : null,
  };
}

export function fetchBookFacts(book: { isbn: string | null; workId: string | null }): Promise<BookFacts | null> {
  const key = `${book.isbn ?? ""}|${book.workId ?? ""}`;
  let p = cache.get(key);
  if (!p) {
    p = ask(book.isbn, book.workId);
    cache.set(key, p);
  }
  return p;
}

/** Test seam. */
export function __resetOpenLibrary(): void {
  cache.clear();
}
