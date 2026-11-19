import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { FileText } from "lucide-react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { AllResults } from "@/components/search/AllResults";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import type { SearchHit } from "@/services/search";
import { PROFILE_RELAYS } from "@/lib/relays";
import { eventPath } from "@/lib/shareId";
import { useTagNotes } from "@/hooks/useTags";
import { WHEN_OTHERS_SEE_IT, onlyViewerSees } from "@/components/share/tagCopy";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * The posts and the things carrying a tag — the other half of what Floor D wants
 * on a tag page, beside the people. A note is tagged by id; an addressable thing
 * (a Dictionary list item, a listing, an article) by its coordinate, and shows as
 * search's All shows it (AllResults): a GitHub account as a GitHub account.
 *
 * Renders nothing at all when a tag has no notes, which is the common case
 * rather than an edge one: a tag only becomes note-taggable once somebody mints
 * its tagging header, and most tags on the hub today describe people. A "no
 * posts yet" empty state on every tag page would be noise about a thing most
 * readers never asked for.
 *
 * The notes themselves do NOT live on the tag hub — only the assertions about
 * them do. So they're fetched from the app's normal relays, using the relay
 * hints the asserters attached, exactly as the protocol intends.
 */
export function TaggedNotes({ authorPubkey, slug }: { authorPubkey: string; slug: string }) {
  const { data: tagged, isLoading } = useTagNotes(authorPubkey, slug);

  const ids = useMemo(() => (tagged ?? []).map((t) => t.id).filter((id): id is string => !!id), [tagged]);
  const coords = useMemo(
    () =>
      (tagged ?? []).flatMap((t) => {
        const [kind, pubkey, ...d] = (t.address ?? "").split(":");
        return t.address && /^\d+$/.test(kind) && pubkey && d.length
          ? [{ kind: Number(kind), pubkey, identifier: d.join(":") }]
          : [];
      }),
    [tagged],
  );

  // Our own relays PLUS wherever the asserters said the notes live. The hub
  // carries assertions about notes, never the notes, so a note published
  // somewhere we don't read is only reachable through its hint.
  const relays = useMemo(() => {
    const set = new Set(PROFILE_RELAYS);
    for (const t of tagged ?? []) for (const r of t.relays) set.add(r);
    return Array.from(set);
  }, [tagged]);

  const notesQuery = useStoreEvents(
    ids.length ? `tag-note-events:${ids.join(",")}:${relays.join(",")}` : null,
    ids.length ? [{ ids }] : null,
    () => fetchEventsByIds(ids, relays),
  );

  const notes = useMemo(() => (notesQuery.events ?? []) as unknown as MinimalEvent[], [notesQuery.events]);

  // The things, by coordinate: from the store, live, and the relays (the search relay among them)
  // for those it lacks — the newest version of each, as an address names.
  const coordsKey = coords.map((c) => `${c.kind}:${c.pubkey}:${c.identifier}`).join("\n");
  const itemFilters = useMemo(
    () => (coords.length ? coords.map((c) => ({ kinds: [c.kind], authors: [c.pubkey], "#d": [c.identifier] })) : null),
    // `coordsKey` names the coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordsKey],
  );
  const itemsQuery = useStoreEvents(coords.length ? `tag-item-events:${coordsKey}` : null, itemFilters, async () =>
    Array.from((await fetchAddressableEvents(coords, relays).catch(() => new Map())).values()),
  );
  const items: SearchHit[] = useMemo(() => {
    const newest = new Map<string, NostrEvent>();
    for (const e of (itemsQuery.events ?? []) as NostrEvent[]) {
      const key = `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
      const held = newest.get(key);
      if (!held || e.created_at > held.created_at) newest.set(key, e);
    }
    // The service's order (most vouched first), as the notes keep it.
    return (tagged ?? []).flatMap((t) => {
      const e = t.address ? newest.get(t.address) : undefined;
      return e ? [{ event: e, author: null, rank: null }] : [];
    });
  }, [tagged, itemsQuery.events]);

  const authors = useMemo(() => Array.from(new Set(notes.map((n) => n.pubkey).filter(Boolean) as string[])), [notes]);
  const profileMap = useLiveProfiles(authors);
  const profiles = profileMap;

  // Keep the service's ordering (most-vouched first) rather than relay order.
  const ordered = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]));
    return (tagged ?? []).map((t) => (t.id ? byId.get(t.id) : undefined)).filter((n): n is MinimalEvent => !!n);
  }, [tagged, notes]);

  if (isLoading || !tagged?.length) return null;
  const loading = notesQuery.loading || itemsQuery.loading;
  const noun = !coords.length ? "post" : !ids.length ? "item" : "post and item";
  // We know posts or things carry this tag but couldn't fetch them — say so rather
  // than rendering an empty section that reads as "there are none".
  if (!ordered.length && !items.length && !loading) {
    return (
      <section className="mt-8" data-testid="tag-notes-unreachable">
        <SectionLabel count={tagged.length} noun={noun} />
        <p className="text-sm text-slate-400 dark:text-slate-500">
          We couldn't load {tagged.length === 1 ? "it" : "them"} right now.
        </p>
      </section>
    );
  }

  // The count is how many posts CARRY the tag, not how many we managed to
  // fetch. Those differ whenever a note lives on relays we don't read and its
  // asserter attached no hint, and quietly reporting the smaller number would
  // put this page out of agreement with any client that can reach the note.
  const missing = tagged.length - ordered.length - items.length;
  // Posts on this list only because the viewer tagged them, from an account the trust filter
  // doesn't count yet: theirs to see, nobody else's (services/tags fetchTagNotes).
  const onlyYou = tagged.filter(onlyViewerSees).length;

  return (
    <section className="mt-8" data-testid="tag-notes">
      <SectionLabel count={tagged.length} noun={noun} />
      {missing > 0 && !loading && (
        <p className="-mt-2 mb-3 text-[11px] text-slate-400 dark:text-slate-500" data-testid="tag-notes-missing">
          {missing === 1 ? "1 isn't" : `${missing} aren't`} on the relays we can reach.
        </p>
      )}
      {onlyYou > 0 && (
        <p className="-mt-2 mb-3 text-[11px] text-slate-400 dark:text-slate-500" data-testid="tag-notes-only-you">
          {onlyYou === tagged.length
            ? `Only you can see ${tagged.length === 1 ? "this" : "these"} here for now.`
            : `Only you can see ${onlyYou} of these here for now.`}{" "}
          {WHEN_OTHERS_SEE_IT}
        </p>
      )}
      <div className="space-y-3">
        {ordered.map((note) => (
          <EmbeddedNoteCard
            key={note.id}
            event={note}
            author={profiles?.get(note.pubkey ?? "")}
            profiles={profiles}
            href={eventPath({ id: note.id, pubkey: note.pubkey })}
          />
        ))}
      </div>
      {items.length > 0 && (
        <div className={ordered.length ? "mt-3" : undefined} data-testid="tag-items">
          <AllResults hits={items} settled scoreOf={() => null} query="" />
        </div>
      )}
    </section>
  );
}

function SectionLabel({ count, noun }: { count: number; noun: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      <FileText className="h-3.5 w-3.5" />
      {count} {count === 1 ? noun : noun.replace(/(\w+)$/, "$1s").replace(/^post and/, "posts and")}
    </div>
  );
}
