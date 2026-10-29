import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { nameOf as profileName, type Profiles } from "@/components/messages/people";
import { personLabel, usePeopleSearch } from "@/components/messages/usePeopleSearch";
import type { AssistantActions } from "@/hooks/useAssistantActions";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { resolveNip05 } from "@/lib/nip05";
import { decodeShareId, isNip05 } from "@/lib/shareId";
import { PersonLine, TagButtons, UnavailableNote, type TagAvailability } from "./shared";

const NIP05_PAUSE_MS = 300;

/**
 * Find a profile to tag as an Assistant: the people search New message runs
 * (the search relay, ranked through the reader's Perspective), and a key or
 * NIP-05 typed in full looked up directly and offered first. Anyone already in
 * the reader's list is left out — their row has its own actions.
 */
export function AssistantSearch({
  viewer,
  listed,
  actions,
  unavailable,
}: {
  viewer: string;
  listed: ReadonlySet<string>;
  actions: AssistantActions;
  unavailable: TagAvailability;
}) {
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const { people, searching } = usePeopleSearch(typed, viewer, { limit: 10 });

  const direct = decodeShareId(typed)?.pubkey ?? null;
  const [resolved, setResolved] = useState<{ handle: string; pubkey: string | null } | null>(null);
  useEffect(() => {
    if (!isNip05(typed)) return;
    let alive = true;
    const t = setTimeout(() => {
      resolveNip05(typed)
        .catch(() => null)
        .then((pubkey) => alive && setResolved({ handle: typed, pubkey }));
    }, NIP05_PAUSE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [typed]);
  const resolving = isNip05(typed) && resolved?.handle !== typed;
  const exact = direct ?? (resolved?.handle === typed ? resolved.pubkey : null);
  const exactKeys = useMemo(() => (exact ? [exact] : []), [exact]);
  const exactProfiles = useLiveProfiles(exactKeys);

  const { candidates, profiles } = useMemo(() => {
    const profiles: Profiles = new Map(exactProfiles);
    const candidates: { pubkey: string; name: string }[] = [];
    const offer = (pubkey: string, name: string) => {
      if (pubkey === viewer || listed.has(pubkey) || candidates.some((c) => c.pubkey === pubkey)) return;
      candidates.push({ pubkey, name });
    };
    if (exact) offer(exact, profileName(exact, exactProfiles));
    for (const person of people) {
      profiles.set(person.pubkey, {
        picture: person.picture,
        display_name: person.displayName,
        name: person.name,
        nip05: person.nip05,
        website: person.website,
      });
      offer(person.pubkey, personLabel(person));
    }
    return { candidates, profiles };
  }, [exact, exactProfiles, people, viewer, listed]);

  const status =
    typed.length < 2
      ? null
      : searching || resolving
        ? "Searching…"
        : candidates.length
          ? `${candidates.length} untagged ${candidates.length === 1 ? "profile" : "profiles"}`
          : "No untagged profile matches.";

  return (
    <section className="space-y-3 border-b border-border px-5 py-4" data-testid="assistant-search">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Find a profile to tag as an Assistant
      </h3>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, NIP-05 or npub"
          aria-label="Find a profile to tag as an Assistant"
          className="pl-9"
          data-testid="input-assistant-search"
        />
      </div>
      {status && (
        <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
          {status}
        </p>
      )}
      {candidates.length > 0 && (
        <>
          <UnavailableNote unavailable={unavailable} />
          <ul aria-label="Profiles you can tag" className="divide-y divide-border">
            {candidates.map(({ pubkey, name }) => (
              <li key={pubkey} className="space-y-2 py-3" data-testid="row-assistant-candidate">
                <PersonLine pubkey={pubkey} name={name} profiles={profiles} size={36} />
                <div className="flex flex-wrap gap-2 pl-12">
                  <TagButtons pubkey={pubkey} name={name} actions={actions} unavailable={unavailable} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
