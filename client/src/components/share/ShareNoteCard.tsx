import { useState, useMemo, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { Repeat2, MessageSquare } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { NoteContent } from "@/components/share/NoteContent";
import { parseNoteContent } from "@/lib/noteContent";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { useShareNav } from "@/components/share/ShareNavContext";
import { analyzeNote, addrCoord, type MinimalEvent } from "@/lib/noteRefs";
import { npubFromPubkey, eventPath } from "@/lib/shareId";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";

/**
 * Click anywhere on a card to open it, EXCEPT on real interactive descendants
 * (links, buttons, video controls, or anything marked data-noopen). Nested
 * clickable cards stopPropagation so only the innermost one fires.
 */
export function openOnCardClick(href: string | undefined, navigate: (to: string) => void) {
  if (!href) return undefined;
  return (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button, video, [data-noopen]")) return;
    e.stopPropagation();
    navigate(href);
  };
}

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

// Posts longer than this get collapsed behind a "Show more".
const LONG_NOTE_CHARS = 280;

function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 2592000)}mo ago`;
}

/** A reply-to chip: small avatar + clickable @name (opens the nav confirm). */
function ReplyTarget({ pubkey, profiles }: { pubkey: string; profiles: Map<string, ProfileLite> }) {
  const requestNav = useShareNav();
  const p = profiles.get(pubkey);
  const name = p?.display_name || p?.name || "someone";
  let npub = "";
  try { npub = npubFromPubkey(pubkey); } catch { /* ignore */ }
  return (
    <button
      type="button"
      onClick={() => requestNav({ kind: "profile", target: npub || pubkey, label: name, picture: p?.picture })}
      className="inline-flex items-center gap-1 hover:underline"
    >
      <Avatar className="h-4 w-4 rounded-full bg-white border border-slate-200">
        {p?.picture ? <AvatarImage src={p.picture} alt={name} className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
      </Avatar>
      <span className="text-indigo-600 font-medium">@{name}</span>
    </button>
  );
}

/**
 * A single note on the share page, Primal-style: reposts show the original,
 * replies show the people answered (with avatars, excluding the author),
 * mentions resolve to names, quoted notes embed, and very long posts collapse
 * behind "Show more".
 */
export function ShareNoteCard({
  event,
  profiles,
  eventsById,
  addrByCoord,
  href,
  forceExpanded = false,
  showAuthor = false,
  authorScore,
}: {
  event: MinimalEvent;
  profiles: Map<string, ProfileLite>;
  eventsById: Map<string, MinimalEvent>;
  addrByCoord?: Map<string, MinimalEvent>;
  /** When set, the whole card opens this path (e.g. the note's /e page). */
  href?: string;
  /** Show the full note with no "Show more" (used on the /e single-post view). */
  forceExpanded?: boolean;
  /** Show a clickable author header (avatar + name) — for multi-author feeds
   *  like the hashtag/topic page, where the poster isn't otherwise implied. */
  showAuthor?: boolean;
  /** Author's Web-of-Trust score (0..1) — drives the avatar's tier ring and the
   *  trust hovercard in the author header. */
  authorScore?: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [, navigate] = useLocation();
  const onCardClick = openOnCardClick(href, navigate);
  const clickable = href ? "cursor-pointer" : "";
  const a = analyzeNote(event);

  // Addressable refs (e.g. NIP-23 articles) resolved to events, deduped by coord.
  const articles: MinimalEvent[] = [];
  if (addrByCoord) {
    const seen = new Set<string>();
    for (const ad of a.addrs) {
      const key = addrCoord(ad);
      if (seen.has(key)) continue;
      seen.add(key);
      const ev = addrByCoord.get(key);
      if (ev) articles.push(ev);
    }
  }

  // Repost (kind 6/16)
  if (event.kind === 6 || event.kind === 16) {
    const inner = a.repostEvent ?? (a.repostId ? eventsById.get(a.repostId) : undefined);
    return (
      <div data-testid="note-repost" onClick={onCardClick} className={clickable}>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
          <Repeat2 className="h-3.5 w-3.5 text-emerald-600" /> Reposted
        </p>
        {inner ? (
          <EmbeddedNoteCard event={inner} author={profiles.get(inner.pubkey)} profiles={profiles} href={eventPath(inner)} />
        ) : (
          <p className="text-sm text-slate-400">Reposted a note</p>
        )}
        <p className="mt-1.5 text-xs text-slate-400">{ago(event.created_at)}</p>
      </div>
    );
  }

  // Reply targets = people replied to, excluding the note's own author (don't
  // show the profile owner replying to themselves).
  const replyTargets = a.replyToPubkeys.filter((pk) => pk !== event.pubkey);
  const quoted = a.quoteIds.map((id) => eventsById.get(id)).filter(Boolean) as MinimalEvent[];

  // Notes with media (video/image/audio) always render expanded — collapsing a
  // post behind "Show more" would cut off its video/image. Only long text-only
  // notes get the height clamp.
  const hasMedia = useMemo(
    () => parseNoteContent(event.content || "").some((t) => t.type === "image" || t.type === "video" || t.type === "audio"),
    [event.content],
  );
  const isLong = !hasMedia && (event.content?.length ?? 0) > LONG_NOTE_CHARS;
  const collapsed = isLong && !expanded && !forceExpanded;

  const authorNpub = useMemo(() => { try { return npubFromPubkey(event.pubkey); } catch { return ""; } }, [event.pubkey]);
  const authorProfile = profiles.get(event.pubkey);
  const authorName = authorProfile?.display_name || authorProfile?.name || (authorNpub ? `${authorNpub.slice(0, 10)}…` : "Someone");
  const authorHandle = authorProfile?.nip05
    ? authorProfile.nip05.replace(/^_@/, "@")
    : authorNpub ? `@${authorNpub.slice(0, 12)}…` : "";
  const authorTier = typeof authorScore === "number" ? tierForScore(authorScore) : null;
  const ringStyle = authorTier ? { boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${authorTier.ring}` } : undefined;

  return (
    <div data-testid="note-card" onClick={onCardClick} className={clickable}>
      {showAuthor && (
        <div className="mb-2.5 flex items-center gap-2.5" data-testid="note-author">
          <HoverCard openDelay={150} closeDelay={80}>
            <HoverCardTrigger asChild>
              <div
                role="link"
                tabIndex={0}
                data-noopen
                onClick={(e) => { e.stopPropagation(); if (authorNpub) navigate(`/p/${authorNpub}`); }}
                className="group/author flex min-w-0 flex-1 cursor-pointer items-center gap-2.5"
              >
                <Avatar className="h-9 w-9 shrink-0 border border-slate-200" style={ringStyle}>
                  {authorProfile?.picture ? <AvatarImage src={authorProfile.picture} alt={authorName} className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 group-hover/author:underline" data-testid="note-author-name">{authorName}</p>
                  {authorHandle && <p className="truncate text-xs text-slate-500">{authorHandle}</p>}
                </div>
              </div>
            </HoverCardTrigger>
            {authorTier && typeof authorScore === "number" && (
              <HoverCardContent align="start" className="w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" data-testid="note-author-trust">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0" style={ringStyle}>
                    {authorProfile?.picture ? <AvatarImage src={authorProfile.picture} alt={authorName} className="object-cover" /> : null}
                    <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{authorName}</p>
                    {authorHandle && <p className="truncate text-xs text-slate-500">{authorHandle}</p>}
                  </div>
                </div>
                <div
                  className="mt-3 flex items-center gap-3 rounded-xl border p-2.5"
                  style={{ borderColor: `${authorTier.color}40`, backgroundColor: `${authorTier.color}0d` }}
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-base font-bold tabular-nums"
                    style={{ color: authorTier.color, backgroundColor: `${authorTier.color}1a` }}
                  >
                    {Math.round(authorScore * 100)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight" style={{ color: authorTier.color }}>{authorTier.name}</p>
                    <p className="text-[11px] text-slate-500">Web of Trust score</p>
                  </div>
                </div>
                <p className="mt-2.5 text-[11px] leading-snug text-slate-400">Ranked into this topic by trusted accounts — not follower counts.</p>
              </HoverCardContent>
            )}
          </HoverCard>
          <span className="ml-auto shrink-0 text-xs text-slate-400">{ago(event.created_at)}</span>
        </div>
      )}
      {a.isReply && replyTargets.length > 0 && (
        <p className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-xs text-slate-500 mb-1.5" data-testid="note-reply-context">
          <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
          <span>Replying to</span>
          {replyTargets.slice(0, 3).map((pk) => (
            <ReplyTarget key={pk} pubkey={pk} profiles={profiles} />
          ))}
          {replyTargets.length > 3 && <span className="text-slate-400">+{replyTargets.length - 3}</span>}
        </p>
      )}

      <div className={collapsed ? "relative max-h-32 overflow-hidden" : undefined}>
        <NoteContent content={event.content} compact profiles={profiles} linkCard imageOpensThread={!!href} tags={event.tags} authorName={profiles.get(event.pubkey)?.display_name || profiles.get(event.pubkey)?.name} />
        {collapsed && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {isLong && !forceExpanded && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-[#3730a3] hover:underline"
          data-testid="note-show-more"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {quoted.map((qe) => (
        <EmbeddedNoteCard key={qe.id} event={qe} author={profiles.get(qe.pubkey)} profiles={profiles} href={eventPath(qe)} />
      ))}

      {articles.map((ae) => (
        <EmbeddedArticleCard key={ae.id} event={ae} author={profiles.get(ae.pubkey)} />
      ))}

      {!showAuthor && <p className="mt-1.5 text-xs text-slate-400">{ago(event.created_at)}</p>}
    </div>
  );
}
