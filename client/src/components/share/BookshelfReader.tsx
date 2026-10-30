import { useMemo, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Library } from "lucide-react";
import { KindPill } from "@/components/ui/kind-pill";
import { EmojiText } from "@/components/ui/custom-emoji";
import { Card } from "@/components/ui/card";
import { PublicationTopics } from "@/components/share/PublicationReader";
import { usePublicationEntries, type PublicationEntry } from "@/hooks/usePublication";
import { kindLabel } from "@/lib/kindLabel";
import {
  BOOKSHELF_KIND,
  entryHref,
  entryTitle,
  identifierOf,
  NO_RELAYS,
  publicationMeta,
  publicationTitle,
  PUBLICATION_INDEX_KIND,
  shelfLine,
} from "@/lib/publication";

/**
 * A bookshelf (kind 30045): Alexandria's and the Bookshelf app's curated
 * shelves of publications. Read as what it is — the covers of the books on it,
 * and the shelves within it — not as an article: a shelf has no text of its
 * own. Its contents share an index's grammar, so it reads them through the
 * same hook as a book's table of contents (hooks/usePublication).
 */

type ShelfLike = { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string };

/** A shelf's header: what it is called, what it holds, what it says of itself. */
export function BookshelfHeader({ ev }: { ev: ShelfLike }) {
  const meta = useMemo(() => publicationMeta(ev), [ev]);
  const title = publicationTitle(ev);
  const line = useMemo(() => shelfLine(ev), [ev]);
  return (
    <header data-testid="bookshelf-header">
      <KindPill event={ev} mixed={false} className="mb-2" />
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
          <Library className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1
            className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <EmojiText text={title} tags={ev} />
          </h1>
          {line && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="bookshelf-facts">
              {line}
            </p>
          )}
        </div>
      </div>
      {meta.summary && (
        <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-slate-600 dark:text-slate-300">
          {meta.summary}
        </p>
      )}
      <PublicationTopics topics={meta.topics} />
    </header>
  );
}

/** What is on a shelf: its books as covers, its shelves as shelves, anything else by name. */
export function BookshelfContents({ shelf, relays = NO_RELAYS }: { shelf: ShelfLike; relays?: string[] }) {
  const { entries, settled } = usePublicationEntries(shelf, relays);
  const parentD = identifierOf(shelf);
  // Shelves first, as a library's sections come before its books.
  const { shelves, rest } = useMemo(() => {
    const shelves: PublicationEntry[] = [];
    const rest: PublicationEntry[] = [];
    for (const e of entries) ((e.event?.kind ?? e.ref.address?.kind) === BOOKSHELF_KIND ? shelves : rest).push(e);
    return { shelves, rest };
  }, [entries]);
  if (!entries.length) {
    return (
      <p className="mt-8 text-center text-sm text-slate-400 dark:text-slate-500" data-testid="bookshelf-empty">
        Nothing on this shelf yet.
      </p>
    );
  }
  return (
    <div className="mt-6 space-y-6" data-testid="bookshelf-contents">
      {shelves.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {shelves.map((entry) => (
            <ShelfTile key={entry.ref.key} entry={entry} settled={settled} parentD={parentD} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
          {rest.map((entry) => (
            <BookTile key={entry.ref.key} entry={entry} settled={settled} parentD={parentD} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShelfTile({ entry, settled, parentD }: { entry: PublicationEntry; settled: boolean; parentD: string }) {
  const href = entryHref(entry.ref, entry.event);
  const line = entry.event ? shelfLine(entry.event) : "";
  const body = (
    <Card
      interactive={!!href}
      className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-none"
      data-testid="bookshelf-shelf"
    >
      <Library className="h-5 w-5 shrink-0 text-brand-primary" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          {entryTitle(entry.ref, entry.event, parentD)}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          {entry.event ? line || "Empty shelf" : settled ? "Not found on the relays" : "Loading…"}
        </span>
      </span>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function BookTile({ entry, settled, parentD }: { entry: PublicationEntry; settled: boolean; parentD: string }) {
  const [broken, setBroken] = useState(false);
  const { event, ref } = entry;
  const href = entryHref(ref, event);
  const meta = useMemo(() => (event ? publicationMeta(event) : null), [event]);
  const title = entryTitle(ref, event, parentD);
  const isBook = (event?.kind ?? ref.address?.kind) === PUBLICATION_INDEX_KIND;
  // Not a book: say what it is, since a cover would not.
  const what = event && !isBook ? kindLabel(event) : undefined;
  const cover = meta?.image && !broken ? meta.image : undefined;
  const tile = (
    <>
      <div className="aspect-[2/3] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-800">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          // No cover: the title on a plain jacket, so the shelf still reads.
          <div className="flex h-full w-full flex-col justify-between p-3 text-slate-500 dark:text-slate-400">
            <BookOpen className="h-5 w-5" />
            <span className="line-clamp-5 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</span>
          </div>
        )}
      </div>
      <span className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
      <span className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
        {event ? (meta?.author ?? what ?? "") : settled ? "Not found on the relays" : "Loading…"}
      </span>
    </>
  );
  return (
    <li data-testid="bookshelf-book">
      {href ? (
        <Link href={href} className="block transition-opacity hover:opacity-80">
          {tile}
        </Link>
      ) : (
        tile
      )}
    </li>
  );
}
