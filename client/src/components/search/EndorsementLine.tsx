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
import { AlertTriangle, BadgeCheck, Heart, MessageSquareText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorFlags } from "@/hooks/useAuthorFlags";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useMyFollows } from "@/hooks/useMyFollows";
import { usePersonEndorsements } from "@/hooks/usePersonEndorsements";
import { useProfileMap } from "@/hooks/useProfileMap";
import { compactCount } from "@/lib/compactCount";
import { getDisplayLabel } from "@/lib/profileSearch";
import {
  identityConfirmers,
  quoteFor,
  rankVouches,
  reviewsSummaryLabel,
  tidyName,
  type PersonEndorsements,
  type RankedVouch,
} from "@/services/endorsements";

/** Recommends (an endorsement) or Confirms identity (a claim: "this is really
 *  them") — quiet inline text, not a pill: the reviewer's tier chip beside it
 *  is the loud thing on the line, and the type is a footnote to it. */
export function VouchBadge({ type }: { type: "vouch" | "identity" }) {
  const Icon = type === "identity" ? BadgeCheck : Heart;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {type === "identity" ? "Confirms identity" : "Recommends"}
    </span>
  );
}

/**
 * A person's trust reviews, ranked for the viewer, with the reviewers'
 * profiles — the one hook every vouch surface reads. Memoized upstream, so a
 * card and the panel asking about the same person cost one fetch.
 */
export function useRankedVouches(e: PersonEndorsements | null) {
  const { follows } = useMyFollows();
  const vouches = e?.vouches ?? [];
  const authors = [...new Set(vouches.map((v) => v.pubkey))];
  const scoreOf = useAuthorScores(authors);
  const profiles = useProfileMap(authors.slice(0, 60));
  const ranked = rankVouches(vouches, { follows, scoreOf });
  const nameOf = (pk: string) => {
    const p = profiles.get(pk);
    return p ? tidyName(getDisplayLabel(p)) : undefined;
  };
  const pictureOf = (pk: string) => profiles.get(pk)?.picture ?? undefined;
  return { ranked, nameOf, pictureOf };
}

/** The most trusted reviewer who actually wrote words — the one worth quoting. */
export function topTrustedVouch(ranked: RankedVouch[]): (RankedVouch & { quote: string }) | null {
  for (const v of ranked) {
    if (v.group === "other") break;
    const quote = quoteFor(v.text);
    if (quote) return { ...v, quote };
  }
  return null;
}

/**
 * "Identity confirmed · 2" beside a name — only from people you follow or
 * verified accounts, and the confirmers' words ride along on hover so a
 * reader can judge the claim. Silent otherwise.
 */
export function IdentityChip({ ranked, nameOf, testId }: { ranked: RankedVouch[]; nameOf: (pk: string) => string | undefined; testId?: string }) {
  const confirmers = identityConfirmers(ranked);
  if (confirmers.length === 0) return null;
  const title = confirmers
    .map((c) => `${nameOf(c.pubkey) ?? c.pubkey.slice(0, 8) + "…"}${c.text ? `: “${quoteFor(c.text, 140) || c.text}”` : ""}`)
    .join("\n");
  return (
    <Chip size="sm" tone="brand" icon={BadgeCheck} title={title} data-testid={testId}>
      Identity confirmed{confirmers.length > 1 ? ` · ${confirmers.length}` : ""}
    </Chip>
  );
}

/** One quoted vouch as an endorsement line: the reviewer's ringed face, their
 *  words, their name and the review's type. */
export function VouchQuoteLine({
  vouch,
  nameOf,
  pictureOf,
  testId,
  linkFaces = false,
}: {
  vouch: RankedVouch & { quote: string };
  nameOf: (pk: string) => string | undefined;
  pictureOf: (pk: string) => string | undefined;
  testId?: string;
  linkFaces?: boolean;
}) {
  const name = nameOf(vouch.pubkey) ?? `${vouch.pubkey.slice(0, 8)}…`;
  return (
    <EndorsementLine
      testId={testId}
      faces={[{ pubkey: vouch.pubkey, name, picture: pictureOf(vouch.pubkey), score01: vouch.score }]}
      label={null}
      chips={<VouchBadge type={vouch.type} />}
      quote={{ text: vouch.quote, name }}
      linkFaces={linkFaces}
    />
  );
}

/**
 * The person card's one snippet slot, Google's way: a trusted trust review
 * (a vouch from someone you follow or a verified account) is the rarer,
 * stronger signal and takes the slot; "Followed by …" is the default.
 */
export function PersonCardSlot({
  pubkey,
  npub,
  personal,
  enabled = true,
  idx,
  className,
}: {
  pubkey: string;
  npub: string;
  personal: boolean;
  enabled?: boolean;
  idx: number;
  className?: string;
}) {
  const e = usePersonEndorsements(enabled ? pubkey : null, personal);
  const { ranked, nameOf, pictureOf } = useRankedVouches(e);
  const top = topTrustedVouch(ranked);
  if (!e) return null;
  if (top) {
    return (
      <div className={className}>
        <VouchQuoteLine vouch={top} nameOf={nameOf} pictureOf={pictureOf} testId={`person-vouch-${idx}`} />
      </div>
    );
  }
  return <FollowedByView e={e} npub={npub} personal={personal} testId={`person-followed-by-${idx}`} className={className} />;
}

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
  return <FollowedByView e={e} npub={npub} personal={personal} testId={testId} className={className} />;
}

function FollowedByView({
  e,
  npub,
  personal,
  testId,
  className,
}: {
  e: PersonEndorsements | null;
  npub: string;
  personal: boolean;
  testId?: string;
  className?: string;
}) {
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

/**
 * The knowledge panel's trust-reviews block: the most trusted vouch quoted
 * and the way to the full list on the person page. The identity chip lives
 * beside the name (PanelIdentityChip) — same hook, one fetch.
 */
export function PanelVouches({ pubkey, npub, personal }: { pubkey: string; npub: string; personal: boolean }) {
  const e = usePersonEndorsements(pubkey, personal);
  const { ranked } = useRankedVouches(e);
  const n = e?.vouches?.length ?? 0;
  if (n === 0) return null;
  // The same plain sentence the person page collapses to — and the way there.
  const label = reviewsSummaryLabel({
    total: n,
    followed: ranked.filter((v) => v.group === "followed").length,
    verified: ranked.filter((v) => v.group === "verified").length,
  });
  return (
    <Link
      href={`/p/${npub}#trust-reviews`}
      className="group mt-2.5 inline-flex items-center gap-2 rounded-md text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid="person-reviews-link"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        <MessageSquareText className="h-3 w-3" aria-hidden />
      </span>
      <span>{label}</span>
      <span className="text-brand-primary opacity-0 transition-opacity group-hover:opacity-100">→</span>
    </Link>
  );
}

/** The identity chip for any surface that knows only the pubkey — the panel
 *  beside the name, the person page beside the name. Same hook, one fetch. */
export function PanelIdentityChip({ pubkey, personal, testId = "person-identity" }: { pubkey: string; personal: boolean; testId?: string }) {
  const e = usePersonEndorsements(pubkey, personal);
  const { ranked, nameOf } = useRankedVouches(e);
  return <IdentityChip ranked={ranked} nameOf={nameOf} testId={testId} />;
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
