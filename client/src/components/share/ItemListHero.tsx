/**
 * A list of things (bookmarks, a bookmark set, a curation set, pins,
 * interests — lib/listItems) opened as what it holds, not as a table of
 * tags: the notes as note cards, the articles as article cards, other
 * addressable things as rows into their pages, the people as the roster a
 * follow set has, the hashtags as chips into their topic, the links as
 * links. Each section folds when long. Items sealed in the content are said
 * to be there, not guessed at. The tags stay one click away, as on a
 * Decentralized List's header: "Advanced view".
 *
 * The search card's preview (ItemListPreview) is the same reading, a few
 * items deep.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Bookmark, Braces, ExternalLink, List, ListChecks, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { SectionHeader } from "@/components/ui/section-header";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { SetRoster } from "@/components/share/FollowSetHero";
import { Favicon } from "@/components/share/LinkPreview";
import { StructuralHero } from "@/components/share/StructuralHero";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { useQuotedNotes } from "@/hooks/useQuotedNotes";
import { avatarSrc } from "@/lib/avatarSrc";
import { kindTypeLabel } from "@/lib/kindLabel";
import { addressNoun, listItemCounts, listTitle, readListItems, type ListNote } from "@/lib/listItems";
import { addrCoord, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";
import { eventPath, neventFor, READER_KINDS } from "@/lib/shareId";
import { topicPath } from "@/lib/topicQuery";

const NOTES_FOLD = 10;
const ADDRESSES_FOLD = 10;
const LINKS_FOLD = 10;

const BOOKMARK_KINDS = new Set([10001, 10003, 30003]);

function naddrOf(a: AddressRef): string {
  try {
    return nip19.naddrEncode({ kind: a.kind, pubkey: a.pubkey, identifier: a.identifier, relays: a.relays });
  } catch {
    return "";
  }
}

function hostAndPath(url: string): { host: string; rest: string } {
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

function FoldToggle({
  open,
  total,
  noun,
  onToggle,
  testId,
}: {
  open: boolean;
  total: number;
  noun: string;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 text-xs font-medium text-brand-primary hover:underline dark:text-brand-link"
      data-testid={testId}
    >
      {open ? "Show fewer" : `Show all ${total.toLocaleString()} ${noun}`}
    </button>
  );
}

/** The list's own picture; else — or once it fails to load — the list's mark. */
function ListMark({ image, bookmark }: { image?: string; bookmark: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const Icon = bookmark ? Bookmark : ListChecks;
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
      data-testid="item-list-mark"
    >
      {image && failed !== image ? (
        <img
          src={avatarSrc(image, "lg")}
          onError={() => setFailed(image)}
          alt=""
          className="h-full w-full object-cover"
          data-testid="item-list-image"
        />
      ) : (
        <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
      )}
    </div>
  );
}

function ListNotes({ notes }: { notes: ListNote[] }) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => (open ? notes : notes.slice(0, NOTES_FOLD)), [notes, open]);
  const { notes: found } = useQuotedNotes(useMemo(() => shown.map((n) => n.id), [shown]));
  const byId = useMemo(() => new Map(found.map((q) => [q.event.id, q])), [found]);
  return (
    <section className="space-y-2" data-testid="item-list-notes">
      <SectionHeader kicker={notes.length === 1 ? "Note" : "Notes"} />
      <ul className="space-y-2">
        {shown.map((n) => {
          const q = byId.get(n.id);
          return (
            <li key={n.id} data-testid={`item-list-note-${n.id}`}>
              {q ? (
                <EmbeddedNoteCard
                  event={q.event}
                  author={q.author}
                  profiles={q.profiles}
                  href={eventPath(q.event)}
                  nested
                />
              ) : (
                // Not found yet (or anywhere asked): still a way to it.
                <Link
                  href={`/e/${neventFor(n.id, n.relay ? [n.relay] : [])}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-400"
                  data-testid={`item-list-note-pending-${n.id}`}
                >
                  <span>A note</span>
                  <span className="font-mono text-xs">{n.id.slice(0, 8)}…</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {notes.length > NOTES_FOLD && (
        <FoldToggle
          open={open}
          total={notes.length}
          noun="notes"
          onToggle={() => setOpen((v) => !v)}
          testId="item-list-notes-toggle"
        />
      )}
    </section>
  );
}

function AddressRow({ address }: { address: AddressRef }) {
  const naddr = naddrOf(address);
  const label = kindTypeLabel(address.kind);
  return (
    <Link
      href={naddr ? `/e/${naddr}` : "#"}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-900"
      data-testid={`item-list-address-${addrCoord(address)}`}
    >
      <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">
        {address.identifier || label}
      </span>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </Link>
  );
}

function ListAddresses({ addresses }: { addresses: AddressRef[] }) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => (open ? addresses : addresses.slice(0, ADDRESSES_FOLD)), [addresses, open]);
  const readable = useMemo(() => shown.filter((a) => READER_KINDS.has(a.kind)), [shown]);
  const { articles } = useArticlesByRefs(readable);
  const byCoord = useMemo(
    () =>
      new Map(
        articles.map((ev) => [
          addrCoord({ kind: ev.kind, pubkey: ev.pubkey, identifier: ev.tags.find((t) => t[0] === "d")?.[1] ?? "" }),
          ev,
        ]),
      ),
    [articles],
  );
  // Named for what they are when they are all one thing: "Articles", "Videos".
  const kinds = new Set(addresses.map((a) => a.kind));
  const noun = kinds.size === 1 ? addressNoun([...kinds][0], addresses.length) : "";
  const heading = !noun || noun.startsWith("item") ? "Things" : noun.replace(/^\w/, (c) => c.toUpperCase());
  return (
    <section className="space-y-2" data-testid="item-list-addresses">
      <SectionHeader kicker={heading} />
      <ul className="space-y-2">
        {shown.map((a) => {
          const article = byCoord.get(addrCoord(a));
          return (
            <li key={addrCoord(a)}>{article ? <EmbeddedArticleCard event={article} /> : <AddressRow address={a} />}</li>
          );
        })}
      </ul>
      {addresses.length > ADDRESSES_FOLD && (
        <FoldToggle
          open={open}
          total={addresses.length}
          noun="things"
          onToggle={() => setOpen((v) => !v)}
          testId="item-list-addresses-toggle"
        />
      )}
    </section>
  );
}

/**
 * A list's hashtags. As links into their topics on the page; as plain chips
 * inside a search card, whose body is already a link — never an anchor in an anchor.
 */
function HashtagChips({ hashtags, max, plain = false }: { hashtags: string[]; max?: number; plain?: boolean }) {
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

function ListLinks({ links }: { links: string[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? links : links.slice(0, LINKS_FOLD);
  return (
    <section className="space-y-2" data-testid="item-list-links">
      <SectionHeader kicker={links.length === 1 ? "Link" : "Links"} />
      <ul className="space-y-0.5">
        {shown.map((url) => {
          const { host, rest } = hostAndPath(url);
          return (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="-mx-2 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                data-testid="item-list-link"
              >
                <Favicon host={host} className="h-4 w-4 shrink-0 rounded-sm object-contain" />
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{host}</span>
                  <span className="text-slate-500 dark:text-slate-400">{rest}</span>
                </span>
                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
              </a>
            </li>
          );
        })}
      </ul>
      {links.length > LINKS_FOLD && (
        <FoldToggle
          open={open}
          total={links.length}
          noun="links"
          onToggle={() => setOpen((v) => !v)}
          testId="item-list-links-toggle"
        />
      )}
    </section>
  );
}

export function ItemListHero({ event }: { event: MinimalEvent }) {
  const [advanced, setAdvanced] = useState(false);
  const items = useMemo(() => readListItems(event), [event]);
  const title = listTitle(event);
  const description = event.tags.find((t) => (t[0] === "description" || t[0] === "summary") && t[1]?.trim())?.[1];
  const image = event.tags.find((t) => (t[0] === "image" || t[0] === "thumb") && t[1]?.trim())?.[1];
  const counts = listItemCounts(items);

  const toggle = (
    <button
      type="button"
      onClick={() => setAdvanced((v) => !v)}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
      data-testid="item-list-advanced-toggle"
    >
      {advanced ? (
        <>
          <List className="h-3.5 w-3.5" /> List view
        </>
      ) : (
        <>
          <Braces className="h-3.5 w-3.5" /> Advanced view
        </>
      )}
    </button>
  );

  if (advanced)
    return (
      <div className="space-y-3" data-testid="item-list-advanced">
        <div className="flex justify-end">{toggle}</div>
        <StructuralHero event={event} />
      </div>
    );

  return (
    <div className="space-y-5" data-testid="item-list-hero">
      <div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ListMark image={image} bookmark={BOOKMARK_KINDS.has(event.kind)} />
            <div className="min-w-0">
              <h1
                className="break-words text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="item-list-title"
              >
                <EmojiText text={title} tags={event} />
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="item-list-count">
                {[...counts, ...(items.sealed ? ["private items"] : [])].join(" · ") || "Empty"}
              </p>
            </div>
          </div>
          {toggle}
        </div>
        {description && (
          <p className="mt-3 break-words text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            <EmojiText text={description} tags={event} />
          </p>
        )}
      </div>

      {items.notes.length > 0 && <ListNotes notes={items.notes} />}
      {items.addresses.length > 0 && <ListAddresses addresses={items.addresses} />}
      {items.people.length > 0 && (
        <section data-testid="item-list-people">
          <SectionHeader kicker="People" />
          <SetRoster members={items.people} />
        </section>
      )}
      {items.hashtags.length > 0 && (
        <section className="space-y-2">
          <SectionHeader kicker="Hashtags" />
          <HashtagChips hashtags={items.hashtags} />
        </section>
      )}
      {items.links.length > 0 && <ListLinks links={items.links} />}

      {items.sealed && (
        <p
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
          data-testid="item-list-sealed"
        >
          <Lock className="h-4 w-4 shrink-0" />
          {items.total
            ? "It also holds private items only its owner can read."
            : "Everything on it is private — only its owner can read it."}
        </p>
      )}
      {!items.total && !items.sealed && (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="item-list-empty">
          Nothing is on this list yet.
        </p>
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
