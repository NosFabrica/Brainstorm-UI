import { useMemo } from "react";
import { UserCheck } from "lucide-react";
import { PersonCard } from "@/components/search/PersonCard";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useRetired } from "@/hooks/useRetired";
import type { SearchResult } from "@/lib/profileSearch";
import { npubFromPubkey } from "@/lib/shareId";

/**
 * In a list of people, above a Retired account's row: its owner's Current
 * account, as a person card of its own, lightly set apart.
 *
 * It is put there and not left to the ranking: two accounts share a name, and
 * the one a reader wants is the one in use. `known` is the Current account's
 * own row when the page already has it, so the card shows what that row would
 * have (its score, its followers) and the row itself steps aside.
 */
export function CurrentAccountResult({
  retiredPubkey,
  known,
  pov,
  onOpen,
}: {
  retiredPubkey: string;
  known?: SearchResult;
  pov: "nosfabrica" | "mywot";
  onOpen: (result: SearchResult) => void;
}) {
  const current = useRetired(retiredPubkey)?.currentPubkey ?? null;
  const { profile } = useLiveProfile(current && !known ? current : undefined);
  const result = useMemo<SearchResult | null>(
    () =>
      known ??
      (current
        ? {
            pubkey: current,
            npub: npubFromPubkey(current),
            name: profile?.name,
            displayName: profile?.display_name,
            picture: profile?.picture,
            about: profile?.about,
            nip05: profile?.nip05,
            website: profile?.website,
            lud16: profile?.lud16,
            wotRank: null,
          }
        : null),
    [known, current, profile],
  );
  if (!current || !result) return null;
  return (
    <div
      className="mb-2 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-1.5 dark:border-brand-accent/25 dark:bg-brand-accent/10"
      data-testid="current-account-result"
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Their current account
        <span className="font-medium normal-case tracking-normal text-slate-500 dark:text-slate-400">
          · the account below is retired
        </span>
      </p>
      <PersonCard result={result} idx="current-account" pov={pov} onOpen={onOpen} />
    </div>
  );
}
