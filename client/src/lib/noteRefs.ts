import { nip19 } from "nostr-tools";
import { parseNoteContent } from "@/lib/noteContent";

/**
 * Parse a kind-1/kind-6 event's tags + content to surface the references a
 * client like Primal shows: who it's replying to, what it quotes, who it
 * mentions, and (for reposts) the reposted note. Used by the share page's rich
 * note cards. Intentionally pragmatic — enough to render context, not a full
 * NIP-10 thread engine.
 */

export interface MinimalEvent {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

export interface NoteAnalysis {
  isReply: boolean;
  replyToPubkeys: string[];
  quoteIds: string[];
  mentionPubkeys: string[];
  repostId?: string;
  /** A kind-6 repost embeds the original event JSON in `content`. */
  repostEvent?: MinimalEvent;
}

/** Decode a `nostr:`-stripped bech32 entity into a pubkey or event id. */
export function decodeNostrEntity(bech: string): { pubkey?: string; id?: string } {
  try {
    const d = nip19.decode(bech);
    if (d.type === "npub") return { pubkey: d.data as string };
    if (d.type === "nprofile") return { pubkey: (d.data as { pubkey: string }).pubkey };
    if (d.type === "note") return { id: d.data as string };
    if (d.type === "nevent") return { id: (d.data as { id: string }).id };
  } catch {
    // ignore
  }
  return {};
}

export function analyzeNote(ev: MinimalEvent): NoteAnalysis {
  const tags = ev.tags || [];
  const eTags = tags.filter((t) => t[0] === "e");
  const pTags = tags.filter((t) => t[0] === "p").map((t) => t[1]).filter(Boolean);
  const qTags = tags.filter((t) => t[0] === "q").map((t) => t[1]).filter(Boolean);

  // Repost (NIP-18): the original event is usually embedded as JSON in content.
  if (ev.kind === 6 || ev.kind === 16) {
    let repostEvent: MinimalEvent | undefined;
    if (ev.content) {
      try {
        const parsed = JSON.parse(ev.content);
        if (parsed && parsed.id && parsed.pubkey) repostEvent = parsed as MinimalEvent;
      } catch {
        // content not JSON
      }
    }
    const repostId = repostEvent?.id ?? eTags[0]?.[1];
    return { isReply: false, replyToPubkeys: [], quoteIds: [], mentionPubkeys: pTags, repostId, repostEvent };
  }

  // Quotes + mentions embedded in content.
  const contentQuoteIds: string[] = [];
  const contentMentionPks: string[] = [];
  for (const tok of parseNoteContent(ev.content || "")) {
    if (tok.type === "mention") {
      const { pubkey, id } = decodeNostrEntity(tok.bech32);
      if (pubkey) contentMentionPks.push(pubkey);
      if (id) contentQuoteIds.push(id);
    }
  }

  const mentionMarkerIds = eTags.filter((t) => t[3] === "mention").map((t) => t[1]).filter(Boolean);
  // Any non-"mention" e tag means this is a reply (covers marked + legacy positional).
  const isReply = eTags.some((t) => t[3] !== "mention");
  const quoteIds = Array.from(new Set([...qTags, ...mentionMarkerIds, ...contentQuoteIds]));
  const mentionPubkeys = Array.from(new Set([...pTags, ...contentMentionPks]));
  const replyToPubkeys = isReply ? Array.from(new Set(pTags)) : [];

  return { isReply, replyToPubkeys, quoteIds, mentionPubkeys };
}

/**
 * Collect every referenced pubkey + event id across a batch of notes, so the
 * share page can resolve profiles + quoted events in two batched relay queries.
 */
export function collectRefs(events: MinimalEvent[]): { pubkeys: string[]; ids: string[] } {
  const pubkeys = new Set<string>();
  const ids = new Set<string>();
  for (const ev of events) {
    const a = analyzeNote(ev);
    a.mentionPubkeys.forEach((pk) => pubkeys.add(pk));
    a.replyToPubkeys.forEach((pk) => pubkeys.add(pk));
    a.quoteIds.forEach((id) => ids.add(id));
    if (a.repostId) ids.add(a.repostId);
    if (a.repostEvent?.pubkey) pubkeys.add(a.repostEvent.pubkey);
  }
  return { pubkeys: Array.from(pubkeys), ids: Array.from(ids) };
}
