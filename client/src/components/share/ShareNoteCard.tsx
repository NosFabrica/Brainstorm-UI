import { useState, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { Repeat2, MessageSquare } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { NoteContent } from "@/components/share/NoteContent";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { useShareNav } from "@/components/share/ShareNavContext";
import { analyzeNote, addrCoord, type MinimalEvent } from "@/lib/noteRefs";
import { npubFromPubkey, eventPath } from "@/lib/shareId";
import { initialsFor } from "@/lib/profileDefaults";

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
        <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-bold">{initialsFor(name)}</AvatarFallback>
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
}: {
  event: MinimalEvent;
  profiles: Map<string, ProfileLite>;
  eventsById: Map<string, MinimalEvent>;
  addrByCoord?: Map<string, MinimalEvent>;
  /** When set, the whole card opens this path (e.g. the note's /e page). */
  href?: string;
  /** Show the full note with no "Show more" (used on the /e single-post view). */
  forceExpanded?: boolean;
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

  const isLong = (event.content?.length ?? 0) > LONG_NOTE_CHARS;
  const collapsed = isLong && !expanded && !forceExpanded;

  return (
    <div data-testid="note-card" onClick={onCardClick} className={clickable}>
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
        <NoteContent content={event.content} compact profiles={profiles} linkCard />
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

      <p className="mt-1.5 text-xs text-slate-400">{ago(event.created_at)}</p>
    </div>
  );
}
