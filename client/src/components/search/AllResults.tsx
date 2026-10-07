/**
 * The All tab's list: every hit, in the relay's order, as one row shape
 * (AllResultRow). What the rows are ABOUT — a reaction's note, a zap's post, an
 * RSVP's event, a badge award's badge — is resolved here, for the whole page
 * at once and only once it has settled: one ask for the ids, one for the
 * addresses, both store-first, instead of a request per row or per arriving hit.
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { AllResultRow } from "@/components/search/AllResultRow";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { summaryOf } from "@/lib/resultSummary";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import type { SearchHit } from "@/services/search";

const HEX64 = /^[0-9a-f]{64}$/i;
const NO_EVENTS: NostrEvent[] = [];

function coordOf(addr: string): { kind: number; pubkey: string; identifier: string } | null {
  const [kind, pubkey, ...rest] = addr.split(":");
  const k = Number(kind);
  return Number.isInteger(k) && HEX64.test(pubkey ?? "")
    ? { kind: k, pubkey: pubkey.toLowerCase(), identifier: rest.join(":") }
    : null;
}
const coordKey = (e: NostrEvent) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;

export function AllResults({
  hits,
  settled,
  scoreOf,
  query,
}: {
  hits: SearchHit[];
  /** The page has ended (EOSE): only then are its references asked for. */
  settled: boolean;
  scoreOf: (pubkey: string) => number | null | undefined;
  query: string;
}) {
  const refs = useMemo(() => {
    const ids = new Set<string>();
    const addrs = new Set<string>();
    if (settled)
      for (const h of hits) {
        const ref = summaryOf(h.event).ref;
        if (ref?.id && HEX64.test(ref.id)) ids.add(ref.id.toLowerCase());
        else if (ref?.addr && coordOf(ref.addr)) addrs.add(ref.addr);
      }
    return { ids: [...ids].sort(), addrs: [...addrs].sort() };
  }, [hits, settled]);

  const idsKey = refs.ids.join(",");
  const idFilters = useMemo(() => (idsKey ? [{ ids: idsKey.split(",") }] : null), [idsKey]);
  const byIdAsk = useStoreEvents(idsKey ? `all-refs:${idsKey}` : null, idFilters, () =>
    fetchEventsByIds(idsKey.split(",")),
  );
  const addrsKey = refs.addrs.join("\n");
  const byAddrAsk = useStoreEvents(addrsKey ? `all-addrs:${addrsKey}` : null, null, async () =>
    Array.from(
      (
        await fetchAddressableEvents(
          addrsKey.split("\n").flatMap((a) => {
            const c = coordOf(a);
            return c ? [c] : [];
          }),
        ).catch(() => new Map<string, NostrEvent>())
      ).values(),
    ),
  );

  const targets = useMemo(() => {
    const byId = new Map((byIdAsk.events ?? NO_EVENTS).map((e) => [e.id, e as NostrEvent]));
    const byAddr = new Map((byAddrAsk.events ?? NO_EVENTS).map((e) => [coordKey(e as NostrEvent), e as NostrEvent]));
    return { byId, byAddr };
  }, [byIdAsk.events, byAddrAsk.events]);

  return (
    <div className="space-y-2.5" data-testid="container-search-results">
      {hits.map(({ event, author }) => {
        const summary = summaryOf(event);
        const ref = summary.ref;
        const target = ref?.id
          ? (targets.byId.get(ref.id.toLowerCase()) ?? null)
          : ref?.addr
            ? (() => {
                const c = coordOf(ref.addr);
                return c ? (targets.byAddr.get(`${c.kind}:${c.pubkey}:${c.identifier}`) ?? null) : null;
              })()
            : null;
        return (
          <AllResultRow
            key={event.id}
            event={event}
            author={author}
            score={scoreOf(event.pubkey)}
            query={query}
            summary={summary}
            target={target}
          />
        );
      })}
    </div>
  );
}
