/**
 * A list of things (lib/listItems) in small: its first few items, for the
 * search card (ItemListPreview), and the whole list as a card where a note
 * names it (EmbeddedListCard) — by id, as a quote, or by address. Before,
 * a quoted list was a note card with nothing in it, and a linked one an
 * article teaser with the default cover.
 *
 * Nothing here draws a note card (EmbeddedNoteCard draws this), so the two
 * never import each other.
 */
import { useMemo, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { Bookmark, ListChecks } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Favicon } from "@/components/share/LinkPreview";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { useQuotedNotes } from "@/hooks/useQuotedNotes";
import { ago } from "@/lib/ago";
import { listCountLabel, listTitle, readListItems } from "@/lib/listItems";
import { type AddressRef, type MinimalEvent } from "@/lib/noteRefs";
import { eventPath, READER_KINDS } from "@/lib/shareId";
import { topicPath } from "@/lib/topicQuery";

type ProfileLite = { name?: string; display_name?: string; picture?: string };

/** Lists that hold bookmarks wear the bookmark; the rest the list mark. */
export const BOOKMARK_KINDS: ReadonlySet<number> = new Set([10001, 10003, 30003]);

export function hostAndPath(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url);
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    return { host: u.hostname.replace(/^www\./, ""), rest };
  } catch {
    return { host: url, rest: "" };
  }
}

/** A note's words on one line: its links and nostr: references left out. */
export function noteLine(content: string): string {
  return content
    .replace(/https?:\/\/\S+|nostr:n(?:event|ote|addr|pub|profile)1[02-9ac-hj-np-z]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A list's hashtags. As links into their topics on the page; as plain chips
 * inside a search card, whose body is already a link — never an anchor in an anchor.
 */
export function HashtagChips({ hashtags, max, plain = false }: { hashtags: string[]; max?: number; plain?: boolean }) {
  const shown = max ? hashtags.slice(0, max) : hashtags;
  const cls = "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-brand-link dark:bg-slate-800";
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="item-list-hashtags">
      {shown.map((tag) =>
        plain ? (
          <span key={tag} className={cls} data-testid={`item-list-hashtag-${tag}`}>
            #{tag}
          </span>
        ) : (
          <Link
            key={tag}
            href={topicPath(tag)}
            className={`${cls} transition-colors hover:bg-slate-200 dark:hover:bg-slate-700`}
            data-testid={`item-list-hashtag-${tag}`}
          >
            #{tag}
          </Link>
        ),
      )}
      {max && hashtags.length > max && (
        <span className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-400">+{hashtags.length - max}</span>
      )}
    </div>
  );
}

const PREVIEW_NOTES = 3;
const PREVIEW_HASHTAGS = 8;
const PREVIEW_LINKS = 4;

function PreviewLine({
  avatar,
  name,
  text,
  testId,
}: {
  avatar?: ReactNode;
  name?: string;
  text: string;
  testId: string;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm" data-testid={testId}>
      {avatar}
      <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
        {name && <span className="font-medium text-slate-900 dark:text-slate-100">{name} </span>}
        <span className="text-slate-600 dark:text-slate-300">{text}</span>
      </span>
    </li>
  );
}

/**
 * A list's first few things, for its search card: a line per note (who, and
 * what it says), a line per article (its title), or its hashtags or link
 * hosts — whatever it is a list of. Notes not found yet are left out; the
 * count on the card still says how many it holds.
 */
export function ItemListPreview({ event }: { event: MinimalEvent }) {
  const items = useMemo(() => readListItems(event), [event]);
  const noteIds = useMemo(() => items.notes.slice(0, PREVIEW_NOTES).map((n) => n.id), [items]);
  const { notes } = useQuotedNotes(noteIds);
  const articleRefs = useMemo(
    () => items.addresses.filter((a) => READER_KINDS.has(a.kind)).slice(0, Math.max(0, PREVIEW_NOTES - noteIds.length)),
    [items, noteIds.length],
  );
  const { articles } = useArticlesByRefs(articleRefs);

  // In the list's own order, as found.
  const byId = new Map(notes.map((q) => [q.event.id, q]));
  const noteLines = noteIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({ q, text: noteLine(q.event.content) }))
    .filter((l) => l.text);
  const articleLines = articles
    .map((ev) => ({ ev, title: ev.tags.find((t) => t[0] === "title")?.[1]?.trim() }))
    .filter((l): l is { ev: MinimalEvent; title: string } => !!l.title);

  if (noteLines.length || articleLines.length)
    return (
      <ul className="mt-2 space-y-1" data-testid={`list-preview-${event.id}`}>
        {noteLines.map(({ q, text }) => (
          <PreviewLine
            key={q.event.id}
            testId={`list-preview-note-${q.event.id}`}
            avatar={
              <Avatar className="h-5 w-5 shrink-0 border border-slate-200/80 dark:border-slate-800/80">
                {q.author?.picture ? <AvatarImage src={q.author.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
            }
            name={q.author?.display_name || q.author?.name}
            text={text}
          />
        ))}
        {articleLines.map(({ ev, title }) => (
          <PreviewLine key={ev.id} testId={`list-preview-article-${ev.id}`} text={title} />
        ))}
      </ul>
    );
  if (items.hashtags.length)
    return (
      <div className="mt-2" data-testid={`list-preview-${event.id}`}>
        <HashtagChips hashtags={items.hashtags} max={PREVIEW_HASHTAGS} plain />
      </div>
    );
  if (items.links.length)
    return (
      <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`list-preview-${event.id}`}>
        {items.links.slice(0, PREVIEW_LINKS).map((url) => {
          const { host } = hostAndPath(url);
          return (
            <Chip key={url} size="md" tone="slate">
              <Favicon host={host} className="h-3 w-3 shrink-0 rounded-sm object-contain" />
              {host}
            </Chip>
          );
        })}
        {items.links.length > PREVIEW_LINKS && (
          <span className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-400">
            +{items.links.length - PREVIEW_LINKS}
          </span>
        )}
      </div>
    );
  return null;
}

/** Where a list opens: its address for an addressable one, so the link follows its edits. */
function listHref(event: MinimalEvent): string {
  if (event.kind >= 30000 && event.kind < 40000) {
    try {
      const identifier = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
      return `/e/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier })}`;
    } catch {
      /* fall through to the event link */
    }
  }
  return eventPath(event);
}

/**
 * A list where a note names it: its mark, its name, what it holds and whose
 * it is, then its first few items. Inside a card already shown inside a card
 * (`nested`) it stops at its name — one level, never a stack. The card opens
 * the list's page; it stops the click, so the note around it does not open.
 */
export function EmbeddedListCard({
  event,
  author,
  href,
  nested = false,
}: {
  event: MinimalEvent;
  author?: ProfileLite;
  href?: string;
  nested?: boolean;
}) {
  const [, navigate] = useLocation();
  const items = useMemo(() => readListItems(event), [event]);
  const Icon = BOOKMARK_KINDS.has(event.kind) ? Bookmark : ListChecks;
  const name = author?.display_name || author?.name;
  const to = href ?? listHref(event);
  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    e.stopPropagation();
    navigate(to);
  };
  return (
    <div
      className="not-prose mt-2 cursor-pointer rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700"
      onClick={onClick}
      data-testid="embedded-list"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800">
          <Icon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          <EmojiText text={listTitle(event)} tags={event} />
        </span>
        <Chip size="sm" tone="slate" className="shrink-0" data-testid="embedded-list-count">
          {listCountLabel(items)}
        </Chip>
        <span className="ml-auto shrink-0 truncate text-xs text-slate-400 dark:text-slate-500">
          {name ? `${name} · ` : ""}
          {ago(event.created_at)}
        </span>
      </div>
      {!nested && <ItemListPreview event={event} />}
    </div>
  );
}

/**
 * A list a note names by address (`naddr`): the list's card once it is found;
 * until then, or when no relay has it, what the caller drew before — a link.
 */
export function ListAddressRef({
  address,
  bech32,
  fallback,
  nested,
}: {
  address: AddressRef;
  bech32: string;
  fallback: ReactNode;
  nested?: boolean;
}) {
  // Reads any address, not only articles: held copy first, then the relays.
  const { articles } = useArticlesByRefs([address]);
  const ev = articles[0];
  if (!ev) return <>{fallback}</>;
  return <EmbeddedListCard event={ev} href={`/e/${bech32}`} nested={nested} />;
}
