import { useMemo } from "react";
import { FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { fetchEventsByIds, fetchProfileMap } from "@/services/nostr";
import { PROFILE_RELAYS } from "@/lib/relays";
import { eventPath } from "@/lib/shareId";
import { useTagNotes } from "@/hooks/useTags";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * The posts carrying a tag — the other half of what Floor D wants on a tag page,
 * beside the people.
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
export function TaggedNotes({
  authorPubkey,
  slug,
}: {
  authorPubkey: string;
  slug: string;
}) {
  const { data: tagged, isLoading } = useTagNotes(authorPubkey, slug);

  // Addressable targets (`a`-coordinates) are valid but we don't resolve them
  // yet — no tag on the live hub uses one, and guessing at a render for an
  // untested shape is how you ship a broken card. They're simply not listed.
  const ids = useMemo(
    () => (tagged ?? []).map((t) => t.id).filter((id): id is string => !!id),
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

  const notesQuery = useQuery({
    queryKey: ["tag-note-events", ids.join(","), relays.length],
    queryFn: () => fetchEventsByIds(ids, relays),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const notes = useMemo(
    () => (notesQuery.data ?? []) as unknown as MinimalEvent[],
    [notesQuery.data],
  );

  const authors = useMemo(
    () => Array.from(new Set(notes.map((n) => n.pubkey).filter(Boolean) as string[])),
    [notes],
  );
  const profilesQuery = useQuery({
    queryKey: ["tag-note-profiles", authors.join(",")],
    queryFn: () => fetchProfileMap(authors),
    enabled: authors.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data;

  // Keep the service's ordering (most-vouched first) rather than relay order.
  const ordered = useMemo(() => {
    const byId = new Map(notes.map((n) => [n.id, n]));
    return (tagged ?? [])
      .map((t) => (t.id ? byId.get(t.id) : undefined))
      .filter((n): n is MinimalEvent => !!n);
  }, [tagged, notes]);

  if (isLoading || !tagged?.length) return null;
  // We know posts carry this tag but couldn't fetch them — say so rather than
  // rendering an empty section that reads as "there are none".
  if (!ordered.length && !notesQuery.isLoading) {
    return (
      <section className="mt-8" data-testid="tag-notes-unreachable">
        <SectionLabel count={tagged.length} />
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
  const missing = tagged.length - ordered.length;

  return (
    <section className="mt-8" data-testid="tag-notes">
      <SectionLabel count={tagged.length} />
      {missing > 0 && !notesQuery.isLoading && (
        <p
          className="-mt-2 mb-3 text-[11px] text-slate-400 dark:text-slate-500"
          data-testid="tag-notes-missing"
        >
          {missing === 1 ? "1 isn't" : `${missing} aren't`} on the relays we can reach.
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
    </section>
  );
}

function SectionLabel({ count }: { count: number }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      <FileText className="h-3.5 w-3.5" />
      {count} {count === 1 ? "post" : "posts"}
    </div>
  );
}
