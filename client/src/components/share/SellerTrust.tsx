import { DegreeChip } from "@/components/DegreeChip";
import { PersonListRow } from "@/components/PersonListRow";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useHopsOrigin } from "@/hooks/useHopsOrigin";
import { useProfile } from "@/hooks/useProfile";
import { npubFromPubkey } from "@/lib/shareId";

/**
 * The seller, as Brainstorm sees them — its part of a purchase that finishes
 * somewhere else. Their name and face, Brainstorm's rating (the house view,
 * the same for everyone, signed in or not), and how far they are from you
 * when your own network is calculated. An unrated seller says so plainly
 * rather than showing an empty coin.
 */
export function SellerTrust({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const score = useAuthorScores([pubkey])(pubkey);
  const { origin, originPov } = useHopsOrigin();
  let npub = "";
  try {
    npub = npubFromPubkey(pubkey);
  } catch {
    // A malformed key still shows as a row; it just links nowhere useful.
  }
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800" data-testid="listing-hero-seller">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Seller</p>
      <PersonListRow
        pubkey={pubkey}
        displayName={profile?.display_name || profile?.name}
        picture={profile?.picture}
        nip05={profile?.nip05}
        score={score ?? null}
        pov="global"
        meta={
          origin && origin !== pubkey && npub ? (
            <DegreeChip fromPubkey={origin} toPubkey={pubkey} rawId={npub} pov={originPov} />
          ) : undefined
        }
        testId="listing-hero-seller-row"
      />
      {score === null && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400" data-testid="listing-hero-seller-unrated">
          Brainstorm hasn't rated this seller yet — buy with care.
        </p>
      )}
    </div>
  );
}
