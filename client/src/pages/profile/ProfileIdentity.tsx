/**
 * The top of the analytics profile: the cover banner, then the avatar, name,
 * handle, npub, the X-style counts and an action bar, with the Web of Trust
 * card beside them (inline on a phone).
 */
import { useState, type ReactNode } from "react";
import type { NostrEvent } from "nostr-tools";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { DegreeChip } from "@/components/DegreeChip";
import { HandleOwnerWarning, Nip05Handle } from "@/components/Nip05Check";
import { useTierRing } from "@/components/score/VerificationCoin";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmojiText } from "@/components/ui/custom-emoji";
import { copyToClipboard } from "@/lib/clipboard";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC } from "@/lib/profileDefaults";
import { publicOrigin } from "@/lib/publicOrigin";
import { nameIn } from "@/lib/displayName";

/** X-style stat numbers: full under 10k ("1,234"), compact above ("114K"). */
export function fmtStat(n: number): string {
  return n >= 10000
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : n.toLocaleString();
}

/** The cover banner, or the house default — matches the public /p page. */
export function ProfileCoverBanner({ banner }: { banner: string | undefined }) {
  return (
    <>
      {/* Cover banner — matches the public /p page; fills the top space. */}
      <div className="relative h-24 w-full sm:h-32">
        {banner ? (
          <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className={`absolute inset-0 ${DEFAULT_BANNER_CLASS}`}>
            <img src={DEFAULT_BANNER_SRC} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/30 via-brand-accent-hover/20 to-brand-deep/40 mix-blend-multiply" />
          </div>
        )}
      </div>
    </>
  );
}

export function ProfileIdentity({
  displayNostrProfile,
  isOwnAssistant,
  avatarScore,
  displayNpub,
  emojiTags,
  hexPubkey,
  npubParam,
  verifiedCounts,
  mutualCount,
  degreeFrom,
  theyFollowMe,
  actions,
  trustBadge,
}: {
  displayNostrProfile: ProfileContent | null;
  isOwnAssistant: boolean;
  avatarScore: number | null | undefined;
  displayNpub: string;
  emojiTags: NostrEvent | undefined;
  hexPubkey: string;
  npubParam: string;
  verifiedCounts: { followingTotal: number; followersTotal: number };
  mutualCount: number;
  degreeFrom: string | null;
  theyFollowMe: boolean;
  actions: ReactNode;
  trustBadge: ReactNode;
}) {
  const tierRing = useTierRing();
  const [copied, setCopied] = useState(false);
  const handleCopyNpub = async (text: string) => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <>
      {/* Avatar overlaps the banner on its own line, so the name, npub,
                    stats and actions below all share one left edge (like /p). */}
      {(() => {
        const assistantDefaultPicture = `${publicOrigin()}/assistant-default.webp`;
        const effectivePicture = displayNostrProfile?.picture || (isOwnAssistant ? assistantDefaultPicture : undefined);
        return (
          <Avatar
            className={`-mt-12 h-20 w-20 shrink-0 rounded-full border-4 border-white bg-white shadow-lg dark:border-slate-900 dark:bg-slate-900 sm:-mt-16 sm:h-24 sm:w-24 ${tierRing(avatarScore) ?? ""}`}
          >
            <AvatarImage
              size="lg"
              src={effectivePicture}
              alt={nameIn(displayNostrProfile) ?? "Profile"}
              className="object-cover"
            />
            <AvatarFallback className="bg-brand-primary/10 text-base font-bold text-brand-primary dark:bg-brand-primary/10 dark:text-brand-link sm:text-lg">
              {(nameIn(displayNostrProfile) || displayNpub.slice(0, 2)).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        );
      })()}
      {/* Two-column hero — identity + stats + actions on the left, the
                    Web of Trust card as a top-aligned right sidebar (desktop),
                    matching the public /p page. */}
      <div className="mt-2.5 md:flex md:items-start md:gap-6">
        <div className="min-w-0 md:flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3
                className="w-full truncate text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:w-auto sm:text-xl"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-profile-title"
              >
                <EmojiText text={nameIn(displayNostrProfile) || displayNpub.slice(0, 18) + "..."} tags={emojiTags} />
              </h3>
              <Nip05Handle
                nip05={displayNostrProfile?.nip05}
                pubkey={hexPubkey}
                className="inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-sm"
                iconClassName="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-brand-primary"
                testId="text-profile-nip05"
              />
              {isOwnAssistant && (
                <Badge
                  variant="secondary"
                  className="self-center border border-brand-accent/30 bg-brand-accent/10 text-[10px] font-bold uppercase tracking-wider text-brand-deep"
                  data-testid="badge-brainstorm-assistant"
                  title="This is your Brainstorm Assistant — a bot that publishes your scores to Nostr."
                >
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-accent" />
                  Brainstorm Assistant
                </Badge>
              )}
            </div>
            {/* Someone else's handle on this profile: often a copy of theirs. */}
            <HandleOwnerWarning nip05={displayNostrProfile?.nip05} pubkey={hexPubkey} className="mt-1.5" />
            <div className="mt-1.5 flex items-center gap-1.5">
              <code
                className="max-w-[120px] truncate font-mono text-xs text-slate-400 dark:text-slate-500 sm:max-w-[300px]"
                data-testid="text-profile-npub"
              >
                {displayNpub}
              </code>
              <button
                onClick={() => void handleCopyNpub(displayNpub)}
                className="shrink-0 p-0.5 text-slate-400 transition-colors hover:text-brand-primary dark:text-slate-500"
                data-testid="button-copy-profile-npub"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            {/* Web of Trust — mobile inline; on desktop it renders in the right sidebar. */}
            <div className="mt-3 md:hidden">{trustBadge}</div>
          </div>
          {/* X-style inline counts — full-width so they sit on one line. */}
          <div
            className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] sm:text-sm"
            data-testid="row-profile-stats"
          >
            <span data-testid="stat-profile-following">
              <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {fmtStat(verifiedCounts.followingTotal)}
              </span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">Following</span>
            </span>
            <span data-testid="stat-profile-followers">
              <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {fmtStat(verifiedCounts.followersTotal)}
              </span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">Followers</span>
            </span>
            <span data-testid="stat-profile-mutual">
              <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmtStat(mutualCount)}</span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">Mutual</span>
            </span>
            {/* Degree (1st/2nd/3rd) — signed-in + scored viewers, not your own profile. */}
            {degreeFrom && (
              <DegreeChip
                fromPubkey={degreeFrom}
                toPubkey={hexPubkey}
                rawId={npubParam}
                pov="personalized"
                variant="bold"
              />
            )}
            {theyFollowMe && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-link dark:bg-brand-primary/10"
                data-testid="badge-follows-you"
              >
                <ArrowLeft className="h-3 w-3" /> Follows you
              </span>
            )}
          </div>
          {/* One tidy action bar — full-width, aligned with the stats above.
                    Follow is primary; the rest tuck into a "more" menu. */}
          {actions}
        </div>
        {/* Web of Trust — desktop right sidebar, top-aligned beside the identity. */}
        <div className="mt-1 hidden md:block md:w-64 md:shrink-0">{trustBadge}</div>
      </div>
    </>
  );
}
