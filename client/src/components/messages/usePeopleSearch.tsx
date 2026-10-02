/**
 * Finding people to message: the same kind-0 search the SearchBox runs (the
 * search relay, ranked through the reader's Perspective), debounced the same
 * way. Shared by the New message "To" field and the Messages search, so
 * someone the reader hasn't written to yet is one tap from a chat.
 *
 * A name is only a claim, so a row carries the person's trust coin and shows a
 * NIP-05 only once its domain confirms it.
 */
import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useSearchPov } from "@/hooks/useSearchPov";
import { useNip05 } from "@/hooks/useNip05";
import { suggestProfiles } from "@/services/search";
import { typeaheadPause, type SearchResult } from "@/lib/profileSearch";
import { useConnectionSpeed } from "@/lib/connection";
import { decodeShareId, isNip05 } from "@/lib/shareId";
import { PersonAvatar, shortNpub } from "./people";

/** A query that names one person directly (npub, nprofile, hex, NIP-05) isn't a name search. */
export function isAddressQuery(q: string): boolean {
  return !!decodeShareId(q)?.pubkey || isNip05(q);
}

export function usePeopleSearch(
  query: string,
  me: string,
  { limit = 20, enabled = true }: { limit?: number; enabled?: boolean } = {},
): { people: SearchResult[]; searching: boolean } {
  const typed = query.trim();
  const active = enabled && typed.length >= 2 && !isAddressQuery(typed);
  const { effectivePov } = useSearchPov();
  const speed = useConnectionSpeed();
  const [result, setResult] = useState<{ query: string; people: SearchResult[] } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!active) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const abort = new AbortController();
    const t = setTimeout(() => {
      suggestProfiles(typed, { pov: effectivePov, userPubkey: me || undefined }, { limit, signal: abort.signal })
        .then((people) => !abort.signal.aborted && setResult({ query: typed, people }))
        .catch(() => undefined)
        .finally(() => !abort.signal.aborted && setSearching(false));
    }, typeaheadPause(speed));
    return () => {
      clearTimeout(t);
      abort.abort();
    };
  }, [active, typed, effectivePov, me, speed, limit]);

  // Only answers for what is typed now; never a stale list under a new query.
  const people = active && result?.query === typed ? result.people.filter((r) => r.pubkey !== me) : [];
  return { people, searching: active && searching };
}

export function personLabel(r: SearchResult): string {
  return (r.displayName || r.name || "").trim() || shortNpub(r.pubkey);
}

/** A claimed NIP-05, shown only once its domain confirms it; the npub otherwise. */
export function VerifiedHandle({ nip05, pubkey }: { nip05?: string; pubkey: string }) {
  const status = useNip05(nip05, pubkey);
  if (!nip05 || status !== "verified")
    return <span className="truncate font-mono text-xs text-slate-500">{shortNpub(pubkey)}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1 truncate font-mono text-xs text-slate-500">
      <BadgeCheck className="h-3 w-3 shrink-0 text-teal-600 dark:text-teal-400" />
      <span className="truncate">{nip05.replace(/^_@/, "")}</span>
    </span>
  );
}

/** One person from the network search: face with trust coin, name, verified handle. */
export function NetworkPersonRow({
  person,
  follows,
  size = 40,
  trailing,
}: {
  person: SearchResult;
  follows?: boolean;
  size?: number;
  trailing?: React.ReactNode;
}) {
  return (
    <>
      <PersonAvatar
        pubkey={person.pubkey}
        profiles={new Map([[person.pubkey, { picture: person.picture }]])}
        score={person.wotRank ?? undefined}
        size={size}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-semibold">{personLabel(person)}</span>
        <VerifiedHandle nip05={person.nip05} pubkey={person.pubkey} />
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {follows && (
          <Chip tone="slate" size="sm">
            You follow
          </Chip>
        )}
        {trailing}
      </span>
    </>
  );
}
