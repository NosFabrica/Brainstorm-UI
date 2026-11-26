import type { ReactNode } from "react";
import { Link } from "wouter";
import { CompromisedMark } from "@/components/compromised/CompromisedMark";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  VerificationCoin,
  useTierRing,
  TierWordChip,
  useCoinReplacedByRing,
} from "@/components/score/VerificationCoin";
import { Nip05Check } from "@/components/Nip05Check";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";
import { initialsFor } from "@/lib/profileDefaults";
import { VIDEO_KINDS, publishedAtOf } from "@/lib/nip71";
import type { MinimalEvent } from "@/lib/noteRefs";

function ago(ts?: number): string {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Who signed the event, heading its page: their face with its trust ring and
 * coin, their name, its date — and the ⋯ (`menu`), on the object it acts on
 * (X puts it on the post, not the page).
 */
export function EventByline({
  note,
  authorPk,
  authorNpub,
  authorName,
  profile,
  score01,
  compromisedRing,
  menu,
}: {
  note: MinimalEvent;
  authorPk: string;
  authorNpub: string;
  authorName: string;
  profile: { picture?: string; nip05?: string };
  score01: number | null;
  /** The ring a Compromised author's face wears in place of their trust ring (asked for as the page opens). */
  compromisedRing: string | null;
  menu: ReactNode;
}) {
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <Link href={authorNpub ? `/p/${authorNpub}` : "#"} className="flex min-w-0 items-center gap-2.5 hover:opacity-80">
        <span className="relative shrink-0">
          <Avatar
            className={`h-12 w-12 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${compromisedRing ?? tierRing(score01) ?? ""}`}
          >
            {profile.picture ? <AvatarImage src={profile.picture} alt={authorName} className="object-cover" /> : null}
            <AvatarFallback className="rounded-full bg-brand-primary/15 text-sm font-bold text-brand-primary">
              {initialsFor(authorName)}
            </AvatarFallback>
          </Avatar>
          {typeof score01 === "number" && Number.isFinite(score01) && (
            <VerificationCoin
              score01={score01}
              pov="global"
              size={22}
              className={
                tierRing(score01) && coinReplaced
                  ? "sr-only"
                  : "absolute -bottom-1 -right-1 rounded-full ring-2 ring-white dark:ring-slate-900"
              }
            />
          )}
        </span>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100">
              <ProfileEmojiText pubkey={authorPk} text={authorName} />
            </span>
            <Nip05Check nip05={profile.nip05} pubkey={authorPk} className="h-4 w-4 shrink-0 text-sky-500" />
            <TierWordChip score01={score01} />
            <CompromisedMark pubkey={authorPk} />
          </div>
          {/* A video says when it was published: a restored Vine's created_at is its import day. */}
          <span className="block text-[13px] text-slate-500 dark:text-slate-400" data-testid="event-date">
            {ago(VIDEO_KINDS.has(note.kind) ? publishedAtOf(note) : note.created_at)}
          </span>
        </div>
      </Link>
      {menu}
    </div>
  );
}
