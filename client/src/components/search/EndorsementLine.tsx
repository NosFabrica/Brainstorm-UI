/**
 * Google's "shared endorsement" beat, on Nostr: a few trusted faces, one line
 * of who said what, the numbers as chips, and — when the most trusted voice
 * left words — one quote. Nostr has no star rating, so the tier ring on each
 * face IS the rating. Faces render as spans by default because this line
 * usually sits inside a card that is itself a link; the app page passes
 * `linkFaces` to make each face a profile link.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";

export interface EndorsementFace {
  pubkey: string;
  name?: string;
  picture?: string;
  score01: number | null;
}

export function EndorsementLine({
  faces,
  label,
  chips,
  quote,
  linkFaces = false,
  testId,
}: {
  faces: EndorsementFace[];
  label: string | null;
  chips?: ReactNode;
  quote?: { text: string; name: string; testId?: string } | null;
  linkFaces?: boolean;
  testId?: string;
}) {
  const tierRing = useTierRing();
  const shown = faces.slice(0, 3);
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {shown.length > 0 && (
          <span className="flex -space-x-1">
            {shown.map((f) => {
              const avatar = (
                <Avatar
                  key={f.pubkey}
                  data-face={f.pubkey}
                  className={`h-5 w-5 rounded-full bg-white dark:bg-slate-900 ${tierRing(f.score01, false, "sm", true) ?? "ring-2 ring-white dark:ring-slate-900"}`}
                >
                  {f.picture ? <AvatarImage src={f.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden rounded-full">
                    <DefaultAvatarImg />
                  </AvatarFallback>
                </Avatar>
              );
              if (!linkFaces) return avatar;
              let npub = "";
              try {
                npub = nip19.npubEncode(f.pubkey);
              } catch {
                return avatar;
              }
              return (
                <Link key={f.pubkey} href={`/p/${npub}`} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40">
                  {avatar}
                </Link>
              );
            })}
          </span>
        )}
        {label && <span className="min-w-0">{label}</span>}
        {chips}
      </div>
      {quote && (
        <p className="truncate text-xs italic text-slate-600 dark:text-slate-300" data-testid={quote.testId}>
          “{quote.text}” <span className="not-italic text-slate-400 dark:text-slate-500">— {quote.name}</span>
        </p>
      )}
    </div>
  );
}
