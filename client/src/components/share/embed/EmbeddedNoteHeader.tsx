import type { MouseEvent } from "react";
import { Link } from "wouter";
import { BadgeCheck, MessageSquare } from "lucide-react";
import { CompromisedMark } from "@/components/compromised/CompromisedMark";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VerificationCoin } from "@/components/score/VerificationCoin";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";
import { Chip } from "@/components/ui/chip";
import { namesItsKind } from "@/lib/embedShape";
import { kindLabel } from "@/lib/kindLabel";
import type { MinimalEvent } from "@/lib/noteRefs";

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
 * A quoted note's author line — face, name, a check for a verified NIP-05, its
 * kind when it is not a note, the author's coin and its age (a link to its page
 * when it has one) — and, when asked, who it replies to. The card reads the
 * author's ring and score; this draws them.
 */
export function EmbeddedNoteHeader({
  event,
  author,
  npub,
  ring,
  nip05Verified,
  score01,
  coinReplaced,
  href,
  replyTargets,
  profiles,
}: {
  event: MinimalEvent;
  author?: ProfileLite;
  npub: string;
  ring: string | null;
  nip05Verified: boolean;
  score01: number | null | undefined;
  coinReplaced: boolean;
  href?: string;
  replyTargets: string[];
  profiles?: Map<string, ProfileLite>;
}) {
  const name = author?.display_name || author?.name || "Unknown";
  return (
    <>
      <div className="mb-1.5 flex items-center gap-2">
        <a href={npub ? `/p/${npub}` : undefined} className="flex min-w-0 items-center gap-2 hover:opacity-80">
          <Avatar
            className={`h-6 w-6 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${ring ?? ""}`}
          >
            {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden rounded-full">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            <ProfileEmojiText pubkey={event.pubkey} text={name} />
          </span>
          {nip05Verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
          <CompromisedMark pubkey={event.pubkey} />
        </a>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {namesItsKind(event.kind) && (
            <Chip tone="slate" size="sm" className="shrink-0" data-testid="embedded-kind">
              {kindLabel(event)}
            </Chip>
          )}
          {typeof score01 === "number" && Number.isFinite(score01) && (
            <VerificationCoin
              score01={score01}
              pov="global"
              size={22}
              className={ring && coinReplaced ? "sr-only" : ""}
            />
          )}
          {href ? (
            // The card's way to its page from the keyboard: a link of its own, never one around the card's links.
            <Link
              href={href}
              onClick={(e: MouseEvent) => e.stopPropagation()}
              aria-label={`Open this ${kindLabel(event).toLowerCase()}`}
              className="rounded text-xs text-slate-400 hover:text-slate-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-500 dark:hover:text-slate-300"
              data-testid="embedded-open"
            >
              {ago(event.created_at) || "Open"}
            </Link>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">{ago(event.created_at)}</span>
          )}
        </div>
      </div>
      {replyTargets.length > 0 && (
        <p
          className="mb-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400"
          data-testid="embedded-reply-context"
        >
          <MessageSquare className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
          <span>Replying to</span>
          {replyTargets.slice(0, 2).map((pk) => {
            const p = profiles?.get(pk);
            return (
              <span key={pk} className="font-medium text-brand-link">
                @{p?.display_name || p?.name || "someone"}
              </span>
            );
          })}
          {replyTargets.length > 2 && <span>+{replyTargets.length - 2}</span>}
        </p>
      )}
    </>
  );
}
