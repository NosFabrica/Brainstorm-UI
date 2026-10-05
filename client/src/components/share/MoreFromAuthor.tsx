import { useMemo } from "react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { fetchEventsByFilter } from "@/services/nostr";
import { PROFILE_RELAYS } from "@/lib/relays";
import { outboxRelays } from "@/lib/relayRouting";
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

  const q = useStoreEvents(
    pubkey ? `more-from-author:${pubkey}` : null,
    pubkey ? [{ authors: [pubkey], kinds: [1], limit: 12 }] : null,
    // The author's own write relays first — "more from this author" is exactly
    // the query the outbox model exists for, and a prolific author who does not
    // publish to the big shared relays looks silent without it.
    async () =>
      fetchEventsByFilter({ authors: [pubkey], kinds: [1], limit: 12 }, await outboxRelays(pubkey, relays), 6000),
    { minMs: 60_000 },
  );

  const notes = useMemo(() => {
    // Normalized opening of the post being viewed — catches rebroadcast variants
    // (different id + slightly different trailing text) so it never re-appears.
    const sig = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60).toLowerCase();
    const skipSig = excludeContent ? sig(excludeContent) : "";
    const evs = ((q.events ?? []) as MinimalEvent[]).filter(
      (e) => e.id !== excludeId && !(skipSig && skipSig.length > 12 && sig(e.content || "") === skipSig),
    );
    // Prefer original posts (no reply `e` tag) so the strip reads as their work,
    // not scattered replies; fall back to everything if too few.
    const originals = evs.filter((e) => !(e.tags || []).some((t) => t[0] === "e"));
    const pick = originals.length >= 2 ? originals : evs;
    return pick.sort((a, b) => b.created_at - a.created_at).slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep pre-lint deps; excludeContent tracks excludeId
  }, [q.events, excludeId]);

  // Resolve every referenced pubkey (@-mentions AND reply targets) so notes
  // render mentions as names and the "Replying to @…" line resolves too — not
  // raw npubs. The author themselves is already in the map below.
  const mentionPks = useMemo(() => {
    const set = new Set<string>(collectRefs(notes).pubkeys);
    set.delete(pubkey);
    return Array.from(set);
  }, [notes, pubkey]);

  const mentionProfiles = useLiveProfiles(mentionPks);

  const profiles = useMemo(() => {
    const m = new Map<string, ProfileLite>([[pubkey, author ?? {}]]);
    const resolved = mentionProfiles;
    if (resolved) for (const [pk, p] of resolved) m.set(pk, p as ProfileLite);
    return m;
  }, [pubkey, author, mentionProfiles]);

  if (!notes.length) return null;

  return (
    <section className="mt-8" data-testid="more-from-author">
      <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">More from {authorName}</h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {notes.map((n) => (
          <EmbeddedNoteCard
            key={n.id}
            event={n}
            author={author}
            profiles={profiles}
            href={eventPath(n, relayHints)}
            showReplyContext
          />
        ))}
      </div>
    </section>
  );
}
