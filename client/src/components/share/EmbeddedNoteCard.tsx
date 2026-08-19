import { type MouseEvent } from "react";
import { useLocation } from "wouter";
import { BadgeCheck, MessageSquare } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { NoteContent } from "@/components/share/NoteContent";
import { VerificationCoin, useTierRing } from "@/components/score/VerificationCoin";
import { npubFromPubkey } from "@/lib/shareId";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { analyzeNote, type MinimalEvent } from "@/lib/noteRefs";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 2592000)}mo`;
}

/**
 * Compact embedded note — the quoted or reposted note shown inside a share-page
 * note card, with its author's avatar + name (Primal-style). Links to the
 * author's share page. Truncates long content.
 */
export function EmbeddedNoteCard({
  event,
  author,
  profiles,
  href,
  trustScore01,
  showReplyContext = false,
}: {
  event: MinimalEvent;
  author?: ProfileLite;
  profiles?: Map<string, ProfileLite>;
  /** When set, clicking the card (off the inner author link) opens this path. */
  href?: string;
  /** Author's Web-of-Trust score (0–1) — renders a tier pill in the header. */
  trustScore01?: number | null;
  /** Show a "Replying to @…" line when this note is a reply (e.g. in the
   *  "More from" strip, where a bare reply reads as a cryptic standalone post).
   *  Off by default so quoted-note embeds stay uncluttered. */
  showReplyContext?: boolean;
}) {
  const tierRing = useTierRing();
  const ring = tierRing(trustScore01);
  const [, navigate] = useLocation();
  const name = author?.display_name || author?.name || "Unknown";
  let npub = "";
  try { npub = npubFromPubkey(event.pubkey); } catch { /* ignore */ }

  // Reply context (opt-in): names are plain text, not links, so the whole card
  // stays a single click target to open the thread.
  const analysis = showReplyContext ? analyzeNote(event) : null;
  const replyTargets = analysis?.isReply
    ? analysis.replyToPubkeys.filter((pk) => pk !== event.pubkey)
    : [];

  const onClick = href
    ? (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("a, button, video, [data-noopen]")) return;
        e.stopPropagation();
        navigate(href);
      }
    : undefined;

  return (
    <div
      className={`mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-3 ${href ? "cursor-pointer hover:border-slate-300 dark:hover:border-slate-700" : ""}`}
      data-testid="embedded-note"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <a href={npub ? `/p/${npub}` : undefined} className="flex items-center gap-2 min-w-0 hover:opacity-80">
          <Avatar className={`h-6 w-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${ring ?? ""}`}>
            {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{name}</span>
          {author?.nip05 && <BadgeCheck className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
        </a>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {typeof trustScore01 === "number" && Number.isFinite(trustScore01) && (
            <VerificationCoin score01={trustScore01} pov="global" size={22} className={ring ? "sr-only" : ""} />
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">{ago(event.created_at)}</span>
        </div>
      </div>
      {replyTargets.length > 0 && (
        <p className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mb-1" data-testid="embedded-reply-context">
          <MessageSquare className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
          <span>Replying to</span>
          {replyTargets.slice(0, 2).map((pk) => {
            const p = profiles?.get(pk);
            return <span key={pk} className="font-medium text-brand-link">@{p?.display_name || p?.name || "someone"}</span>;
          })}
          {replyTargets.length > 2 && <span>+{replyTargets.length - 2}</span>}
        </p>
      )}
      <div className="line-clamp-5 text-[14px]">
        <NoteContent content={event.content} compact profiles={profiles} imageOpensThread={!!href} tags={event.tags} authorName={author?.display_name || author?.name} />
      </div>
    </div>
  );
}
