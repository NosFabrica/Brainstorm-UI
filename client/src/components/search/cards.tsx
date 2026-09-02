/**
 * Typed result cards for the verticals with no existing precedent —
 * media, code & git, live events, lists. Each is a compact, self-contained
 * card: author row, the thing itself, and a whole-card link to the in-app
 * event page (/e/:id — NoteContent renders video/audio/HLS there), with an
 * "Open in…" external link for the full native experience. Design-system
 * primitives per CLAUDE.md: Chip for status/counts, shared tier ring.
 */
import { Link } from "wouter";
import { Code2, ExternalLink, FileVideo, ListChecks, Radio } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Chip } from "@/components/ui/chip";
import { useTierRing } from "@/components/score/VerificationCoin";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";

export function tagVal(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

function fmtWhen(created_at: number): string {
  try {
    return new Date(created_at * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function AuthorRow({
  author,
  score,
  created_at,
}: {
  author: SearchResult | null;
  score?: number | null;
  created_at: number;
}) {
  const tierRing = useTierRing();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className={`h-6 w-6 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null) ?? ""}`}>
        {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
        {author ? getDisplayLabel(author) : "Unknown"}
      </span>
      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{fmtWhen(created_at)}</span>
    </div>
  );
}

function CardShell({
  event,
  children,
  openInUrl,
  openInLabel,
  testId,
}: {
  event: NostrEvent;
  children: React.ReactNode;
  openInUrl?: string;
  openInLabel?: string;
  testId?: string;
}) {
  return (
    <div
      className="relative w-full rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all duration-150"
      data-testid={testId}
    >
      <Link href={eventPath(event)} className="block p-3 sm:p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-xl">
        {children}
      </Link>
      {openInUrl && (
        <a
          href={openInUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-brand-link hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" /> {openInLabel ?? "Open in…"}
        </a>
      )}
    </div>
  );
}

function neventOf(event: NostrEvent): string {
  try {
    return nip19.neventEncode({ id: event.id });
  } catch {
    return event.id;
  }
}

function naddrOf(event: NostrEvent): string | null {
  const d = tagVal(event, "d");
  if (d === undefined) return null;
  try {
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  } catch {
    return null;
  }
}

/** First usable image/video URL: imeta `url …`, a url tag, or a bare URL in content. */
export function mediaUrlOf(event: NostrEvent): string | null {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      const urlPart = tag.slice(1).find((p) => p.startsWith("url "));
      if (urlPart) return urlPart.slice(4).trim();
    }
  }
  const url = tagVal(event, "url") ?? tagVal(event, "thumb") ?? tagVal(event, "image");
  if (url) return url;
  const inContent = event.content.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|mp4|webm|mov)\b\S*/i);
  return inContent ? inContent[0] : null;
}

const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;

export function MediaCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const url = mediaUrlOf(event);
  const isImage = !!url && IMAGE_RE.test(url);
  const caption = (tagVal(event, "title") ?? event.content ?? "").slice(0, 200);
  return (
    <CardShell event={event} openInUrl={`https://njump.me/${neventOf(event)}`} openInLabel="Open in client" testId={`media-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {url && isImage ? (
            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" data-testid={`media-thumb-${event.id}`} />
          ) : (
            <FileVideo className="h-6 w-6 text-slate-400 dark:text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <AuthorRow author={author} score={score} created_at={event.created_at} />
          {caption && (
            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200 break-words line-clamp-2">{caption}</p>
          )}
          {url && !isImage && (
            <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">{url}</p>
          )}
        </div>
      </div>
    </CardShell>
  );
}

export function RepoCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  // 30617 repo announcements carry name/description; patches (1617), issues
  // (1621) and snippets (1337) fall back to subject/description/content.
  const name = tagVal(event, "name") ?? tagVal(event, "subject") ?? tagVal(event, "d") ?? "Untitled";
  const description = tagVal(event, "description") ?? (event.kind === 30617 ? "" : event.content.slice(0, 200));
  const web = tagVal(event, "web");
  const naddr = naddrOf(event);
  const openIn = web ?? (naddr ? `https://gitworkshop.dev/${naddr}` : `https://njump.me/${neventOf(event)}`);
  return (
    <CardShell event={event} openInUrl={openIn} openInLabel="Open repo" testId={`repo-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Code2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{description}</p>
          )}
          <div className="mt-1.5">
            <AuthorRow author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

const LIVE_TONES: Record<string, "success" | "neutral" | "info"> = {
  live: "success",
  ended: "neutral",
  planned: "info",
};

export function LiveCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const title = tagVal(event, "title") ?? tagVal(event, "name") ?? "Live event";
  const status = (tagVal(event, "status") ?? "").toLowerCase();
  const summary = tagVal(event, "summary") ?? "";
  const image = tagVal(event, "image");
  const naddr = naddrOf(event);
  const openIn = event.kind === 30311 && naddr ? `https://zap.stream/${naddr}` : `https://njump.me/${neventOf(event)}`;
  return (
    <CardShell event={event} openInUrl={openIn} openInLabel="Watch" testId={`live-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {image ? (
            <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Radio className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            {status && (
              <Chip size="sm" tone={LIVE_TONES[status] ?? "neutral"} dot={status === "live"} data-testid={`live-status-${event.id}`}>
                {status}
              </Chip>
            )}
          </div>
          {summary && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{summary}</p>
          )}
          <div className="mt-1.5">
            <AuthorRow author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

export function ListCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const title = tagVal(event, "title") ?? tagVal(event, "name") ?? tagVal(event, "d") ?? "Untitled list";
  const description = tagVal(event, "description") ?? "";
  const count = event.tags.filter((t) => t[0] === "p" || t[0] === "e" || t[0] === "a" || t[0] === "r").length;
  return (
    <CardShell event={event} openInUrl={`https://njump.me/${neventOf(event)}`} openInLabel="Open in client" testId={`list-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <ListChecks className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <Chip size="sm" tone="slate" data-testid={`list-count-${event.id}`}>
              {count} item{count !== 1 ? "s" : ""}
            </Chip>
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{description}</p>
          )}
          <div className="mt-1.5">
            <AuthorRow author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}
