/**
 * The compact Google-density result row — news-grade. A news-shaped note
 * (headline + article URL + summary, the shape the news bots publish)
 * renders as a real news card: outlet favicon + domain source line,
 * clickable headline out to the article, two-line summary, thumbnail.
 * Ordinary posts keep the author-line + snippet, with bare URLs upgraded
 * to clickable domain chips. The row body opens the in-app event page —
 * a div-with-navigate, so the external anchors inside stay legal HTML.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { nip19 } from "nostr-tools";
import { Favicon, LinkChip } from "@/components/share/LinkPreview";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { highlightTerms } from "@/lib/highlight";
import { parseNewsShape } from "@/lib/newsShape";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { mediaUrlOf, tagVal } from "@/components/search/cards";

function ago(created_at: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - created_at);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(created_at * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;
// Splits out both web links and nostr mention URIs so each renders as its
// clickable self — a domain chip, or the mentioned PERSON.
const TOKEN_SPLIT_RE = /(https?:\/\/\S+|nostr:n(?:pub|profile)1[02-9ac-hj-np-z]+)/gi;

/** What kind of thing a result is — the Google-style micro label. */
export function kindTypeLabel(kind: number): string {
  switch (kind) {
    case 0: return "Person";
    case 1: case 11: return "Note";
    case 1111: return "Comment";
    case 30023: case 30024: case 30040: case 30041: return "Article";
    case 30818: return "Wiki";
    case 20: return "Photo";
    case 21: case 22: case 34235: case 34236: return "Video";
    case 1063: return "File";
    case 1222: return "Audio";
    case 30311: return "Live";
    case 30312: case 30313: return "Space";
    case 31922: case 31923: case 31924: return "Event";
    case 30617: return "Repo";
    case 32267: return "App";
    case 30063: return "Release";
    case 1617: return "Patch";
    case 1618: case 1621: return "Issue";
    case 1337: return "Code";
    case 10003: case 10015: case 30001: case 30003: case 30015: case 30267: case 39701: return "List";
    default: return "Post";
  }
}

function mentionPubkey(uri: string): string | null {
  try {
    const decoded = nip19.decode(uri.slice("nostr:".length).toLowerCase());
    if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data;
    if (decoded.type === "nprofile") return (decoded.data as { pubkey: string }).pubkey;
  } catch {
    /* not decodable — render as plain text */
  }
  return null;
}

type MentionProfile = { name?: string; display_name?: string; picture?: string };

function profileFromStore(pubkey: string): MentionProfile | null {
  const known = eventStore.getReplaceable(0, pubkey);
  if (!known) return null;
  try {
    const parsed = JSON.parse(known.content);
    return parsed && typeof parsed === "object" ? (parsed as MentionProfile) : null;
  } catch {
    return null;
  }
}

/** A nostr: mention rendered as the person — avatar + @name → their profile. */
function MentionChip({ uri }: { uri: string }) {
  const pubkey = mentionPubkey(uri);
  const [profile, setProfile] = useState<MentionProfile | null>(() =>
    pubkey ? profileFromStore(pubkey) : null,
  );
  useEffect(() => {
    if (!pubkey || profile) return;
    let alive = true;
    void fetchProfileMap([pubkey]).then((map) => {
      if (alive && map.get(pubkey)) setProfile(map.get(pubkey) as MentionProfile);
    });
    return () => {
      alive = false;
    };
  }, [pubkey, profile]);

  if (!pubkey) return <span>{uri}</span>;
  const npub = nip19.npubEncode(pubkey);
  const name = profile?.display_name || profile?.name || `${npub.slice(0, 10)}…`;
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Link
        href={`/p/${npub}`}
        className="inline-flex max-w-full items-center gap-1 align-middle rounded-md bg-brand-primary/5 dark:bg-brand-primary/15 px-1.5 py-0.5 text-[13px] font-medium text-brand-link no-underline hover:bg-brand-primary/10 dark:hover:bg-brand-primary/25 transition-colors"
        data-testid="mention-chip"
      >
        {profile?.picture && (
          <img src={profile.picture} alt="" loading="lazy" className="h-3.5 w-3.5 shrink-0 rounded-full object-cover" />
        )}
        <span className="truncate">@{name}</span>
      </Link>
    </span>
  );
}

/** Bold the query terms in a run of plain text. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightTerms(text, query).map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="bg-transparent font-semibold text-slate-900 dark:text-white">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/** Snippet where bare URLs become clickable domain chips. */
export function Snippet({ text, query, lines = 3 }: { text: string; query: string; lines?: 2 | 3 }) {
  const parts = text.split(TOKEN_SPLIT_RE);
  return (
    <p className={`text-[13px] leading-snug text-slate-700 dark:text-slate-200 break-words ${lines === 2 ? "line-clamp-2" : "line-clamp-3"}`}>
      {parts.map((part, i) => {
        if (/^https?:\/\//i.test(part)) {
          // Chips are real external links — clicks belong to them, not the row.
          return (
            <span key={i} onClick={(e) => e.stopPropagation()}>
              <LinkChip url={part} />
            </span>
          );
        }
        if (/^nostr:/i.test(part)) return <MentionChip key={i} uri={part} />;
        return <Marked key={i} text={part} query={query} />;
      })}
    </p>
  );
}

function AuthorLine({
  author,
  score,
  created_at,
  type,
}: {
  author: SearchResult | null;
  score?: number | null;
  created_at: number;
  type?: string;
}) {
  const tierRing = useTierRing();
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Avatar className={`h-5 w-5 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null) ?? ""}`}>
        {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
        {author ? getDisplayLabel(author) : "Unknown"}
      </span>
      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">· {ago(created_at)}</span>
      {type && (
        <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500" data-testid="serp-type">
          · {type}
        </span>
      )}
    </div>
  );
}

export function SerpRow({
  event,
  author,
  score,
  query,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  query: string;
}) {
  const [, setLocation] = useLocation();
  const open = useCallback(() => setLocation(eventPath(event)), [event, setLocation]);

  const title = tagVal(event, "title") ?? tagVal(event, "name");
  const news = !title && event.content ? parseNewsShape(event.content) : null;

  const rowProps = {
    role: "link" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    },
    className:
      "group flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
    "data-testid": `serp-row-${event.id}`,
  };

  if (news) {
    const thumb = news.imageUrl ?? tagVal(event, "image") ?? null;
    return (
      <div {...rowProps}>
        <div className="min-w-0 flex-1">
          {/* Source line — the outlet, Google-News style. The poster's
              identity (and tier ring) still leads; the domain says where
              the story lives. */}
          <div className="flex items-center gap-1.5 min-w-0" data-testid="news-source">
            <AuthorLine author={author} score={score} created_at={event.created_at} type="News" />
            <span className="hidden sm:inline-flex items-center gap-1 min-w-0 text-[11px] text-slate-400 dark:text-slate-500">
              ·
              <Favicon host={news.domain} className="h-3 w-3 rounded-sm shrink-0 object-contain" />
              <span className="truncate">{news.domain}</span>
            </span>
          </div>
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 block text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100 hover:text-brand-primary hover:underline transition-colors break-words line-clamp-2"
            data-testid="news-headline"
          >
            <Marked text={news.headline} query={query} />
          </a>
          {news.description && (
            <div className="mt-1 [&>p]:text-slate-600 dark:[&>p]:text-slate-300">
              <Snippet text={news.description} query={query} lines={2} />
            </div>
          )}
        </div>
        {thumb && (
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
            tabIndex={-1}
          >
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="h-20 w-28 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shadow-sm"
              data-testid="news-thumb"
            />
          </a>
        )}
      </div>
    );
  }

  const body = event.content || tagVal(event, "summary") || tagVal(event, "description") || "";
  const url = mediaUrlOf(event);
  const thumb = url && IMAGE_RE.test(url) ? url : (tagVal(event, "image") ?? null);
  return (
    <div {...rowProps}>
      <div className="min-w-0 flex-1">
        <AuthorLine author={author} score={score} created_at={event.created_at} type={kindTypeLabel(event.kind)} />
        {title && (
          <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-primary transition-colors [&>p]:font-semibold [&>p]:text-sm">
            <Snippet text={title} query={query} lines={2} />
          </div>
        )}
        {body && (
          <div className="mt-0.5">
            <Snippet text={body.slice(0, 300)} query={query} lines={title ? 2 : 3} />
          </div>
        )}
      </div>
      {thumb && (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-xl object-cover bg-slate-100 dark:bg-slate-800"
        />
      )}
    </div>
  );
}
