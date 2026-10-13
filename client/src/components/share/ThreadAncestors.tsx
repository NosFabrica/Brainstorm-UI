import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import { PROFILE_RELAYS } from "@/lib/relays";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { LinkPreviewCard } from "@/components/share/LinkPreview";
import { eventPath, READER_KINDS } from "@/lib/shareId";
import { externalRef } from "@/lib/nip73";
import {
  addrCoord,
  replyRefs,
  mentionPubkeysFromContent,
  sameScope,
  type AddressRef,
  type MinimalEvent,
} from "@/lib/noteRefs";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/** One end of the thread: an event by id, an address (its latest version), or an external id. */
type Scope = { id?: string; addr?: AddressRef; external?: string };

const named = (s: Scope) => !!(s.id || s.addr || s.external);

/** An addressable event's coordinate, `kind:pubkey:d`; null for any other. */
const coordOfEvent = (e: MinimalEvent) =>
  e.kind >= 30000 && e.kind < 40000 ? `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}` : null;
/** One event, or two versions of one address: a root named by `A` and a parent by `e` can be the same article. */
const sameEvent = (a: MinimalEvent | undefined, b: MinimalEvent | undefined) =>
  !!a && !!b && (a.id === b.id || (coordOfEvent(a) !== null && coordOfEvent(a) === coordOfEvent(b)));

/**
 * The conversation *above* a focused reply — the post it's replying to, plus the
 * thread's root when that's a different post — rendered as compact cards joined
 * by a connector line so a permalinked reply reads as a conversation instead of
 * a floating statement. Each card opens its own /e thread. The link between root
 * and parent is dashed to signal there may be more posts in between (we fetch
 * only parent + root, not the full chain — click through for the rest).
 *
 * A NIP-22 comment's root or parent may be an address — an article, a video —
 * read as its latest version, or something off Nostr (NIP-73): a web page is a
 * link card, a book or a podcast a labelled line.
 */
export function ThreadAncestors({ note, relayHints }: { note: MinimalEvent; relayHints: string[] }) {
  const refs = useMemo(() => replyRefs(note), [note]);
  const rootScope: Scope = useMemo(
    () => ({ id: refs.rootId, addr: refs.rootAddr, external: refs.rootExternal }),
    [refs.rootId, refs.rootAddr, refs.rootExternal],
  );
  const parentScope: Scope = useMemo(
    () => ({ id: refs.parentId, addr: refs.parentAddr, external: refs.parentExternal }),
    [refs.parentId, refs.parentAddr, refs.parentExternal],
  );
  // The root is drawn only when it is not the parent itself.
  const rootDistinct = named(rootScope) && !(named(parentScope) && sameScope(rootScope, parentScope));
  const scopes = useMemo(
    () => [...(rootDistinct ? [rootScope] : []), ...(named(parentScope) ? [parentScope] : [])],
    [rootDistinct, rootScope, parentScope],
  );

  // An address is read as its latest version; the exact version its id names stands in until it lands.
  const ids = useMemo(() => Array.from(new Set(scopes.filter((s) => s.id).map((s) => s.id!))), [scopes]);
  const addrs = useMemo(() => {
    const m = new Map<string, AddressRef>();
    for (const s of scopes) if (s.addr) m.set(addrCoord(s.addr), s.addr);
    return [...m.values()];
  }, [scopes]);
  const hintsKey = (refs.hints ?? []).join(",");
  const relays = useMemo(
    () => Array.from(new Set([...relayHints, ...(hintsKey ? hintsKey.split(",") : []), ...PROFILE_RELAYS])),
    [relayHints, hintsKey],
  );

  const eventsQuery = useStoreEvents(
    ids.length ? `thread-ancestors:${ids.join(",")}` : null,
    ids.length ? [{ ids }] : null,
    () => fetchEventsByIds(ids, relays),
    { minMs: 60_000 },
  );
  const coordsKey = addrs.map(addrCoord).join(",");
  const addrFilters = useMemo(
    () => (addrs.length ? addrs.map((a) => ({ kinds: [a.kind], authors: [a.pubkey], "#d": [a.identifier] })) : null),
    // coordsKey is `addrs`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordsKey],
  );
  const addrQuery = useStoreEvents(
    addrs.length ? `thread-ancestor-addrs:${coordsKey}` : null,
    addrFilters,
    async () => Array.from((await fetchAddressableEvents(addrs, relays)).values()),
    { minMs: 60_000 },
  );

  const resolve = useMemo(() => {
    const byId = new Map<string, MinimalEvent>();
    for (const e of (eventsQuery.events ?? []) as MinimalEvent[]) byId.set(e.id, e);
    const byCoord = new Map<string, MinimalEvent>();
    for (const e of (addrQuery.events ?? []) as MinimalEvent[]) {
      const key = `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
      const held = byCoord.get(key);
      if (!held || held.created_at < e.created_at) byCoord.set(key, e);
    }
    return (s: Scope): MinimalEvent | undefined =>
      (s.addr ? byCoord.get(addrCoord(s.addr)) : undefined) ?? (s.id ? byId.get(s.id) : undefined);
  }, [eventsQuery.events, addrQuery.events]);

  const parent = named(parentScope) ? resolve(parentScope) : undefined;
  const rootFound = rootDistinct ? resolve(rootScope) : undefined;
  // Scopes that name it two ways (an address, an id) can still be one event: drawn once, as the parent.
  const root = sameEvent(rootFound, parent) ? undefined : rootFound;
  // What can be drawn: the event, or — off Nostr — the external id itself.
  const rootShown = !!root || (rootDistinct && !!rootScope.external && !rootScope.id && !rootScope.addr);
  const parentShown = !!parent || (!!parentScope.external && !parentScope.id && !parentScope.addr);
  const gap = rootShown && parentShown; // root distinct from parent → posts may sit between them

  // Resolve the ancestor authors + anyone they @-mention so cards read as names.
  const mentionPks = useMemo(() => {
    const set = new Set<string>();
    for (const e of [root, parent]) {
      if (!e) continue;
      set.add(e.pubkey);
      mentionPubkeysFromContent(e.content || "").forEach((pk) => set.add(pk));
    }
    return Array.from(set);
  }, [root, parent]);

  const profileMap = useLiveProfiles(mentionPks);
  const profiles = (profileMap as Map<string, ProfileLite>) ?? new Map<string, ProfileLite>();

  if (!rootShown && !parentShown) return null; // not a reply, or its ancestors couldn't be fetched

  // Connector sits under the card's ~h-6 avatar (p-3 left + half avatar ≈ 26px).
  const connector = (dashed: boolean) => (
    <span
      aria-hidden="true"
      className={`ml-[26px] block h-4 w-0 border-l-2 ${dashed ? "border-dashed border-slate-300 dark:border-slate-700" : "border-slate-200 dark:border-slate-700"}`}
    />
  );

  const card = (ev: MinimalEvent | undefined, scope: Scope) =>
    ev ? (
      READER_KINDS.has(ev.kind) ? (
        <EmbeddedArticleCard event={ev} author={profiles.get(ev.pubkey)} />
      ) : (
        <EmbeddedNoteCard
          event={ev}
          author={profiles.get(ev.pubkey)}
          profiles={profiles}
          href={eventPath(ev, relayHints)}
        />
      )
    ) : scope.external ? (
      <ExternalScope value={scope.external} />
    ) : null;

  return (
    <div data-testid="thread-ancestors">
      {rootShown && (
        <>
          {card(root, rootScope)}
          {connector(gap)}
        </>
      )}
      {parentShown && (
        <>
          {card(parent, parentScope)}
          {connector(false)}
        </>
      )}
    </div>
  );
}

/** What a comment is about when it lives off Nostr (NIP-73): a web page as its link card, anything else named. */
function ExternalScope({ value }: { value: string }) {
  const ref = externalRef(value);
  if (!ref) return null;
  return (
    <div
      className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70"
      data-testid="thread-external"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Comments on · {ref.label}
      </p>
      {ref.href ? (
        <a
          href={ref.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 flex min-w-0 items-center gap-1 text-sm font-medium text-brand-link hover:underline"
          data-testid="thread-external-link"
        >
          <span className="truncate">{ref.text}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : (
        <p className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-100">{ref.text}</p>
      )}
      {ref.label === "Web page" && ref.href && <LinkPreviewCard url={ref.href} />}
    </div>
  );
}
