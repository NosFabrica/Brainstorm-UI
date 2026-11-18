import { useMemo } from "react";
import { UserCheck } from "lucide-react";
import { PersonCard } from "@/components/search/PersonCard";
import { useCompromised } from "@/hooks/useCompromised";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import type { SearchResult } from "@/lib/profileSearch";
import { npubFromPubkey } from "@/lib/shareId";

/**
 * In a list of people, above a Compromised account's row: the owner's new
 * account, as a person card of its own, set apart in green.
 *
 * It is put there and not left to the ranking, because the ranking has it
 * backwards for now: the old account carries years of followers and score,
 * the new one has neither and may not be indexed at all. So the row a reader
 * should pick comes first, and says why it is there.
 */
export function NewAccountResult({
  compromisedPubkey,
  pov,
  onOpen,
}: {
  compromisedPubkey: string;
  pov: "nosfabrica" | "mywot";
  onOpen: (result: SearchResult) => void;
}) {
  const successor = useCompromised(compromisedPubkey)?.successorPubkey ?? null;
  const { profile } = useLiveProfile(successor ?? undefined);
  const result = useMemo<SearchResult | null>(
    () =>
      successor
        ? {
            pubkey: successor,
            npub: npubFromPubkey(successor),
            name: profile?.name,
            displayName: profile?.display_name,
            picture: profile?.picture,
            about: profile?.about,
            nip05: profile?.nip05,
            website: profile?.website,
            lud16: profile?.lud16,
            wotRank: null,
          }
        : null,
    [successor, profile],
  );
  if (!result) return null;
  return (
    <div
      className="mb-2 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-1.5 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-950/30"
      data-testid="new-account-result"
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        The owner's new account
        <span className="font-medium normal-case tracking-normal text-emerald-800/75 dark:text-emerald-200/70">
          · replaces the compromised account below
        </span>
      </p>
      <PersonCard result={result} idx="new-account" pov={pov} onOpen={onOpen} />
    </div>
  );
}
