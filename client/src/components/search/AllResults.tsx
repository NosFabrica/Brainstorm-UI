/**
 * The All tab's list: every hit, in the relay's order, as one row shape
 * (AllResultRow). What the rows are ABOUT — a reaction's note, a zap's post, an
 * RSVP's event, a badge award's badge — is resolved here, for the whole page
 * at once and only once it has ended (not while a further page streams in):
 * one ask for the ids, one for the addresses, both store-first, instead of a
 * request per row or per arriving hit. Authors the search could not name yet
 * are asked for in one batch the same way, so a row says who, not an npub.
 */
import { useEffect, useMemo, useState } from "react";
import { nip19, type NostrEvent } from "nostr-tools";
import { AllResultRow } from "@/components/search/AllResultRow";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { eventStore } from "@/lib/eventStore";
import { HEX64 } from "@/lib/resultReaders";
import { summaryOf } from "@/lib/resultSummary";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import { wantProfile } from "@/services/authorProfileQueue";
import { kind0ToSearchResult, type SearchHit } from "@/services/search";

type Coord = { kind: number; pubkey: string; identifier: string };

function coordOf(addr: string): Coord | null {
  const [kind, pubkey, ...rest] = addr.split(":");
  const k = Number(kind);
  return Number.isInteger(k) && HEX64.test(pubkey ?? "")
    ? { kind: k, pubkey: pubkey.toLowerCase(), identifier: rest.join(":") }
    : null;
}
const keyOf = (c: Coord) => `${c.kind}:${c.pubkey}:${c.identifier}`;
/** The people a row's words name, as `nostr:npub…`/`nprofile…` tokens. */
const MENTION = /nostr:((?:npub1|nprofile1)[02-9ac-hj-np-z]+)/gi;
function mentionedIn(text: string | null | undefined, into: Set<string>): void {
  if (!text) return;
  for (const m of text.matchAll(MENTION)) {
    try {
      const d = nip19.decode(m[1]);
      if (d.type === "npub") into.add(d.data);
      else if (d.type === "nprofile") into.add(d.data.pubkey);
    } catch {
      /* not a key after all */
    }
  }
}

type Person = { name?: string; picture?: string };
const personOf = (profile: NostrEvent): Person => {
  const r = kind0ToSearchResult(profile);
  return { name: r.displayName || r.name || undefined, picture: r.picture || undefined };
};

/**
 * Everyone a page names, asked of the search relay in its shared batch queue — the
 * relay that indexed these events holds their people too (the profile relays often
 * do not: a mute list's spam accounts, a zap's payer). Answers land in the store,
 * where every mention chip on the page reads them; the bylines read them here.
 */
function usePeople(pubkeys: string[]): Map<string, Person> {
  const key = [...pubkeys].sort().join(",");
  const [found, setFound] = useState<Map<string, Person>>(() => new Map());
  useEffect(() => {
    if (!key) return;
    const cancels: (() => void)[] = [];
    const held = new Map<string, Person>();
    for (const pk of key.split(",")) {
      const known = eventStore.getReplaceable(0, pk);
      if (known) held.set(pk, personOf(known));
      else
        cancels.push(
          wantProfile(pk, (profile) => {
            if (profile) setFound((m) => new Map(m).set(pk, personOf(profile)));
          }),
        );
    }
    if (held.size) setFound((m) => new Map([...m, ...held]));
    return () => cancels.forEach((c) => c());
  }, [key]);
  return found;
}

const eventCoord = (e: NostrEvent) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;

export function AllResults({
  hits,
  settled,
  scoreOf,
  query,
}: {
  hits: SearchHit[];
  /** The page has ended (EOSE) and no further page is streaming: only then are references asked for. */
  settled: boolean;
  scoreOf: (pubkey: string) => number | null | undefined;
  query: string;
}) {
  const refs = useMemo(() => {
    const ids = new Set<string>();
    const coords = new Map<string, Coord>();
    if (settled)
      for (const h of hits) {
        const ref = summaryOf(h.event).ref;
        if (ref?.id && HEX64.test(ref.id)) ids.add(ref.id.toLowerCase());
        else if (ref?.addr) {
          const c = coordOf(ref.addr);
          if (c) coords.set(keyOf(c), c);
        }
      }
    return { ids: [...ids].sort(), coords: [...coords.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b))) };
  }, [hits, settled]);

  const idsKey = refs.ids.join(",");
  const idFilters = useMemo(() => (idsKey ? [{ ids: idsKey.split(",") }] : null), [idsKey]);
  const byIdAsk = useStoreEvents(idsKey ? `all-refs:${idsKey}` : null, idFilters, () =>
    fetchEventsByIds(idsKey.split(",")),
  );

  // Addresses read from the store, live — a held copy shows at once and stays shown while
  // a later page's ask is out — and only the ones it lacks go to the relays.
  const coordsKey = refs.coords.map(keyOf).join("\n");
  const addrFilters = useMemo(
    () => (coordsKey ? refs.coords.map((c) => ({ kinds: [c.kind], authors: [c.pubkey], "#d": [c.identifier] })) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordsKey],
  );
  const byAddrAsk = useStoreEvents(coordsKey ? `all-addrs:${coordsKey}` : null, addrFilters, async () => {
    const missing = refs.coords.filter((c) => !eventStore.getReplaceable(c.kind, c.pubkey, c.identifier));
    if (!missing.length) return [];
    return Array.from((await fetchAddressableEvents(missing).catch(() => new Map<string, NostrEvent>())).values());
  });

  const targets = useMemo(() => {
    const byId = new Map(byIdAsk.events.map((e) => [e.id, e as NostrEvent]));
    const byAddr = new Map(byAddrAsk.events.map((e) => [eventCoord(e as NostrEvent), e as NostrEvent]));
    return { byId, byAddr };
  }, [byIdAsk.events, byAddrAsk.events]);

  // Everyone the page names and the search did not: unnamed authors, zap payers, the
  // people in the words, the authors of the quoted events — once the page has ended.
  const wanted = useMemo(() => {
    if (!settled) return [];
    const people = new Set<string>();
    for (const h of hits) {
      const s = summaryOf(h.event);
      if (s.by) people.add(s.by);
      else if (!h.author?.displayName && !h.author?.name) people.add(h.event.pubkey);
      mentionedIn(s.title, people);
      mentionedIn(s.body, people);
      mentionedIn(s.quote, people);
      for (const f of s.facts) mentionedIn(f, people);
    }
    for (const t of [...targets.byId.values(), ...targets.byAddr.values()]) {
      people.add(t.pubkey);
      const s = summaryOf(t);
      mentionedIn(s.title, people);
      mentionedIn(s.body, people);
    }
    return [...people];
  }, [hits, settled, targets]);
  const profiles = usePeople(wanted);

  return (
    <div className="space-y-2.5" data-testid="container-search-results">
      {hits.map(({ event, author }) => {
        const summary = summaryOf(event);
        const ref = summary.ref;
        const c = ref?.addr ? coordOf(ref.addr) : null;
        const target = ref?.id
          ? (targets.byId.get(ref.id.toLowerCase()) ?? null)
          : c
            ? (targets.byAddr.get(keyOf(c)) ?? null)
            : null;
        // A zap receipt is the payer's, not the wallet service's that signed it.
        const from = summary.by ?? event.pubkey;
        const person = profiles.get(from);
        return (
          <AllResultRow
            key={event.id}
            event={event}
            author={summary.by ? null : author}
            pubkey={from}
            name={person?.name}
            picture={person?.picture}
            score={scoreOf(from)}
            query={query}
            summary={summary}
            target={target}
          />
        );
      })}
    </div>
  );
}
