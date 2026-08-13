import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEventsByIds, fetchProfileMap } from "@/services/nostr";
import { PROFILE_RELAYS } from "@/lib/relays";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { eventPath } from "@/lib/shareId";
import { replyRefs, mentionPubkeysFromContent, type MinimalEvent } from "@/lib/noteRefs";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/**
 * The conversation *above* a focused reply — the post it's replying to, plus the
 * thread's root when that's a different post — rendered as compact cards joined
 * by a connector line so a permalinked reply reads as a conversation instead of
 * a floating statement. Each card opens its own /e thread. The link between root
 * and parent is dashed to signal there may be more posts in between (we fetch
 * only parent + root, not the full chain — click through for the rest).
 */
export function ThreadAncestors({ note, relayHints }: { note: MinimalEvent; relayHints: string[] }) {
  const { rootId, parentId } = replyRefs(note);
  const ids = useMemo(
    () => Array.from(new Set([rootId, parentId].filter(Boolean))) as string[],
    [rootId, parentId],
  );
  const relays = useMemo(() => Array.from(new Set([...relayHints, ...PROFILE_RELAYS])), [relayHints]);

  const eventsQuery = useQuery({
    queryKey: ["thread-ancestors", ...ids],
    queryFn: () => fetchEventsByIds(ids, relays),
    enabled: ids.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const byId = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const e of (eventsQuery.data ?? []) as MinimalEvent[]) m.set(e.id, e);
    return m;
  }, [eventsQuery.data]);

  const parent = parentId ? byId.get(parentId) : undefined;
  const root = rootId && rootId !== parentId ? byId.get(rootId) : undefined;
  const gap = !!(root && parent); // root distinct from parent → posts may sit between them

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

  const profilesQuery = useQuery({
    queryKey: ["thread-ancestor-profiles", mentionPks.join(",")],
    queryFn: () => fetchProfileMap(mentionPks),
    enabled: mentionPks.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = (profilesQuery.data as Map<string, ProfileLite>) ?? new Map<string, ProfileLite>();

  if (!parentId && !rootId) return null; // not a reply
  if (!root && !parent) return null; // ancestors couldn't be fetched (deleted / off relays)

  // Connector sits under the card's ~h-6 avatar (p-3 left + half avatar ≈ 26px).
  const connector = (dashed: boolean) => (
    <span
      aria-hidden="true"
      className={`ml-[26px] block h-4 w-0 border-l-2 ${dashed ? "border-dashed border-slate-300 dark:border-slate-700" : "border-slate-200 dark:border-slate-700"}`}
    />
  );

  return (
    <div data-testid="thread-ancestors">
      {root && (
        <>
          <EmbeddedNoteCard event={root} author={profiles.get(root.pubkey)} profiles={profiles} href={eventPath(root, relayHints)} />
          {connector(gap)}
        </>
      )}
      {parent && (
        <>
          <EmbeddedNoteCard event={parent} author={profiles.get(parent.pubkey)} profiles={profiles} href={eventPath(parent, relayHints)} />
          {connector(false)}
        </>
      )}
    </div>
  );
}
