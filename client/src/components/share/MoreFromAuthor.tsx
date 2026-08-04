import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEventsByFilter, fetchProfileMap, PROFILE_RELAYS } from "@/services/nostr";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { eventPath } from "@/lib/shareId";
import { collectRefs, type MinimalEvent } from "@/lib/noteRefs";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/**
 * "More from {author}" — a small strip of the author's other recent posts as
 * clickable cards that open their own /e thread. Keeps readers inside Brainstorm
 * (destination-first) and shows off the content graph. All one author, so the
 * trust context is already the page's header badge — no extra scoring needed.
 */
export function MoreFromAuthor({
  pubkey,
  authorName,
  author,
  relayHints,
  excludeId,
  excludeContent,
}: {
  pubkey: string;
  authorName: string;
  author?: ProfileLite;
  relayHints: string[];
  /** The current event id — never show the post the reader is already on. */
  excludeId?: string;
  /** The current post's content — also drop rebroadcast duplicates (same text,
      different id) so the reader never sees the post they're already on. */
  excludeContent?: string;
}) {
  const relays = useMemo(() => Array.from(new Set([...relayHints, ...PROFILE_RELAYS])), [relayHints]);

  const q = useQuery({
    queryKey: ["more-from-author", pubkey, excludeId ?? ""],
    queryFn: () => fetchEventsByFilter({ authors: [pubkey], kinds: [1], limit: 12 }, relays, 6000),
    enabled: !!pubkey,
    staleTime: 60_000,
    retry: false,
  });

  const notes = useMemo(() => {
    // Normalized opening of the post being viewed — catches rebroadcast variants
    // (different id + slightly different trailing text) so it never re-appears.
    const sig = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60).toLowerCase();
    const skipSig = excludeContent ? sig(excludeContent) : "";
    const evs = ((q.data ?? []) as MinimalEvent[]).filter(
      (e) => e.id !== excludeId && !(skipSig && skipSig.length > 12 && sig(e.content || "") === skipSig),
    );
    // Prefer original posts (no reply `e` tag) so the strip reads as their work,
    // not scattered replies; fall back to everything if too few.
    const originals = evs.filter((e) => !(e.tags || []).some((t) => t[0] === "e"));
    const pick = originals.length >= 2 ? originals : evs;
    return pick.sort((a, b) => b.created_at - a.created_at).slice(0, 4);
  }, [q.data, excludeId]);

  // Resolve every referenced pubkey (@-mentions AND reply targets) so notes
  // render mentions as names and the "Replying to @…" line resolves too — not
  // raw npubs. The author themselves is already in the map below.
  const mentionPks = useMemo(() => {
    const set = new Set<string>(collectRefs(notes).pubkeys);
    set.delete(pubkey);
    return Array.from(set);
  }, [notes, pubkey]);

  const mentionProfilesQuery = useQuery({
    queryKey: ["more-from-mentions", mentionPks.join(",")],
    queryFn: () => fetchProfileMap(mentionPks),
    enabled: mentionPks.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const profiles = useMemo(() => {
    const m = new Map<string, ProfileLite>([[pubkey, author ?? {}]]);
    const resolved = mentionProfilesQuery.data;
    if (resolved) for (const [pk, p] of resolved) m.set(pk, p as ProfileLite);
    return m;
  }, [pubkey, author, mentionProfilesQuery.data]);

  if (!notes.length) return null;

  return (
    <section className="mt-8" data-testid="more-from-author">
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">More from {authorName}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {notes.map((n) => (
          <EmbeddedNoteCard key={n.id} event={n} author={author} profiles={profiles} href={eventPath(n, relayHints)} showReplyContext />
        ))}
      </div>
    </section>
  );
}
