/**
 * Starting a chat. As the reader types, people come from their follows first,
 * then from the same kind-0 people search the SearchBox runs (the search
 * relay, ranked through the reader's Perspective); a pasted npub / nprofile /
 * NIP-05 address resolves to one person. A name is only a claim, so network
 * results carry their trust coin and show a NIP-05 only once it verifies.
 *
 * Everyone picked is checked for an inbox relay list (kind 10050): without one
 * they cannot receive NIP-17 messages, and we don't send somewhere they never
 * chose.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Gift, Inbox, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { useMyFollows } from "@/hooks/useMyFollows";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import type { SearchResult } from "@/lib/profileSearch";
import { NetworkPersonRow, usePeopleSearch } from "./usePeopleSearch";
import { decodeShareId, isNip05 } from "@/lib/shareId";
import { resolveNip05 } from "@/lib/nip05";
import { loadDmRelays } from "@/lib/dm/inboxRelays";
import { roomKey, roomSlug } from "@/lib/dm/rooms";
import { PersonAvatar, nameOf, shortNpub } from "./people";

/** At most this many people in one chat, including you. */
const MAX_GROUP = 20;

const inboxQuery = (pubkey: string) => ({
  queryKey: ["dm-inbox", pubkey],
  queryFn: () => loadDmRelays(pubkey),
  staleTime: 10 * 60_000,
});

function useInboxStatus(pubkey: string) {
  return useQuery(inboxQuery(pubkey));
}

function InboxStatus({ pubkey }: { pubkey: string }) {
  const { data, isPending } = useInboxStatus(pubkey);
  if (isPending)
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
      </span>
    );
  if (data?.relays.length)
    return (
      <span className="flex items-center gap-1 text-xs text-teal-700 dark:text-teal-300">
        <Inbox className="h-3 w-3" /> Receives private messages
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="h-3 w-3" /> No inbox relays yet — can't receive private messages
    </span>
  );
}

/** Network results shown under the follows. */
const MAX_NETWORK = 12;

export function NewMessage({ me, onBack }: { me: string; onBack: () => void }) {
  const [, navigate] = useLocation();
  const { follows } = useMyFollows();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);

  const followList = useMemo(() => [...follows].filter((pk) => pk !== me), [follows, me]);
  const profiles = useLiveProfiles(useMemo(() => [...followList.slice(0, 400), ...picked], [followList, picked]));
  const scoreOf = useAuthorScores(picked);

  // A pasted key or address resolves to one person.
  const typed = query.trim();
  // Everyone else on Nostr: the SearchBox's people search.
  const { people: found, searching } = usePeopleSearch(typed, me);
  const direct = decodeShareId(typed)?.pubkey;
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    setResolved(null);
    setLookupError(null);
    if (!isNip05(typed)) return;
    let alive = true;
    const t = setTimeout(() => {
      resolveNip05(typed)
        .then((pk) => {
          if (!alive) return;
          if (pk) setResolved(pk);
          else setLookupError(`No one found at ${typed}.`);
        })
        .catch(() => alive && setLookupError(`Couldn't look up ${typed}.`));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [typed]);

  const matches = useMemo(() => {
    const words = typed.toLowerCase();
    if (direct || isNip05(typed)) return [];
    const pool = followList.filter((pk) => !picked.includes(pk));
    if (!words) return pool.slice(0, 30);
    return pool
      .filter((pk) => {
        const p = profiles.get(pk);
        const hay = `${p?.display_name ?? ""} ${p?.name ?? ""} ${p?.nip05 ?? ""}`.toLowerCase();
        return hay.includes(words);
      })
      .slice(0, 30);
  }, [typed, direct, followList, picked, profiles]);

  const candidates = [direct ?? resolved].filter((pk): pk is string => !!pk && !picked.includes(pk) && pk !== me);
  const shownAbove = new Set([...candidates, ...matches]);
  const networkPeople = found
    .filter((r) => !picked.includes(r.pubkey) && !shownAbove.has(r.pubkey))
    .slice(0, MAX_NETWORK);
  // What a picked network result looked like, until its live profile arrives.
  const [seen, setSeen] = useState<Map<string, SearchResult>>(new Map());
  const shown = useMemo(() => {
    const out = new Map(profiles);
    for (const [pk, r] of seen)
      if (!out.has(pk)) out.set(pk, { name: r.name, display_name: r.displayName, picture: r.picture });
    return out;
  }, [profiles, seen]);
  const add = (pk: string, from?: SearchResult) => {
    if (picked.length + 1 >= MAX_GROUP) return;
    if (from) setSeen((cur) => new Map(cur).set(pk, from));
    setPicked((cur) => [...cur, pk]);
    setQuery("");
  };

  // The same queries InboxStatus runs, so the button waits for the same answers.
  const statuses = useQueries({ queries: picked.map(inboxQuery) });
  const blocked = picked.filter((_, i) => statuses[i]?.data && !statuses[i].data!.relays.length);
  const checking = statuses.some((q) => q.isPending);
  const start = () => {
    if (!picked.length) return;
    const key = roomKey([me, ...picked]);
    const qs = picked.length > 1 && subject.trim() ? `?subject=${encodeURIComponent(subject.trim())}` : "";
    navigate(`/messages/${roomSlug(key, me)}${qs}`);
  };

  return (
    <section aria-label="New message" className="flex min-h-0 flex-col bg-card" data-testid="dm-new">
      <header className="flex h-[68px] shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold">New message</h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="dm-to" className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
            To
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-2 py-1.5 focus-within:border-brand-primary/60">
            {picked.map((pk) => (
              <span
                key={pk}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-slate-50 pl-1 pr-1.5 text-[13px] font-semibold dark:bg-slate-800"
              >
                <PersonAvatar pubkey={pk} profiles={shown} size={24} />
                {nameOf(pk, shown)}
                <button
                  type="button"
                  onClick={() => setPicked((cur) => cur.filter((p) => p !== pk))}
                  aria-label={`Remove ${nameOf(pk, shown)}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              id="dm-to"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={picked.length ? "Add someone" : "Search by name, or paste an npub or name@domain"}
              className="h-8 min-w-[12rem] flex-1 bg-transparent px-1 text-[15px] outline-none"
              autoFocus
              data-testid="dm-new-to"
            />
          </div>
          {lookupError && <p className="text-xs text-amber-700 dark:text-amber-300">{lookupError}</p>}
        </div>

        {(candidates.length > 0 || matches.length > 0) && (
          <ul className="flex flex-col" aria-label="People">
            {[...candidates, ...matches].map((pk) => (
              <li key={pk}>
                <button
                  type="button"
                  onClick={() => add(pk)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  data-testid="dm-new-candidate"
                >
                  <PersonAvatar pubkey={pk} profiles={shown} size={40} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold">{nameOf(pk, shown)}</span>
                    <span className="truncate font-mono text-xs text-slate-500">
                      {profiles.get(pk)?.nip05 || shortNpub(pk)}
                    </span>
                  </span>
                  {follows.has(pk) && (
                    <Chip tone="slate" size="sm" className="ml-auto">
                      You follow
                    </Chip>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {(networkPeople.length > 0 || (searching && typed.length >= 2)) && (
          <div className="flex flex-col gap-1" data-testid="dm-new-network">
            <SectionHeader
              kicker={
                <span className="flex items-center gap-1.5">
                  On Nostr {searching && <Loader2 className="h-3 w-3 animate-spin" aria-label="Searching" />}
                </span>
              }
              className="px-2"
            />
            <ul className="flex flex-col" aria-label="People on Nostr">
              {networkPeople.map((r) => (
                <li key={r.pubkey}>
                  <button
                    type="button"
                    onClick={() => add(r.pubkey, r)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    data-testid="dm-new-candidate"
                  >
                    <NetworkPersonRow person={r} follows={follows.has(r.pubkey)} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {picked.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
            {picked.map((pk) => (
              <div key={pk} className="flex items-center gap-3">
                <PersonAvatar pubkey={pk} profiles={shown} score={scoreOf(pk)} size={36} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{nameOf(pk, shown)}</span>
                  <InboxStatus pubkey={pk} />
                </span>
                {!follows.has(pk) && (
                  <Chip tone="warning" size="sm" className="ml-auto">
                    Outside your follows
                  </Chip>
                )}
              </div>
            ))}
          </div>
        )}

        {picked.length > 1 && (
          <div className="flex flex-col gap-2">
            <label htmlFor="dm-subject" className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
              Group name <span className="font-normal text-slate-500">· optional, sent as the chat's subject</span>
            </label>
            <Input
              id="dm-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Name this chat"
            />
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-slate-50 px-4 py-3 dark:bg-slate-900/50 sm:px-6">
        <span className="flex min-w-0 flex-1 items-start gap-2 text-[13px] text-slate-600 dark:text-slate-300">
          <Gift className="mt-0.5 h-4 w-4 shrink-0" />
          {blocked.length
            ? `${blocked.map((pk) => nameOf(pk, shown)).join(", ")} can't receive private messages until they set up inbox relays.`
            : picked.length > 1
              ? `A group of ${picked.length + 1} with you. Each person gets their own sealed copy; relays can't see who's in the chat.`
              : "Only the two of you can read it. Relays can't see who you're talking to."}
        </span>
        <Button onClick={start} disabled={!picked.length || blocked.length > 0 || checking} data-testid="dm-new-start">
          Start chat
        </Button>
      </footer>
    </section>
  );
}
