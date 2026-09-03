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
import { AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorFlags } from "@/hooks/useAuthorFlags";
import { usePersonEndorsements } from "@/hooks/usePersonEndorsements";
import { useProfileMap } from "@/hooks/useProfileMap";
import { compactCount } from "@/lib/compactCount";
import { getDisplayLabel } from "@/lib/profileSearch";

/**
 * "Followed by alice, bob & 1.2k verified accounts" — a person's endorsement
 * line: the most trusted accounts that follow them (ringed faces), and how
 * many verified accounts do in all. Under My perspective the count is
 * "accounts you trust". Leads to the full followers list. Nothing until the
 * answer lands; nothing when nobody verified follows them.
 */
export function FollowedByLine({
  pubkey,
  npub,
  personal,
  enabled = true,
  testId,
  className,
}: {
  pubkey: string;
  npub: string;
  personal: boolean;
  enabled?: boolean;
  testId?: string;
  className?: string;
}) {
  const e = usePersonEndorsements(enabled ? pubkey : null, personal);
  const top = e?.followedBy.slice(0, 3) ?? [];
  const profiles = useProfileMap(top.map((f) => f.pubkey));
  if (!e || e.followedBy.length === 0) return null;
  const faces = top.map((f) => {
    const p = profiles.get(f.pubkey);
    return { pubkey: f.pubkey, name: p ? getDisplayLabel(p) : undefined, picture: p?.picture ?? undefined, score01: f.score01 };
  });
  const lead = faces.map((f) => f.name).filter((n): n is string => !!n).slice(0, 2);
  const total = e.total ?? e.followedBy.length;
  const others = Math.max(0, total - lead.length);
  const who = personal ? "accounts you trust" : "verified accounts";
  const label =
    lead.length === 0
      ? `Followed by ${compactCount(total)} ${who}`
      : others > 0
        ? `Followed by ${lead.join(", ")} & ${compactCount(others)} ${who}`
        : `Followed by ${lead.join(" & ")}`;
  return (
    <Link
      href={`/p/${npub}/followers`}
      onClick={(ev) => ev.stopPropagation()}
      className={`block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${className ?? ""}`}
    >
      <EndorsementLine testId={testId} faces={faces} label={label} />
    </Link>
  );
}

/** The one honest negative: a chip when the network has FLAGGED the account
 *  (verified reporters past the server's threshold, house Perspective) —
 *  never a raw report count for everyone. Silent until the answer lands. */
export function FlaggedChip({ pubkey, testId }: { pubkey: string; testId?: string }) {
  const flagged = useAuthorFlags([pubkey]);
  if (flagged(pubkey) !== true) return null;
  return (
    <Chip size="sm" tone="danger" icon={AlertTriangle} title="Reported by people the network trusts" data-testid={testId}>
      Flagged by the network
    </Chip>
  );
}

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
