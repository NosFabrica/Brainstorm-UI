/**
 * A book, read from its list item (ADR 0007, tier three). Fields are read
 * through the governing definition, as every view's are — and, while the
 * community `books` header declares no fields at all (2026-10-12), by the
 * names every Open Library item carries, so a book has a page before a
 * copy that declares them exists. The moment the definition declares a
 * field, its declaration wins.
 *
 * Nothing here asks any API: this is what the item says. The author comes
 * as Open Library writes it ("Duncan, Michael (Podcaster)") and is turned
 * into the name on the cover. The page's enrichment is services/openLibrary.
 */
import { fieldCell } from "./dlistFields";
import type { ConceptDefinition } from "./conceptResolution";
import type { ItemPresentation } from "./itemPresentation";

export interface Book {
  title: string;
  /** As on the cover: "Michael Duncan". Null when the item names none. */
  author: string | null;
  /** ISBN-13, digits only. */
  isbn: string | null;
  isbn10: string | null;
  /** Open Library work id, e.g. OL19722168W. */
  workId: string | null;
  cover: string | null;
  year: string | null;
  pages: number | null;
  /** "English", from the ISO 639-2 code the item gives. */
  language: string | null;
  subjects: string[];
}

/** The tag each part is read from — what Open Library's seed named them. */
export const BOOK_FIELDS = {
  title: "title",
  author: "author",
  isbn: "isbn",
  isbn10: "isbn10",
  workId: "open-library-id",
  cover: "cover",
  year: "year",
  pages: "pages",
  lang: "lang",
  subject: "subject",
} as const;

type Item = { tags: string[][] };

/** Every value the item gives a field: the declaration's when the definition has one, else the tag's. */
function valuesOf(item: Item, definition: ConceptDefinition, name: string): string[] {
  const decl = definition.fields.find((f) => f.name === name);
  if (decl) {
    const cell = fieldCell(item, decl);
    if (cell.value == null) return [];
  }
  return item.tags.filter((t) => t[0] === name && t[1] != null && String(t[1]).trim()).map((t) => String(t[1]).trim());
}

export function bookOf(item: Item, definition: ConceptDefinition): Book | null {
  const one = (name: string) => valuesOf(item, definition, name)[0] ?? null;
  const title = one(BOOK_FIELDS.title);
  if (!title) return null;
  const pages = Number(one(BOOK_FIELDS.pages));
  const author = one(BOOK_FIELDS.author);
  return {
    title,
    author: author ? authorName(author) || null : null,
    isbn: one(BOOK_FIELDS.isbn)?.replace(/[^0-9Xx]/g, "") || null,
    isbn10: one(BOOK_FIELDS.isbn10)?.replace(/[^0-9Xx]/g, "") || null,
    workId: one(BOOK_FIELDS.workId),
    cover: one(BOOK_FIELDS.cover),
    year: one(BOOK_FIELDS.year),
    pages: Number.isInteger(pages) && pages > 0 ? pages : null,
    language: languageName(one(BOOK_FIELDS.lang)),
    subjects: cleanSubjects(valuesOf(item, definition, BOOK_FIELDS.subject)),
  };
}

/**
 * "Duncan, Michael (Podcaster)" → "Michael Duncan"; "Kennedy, X. & Gioia, D."
 * → "X. Kennedy & D. Gioia". A name already in cover order is left alone.
 */
export function authorName(raw: string): string {
  return raw
    .split(/\s*&\s*|\s+and\s+/)
    .map((part) => {
      const bare = part.replace(/\s*\([^)]*\)\s*/g, " ").trim();
      const m = bare.match(/^([^,]+),\s*(.+)$/);
      return (m ? `${m[2].trim()} ${m[1].trim()}` : bare).replace(/\s+/g, " ");
    })
    .filter(Boolean)
    .join(" & ");
}

/** The subjects a reader would recognise: no machine tags (`nyt:…=2017-11-12`), no repeats. */
export function cleanSubjects(subjects: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of subjects) {
    const subject = s.trim();
    const key = subject.toLowerCase();
    if (!subject || /^[a-z]+:/i.test(subject) || seen.has(key)) continue;
    seen.add(key);
    out.push(subject);
  }
  return out;
}

/** A catalogue heading, not a subject a reader would say: "Israel. Mosad le-modiʻin ṿe-…" */
const CATALOGUE = /\.\s|\s--\s/;
const LONGEST = 40;

/**
 * The few subjects a reader would recognise, for one quiet line: the
 * shortest first — the broad ones — leaving out library catalogue headings
 * and anything too long to scan, capped at `n`. The full set stays behind
 * a count.
 */
export function topSubjects(subjects: string[], n: number): string[] {
  return subjects
    .filter((s) => s.length <= LONGEST && !CATALOGUE.test(s))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, n);
}

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: "language", fallback: "none" });
  } catch {
    return null;
  }
})();

/** "eng" → "English", in the reader's language; null for a code nobody can name. */
export function languageName(code: string | null): string | null {
  if (!code || !languageNames) return null;
  try {
    const name = languageNames.of(code.trim().toLowerCase());
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/**
 * How a book reads where it is one among many — a popup row, a results card,
 * a list row (ADR 0007): its cover, its title, its author. From the item
 * alone; nothing is asked of Open Library during a search.
 */
export function bookPresentation(item: Item, definition: ConceptDefinition, shown: ItemPresentation): ItemPresentation {
  const book = bookOf(item, definition);
  if (!book) return shown;
  return {
    ...shown,
    title: book.title,
    titleField: BOOK_FIELDS.title,
    summary: book.author ?? shown.summary,
    summaryField: book.author ? BOOK_FIELDS.author : shown.summaryField,
    image: book.cover ?? shown.image,
    imageField: book.cover ? BOOK_FIELDS.cover : shown.imageField,
    imageShape: book.cover ? "portrait" : shown.imageShape,
  };
}

type ListItem = { id: string; tags: string[][] };
const fold = (s: string) => s.trim().toLowerCase();

/** The list's other books by the same author, as the cover names them — newest listed first is the list's order. */
export function booksByAuthor<T extends ListItem>(
  book: Book,
  selfId: string,
  items: T[],
  definition: ConceptDefinition,
): T[] {
  if (!book.author) return [];
  const author = fold(book.author);
  return items.filter((i) => i.id !== selfId && fold(bookOf(i, definition)?.author ?? "") === author);
}

/** The list's books sharing the most subjects with this one; sharing none, none. */
export function similarBooks<T extends ListItem>(
  book: Book,
  selfId: string,
  items: T[],
  definition: ConceptDefinition,
): T[] {
  const mine = new Set(book.subjects.map(fold));
  if (mine.size === 0) return [];
  return items
    .filter((i) => i.id !== selfId)
    .map((item) => {
      const theirs = bookOf(item, definition)?.subjects ?? [];
      return { item, shared: theirs.filter((s) => mine.has(fold(s))).length };
    })
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .map((x) => x.item);
}
