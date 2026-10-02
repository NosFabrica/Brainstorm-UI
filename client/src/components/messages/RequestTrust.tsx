/**
 * Why a request sits where it does: the sender's standing in the reader's
 * web of trust, said out loud — tier, who they trust that follows the sender,
 * and the way to the full path. Requests are sorted by this already; this is
 * the sorting made visible.
 */
import { Link } from "wouter";
import { ChevronRight, Route } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/lib/tones";
import { FollowedByLine } from "@/components/search/EndorsementLine";
import { tierForScore01 } from "@/components/score/VerificationCoin";
import { TIER_LABELS } from "@/services/trustThreshold";
import { useHasMywot } from "@/hooks/useHasMywot";
import { usePersonEndorsements } from "@/hooks/usePersonEndorsements";
import { npubFromPubkey } from "@/lib/shareId";

const TIER_TONE: Record<keyof typeof TIER_LABELS, Tone> = {
  high: "emerald",
  trusted: "teal",
  neutral: "slate",
  low: "amber",
  unverified: "slate",
};

export function TierChip({ score }: { score: number | null | undefined }) {
  if (score === undefined) return null;
  if (score === null)
    return (
      <Chip tone="slate" size="sm">
        Not rated yet
      </Chip>
    );
  const tier = tierForScore01(score);
  return (
    <Chip tone={TIER_TONE[tier]} size="sm" data-testid="dm-trust-tier">
      {TIER_LABELS[tier]}
    </Chip>
  );
}

/** One line under a request row: who they trust that follows the sender. No link — the row is one. */
export function RequestTrustLine({ pubkey }: { pubkey: string }) {
  const { hasMywot } = useHasMywot();
  return (
    <FollowedByLine
      pubkey={pubkey}
      npub={npubFromPubkey(pubkey)}
      personal={hasMywot}
      link={false}
      testId="dm-request-followed-by"
      className="mt-0.5"
    />
  );
}

/** Above the Accept / Delete / Block bar: enough to decide. */
export function RequestTrustPanel({
  pubkey,
  name,
  score,
}: {
  pubkey: string;
  name: string;
  score: number | null | undefined;
}) {
  const { hasMywot } = useHasMywot();
  const npub = npubFromPubkey(pubkey);
  const endorsements = usePersonEndorsements(pubkey, hasMywot);
  return (
    <div className="flex flex-col gap-1.5" data-testid="dm-request-trust">
      <div className="flex flex-wrap items-center gap-2">
        <TierChip score={score} />
        <Link
          href={`/p/${npub}/hops`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-link hover:underline"
        >
          <Route className="h-3.5 w-3.5" /> How you're connected <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <FollowedByLine pubkey={pubkey} npub={npub} personal={hasMywot} />
      {endorsements && endorsements.followedBy.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {hasMywot ? `No one you trust follows ${name}.` : `No verified account follows ${name}.`}
        </p>
      )}
    </div>
  );
}
