import { useMemo, useState } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { BookOpen, Library } from "lucide-react";
import { KindPill } from "@/components/ui/kind-pill";
import { EmojiText } from "@/components/ui/custom-emoji";
import { usePublicationEntries, type PublicationEntry } from "@/hooks/usePublication";
import { eventPath } from "@/lib/shareId";
import { kindLabel } from "@/lib/kindLabel";
import {
  BOOKSHELF_KIND,
  entryFallbackTitle,
  publicationMeta,
  publicationTitle,
  PUBLICATION_INDEX_KIND,
  shelfLine,
  type SectionRef,
} from "@/lib/publication";

/**
 * A bookshelf (kind 30045): Alexandria's and the Bookshelf app's curated
 * shelves of publications. Read as what it is — the covers of the books on it,
 * and the shelves within it — not as an article: a shelf has no text of its
 * own. Its contents share an index's grammar, so it reads them through the
 * same hook as a book's table of contents (hooks/usePublication).
 */

type ShelfLike = { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string };

const NO_RELAYS: string[] = [];

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
      {meta.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meta.topics.map((t) => (
            <Link
              key={t}
              href={`/t/${encodeURIComponent(t)}`}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-brand-link hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

/** Where an entry opens: its page by address, or by id when that is all the shelf gave. */
function entryHref(ref: SectionRef, event?: NostrEvent): string | undefined {
  if (event) return eventPath(event, ref.address?.relays ?? []);
  try {
    return ref.address ? `/e/${nip19.naddrEncode(ref.address)}` : undefined;
  } catch {
    return undefined;
  }
}

/** What is on a shelf: its books as covers, its shelves as shelves, anything else by name. */
export function BookshelfContents({ shelf, relays = NO_RELAYS }: { shelf: ShelfLike; relays?: string[] }) {
  const { entries, settled } = usePublicationEntries(shelf, relays);
  const parentD = shelf.tags.find((t) => t[0] === "d")?.[1] ?? "";
  if (!entries.length) {
    return (
      <p className="mt-8 text-center text-sm text-slate-400 dark:text-slate-500" data-testid="bookshelf-empty">
        Nothing on this shelf yet.
      </p>
    );
  }
  // Shelves first, as a library's sections come before its books.
  const shelves = entries.filter((e) => (e.event?.kind ?? e.ref.address?.kind) === BOOKSHELF_KIND);
  const rest = entries.filter((e) => !shelves.includes(e));
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

function entryName(entry: PublicationEntry, parentD: string): string {
  if (entry.event) return publicationTitle(entry.event);
  if (entry.ref.title) return entry.ref.title;
  return entry.ref.address ? entryFallbackTitle(entry.ref.address.identifier, parentD) : "Untitled";
}

function ShelfTile({ entry, settled, parentD }: { entry: PublicationEntry; settled: boolean; parentD: string }) {
  const href = entryHref(entry.ref, entry.event);
  const line = entry.event ? shelfLine(entry.event) : "";
  const body = (
    <>
      <Library className="h-5 w-5 shrink-0 text-brand-primary" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          {entryName(entry, parentD)}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          {entry.event ? line || "Empty shelf" : settled ? "Not found on the relays" : "Loading…"}
        </span>
      </span>
    </>
  );
  const cls =
    "flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-brand-accent/40`} data-testid="bookshelf-shelf">
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid="bookshelf-shelf">
      {body}
    </div>
  );
}

function BookTile({ entry, settled, parentD }: { entry: PublicationEntry; settled: boolean; parentD: string }) {
  const [broken, setBroken] = useState(false);
  const { event, ref } = entry;
  const href = entryHref(ref, event);
  const meta = useMemo(() => (event ? publicationMeta(event) : null), [event]);
  const title = entryName(entry, parentD);
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
