import { nip19 } from "nostr-tools";
import { parseNoteContent } from "@/lib/noteContent";

/** An addressable (replaceable) event reference — what an `naddr` decodes to. */
export interface AddressRef {
  kind: number;
  pubkey: string;
  identifier: string;
  relays?: string[];
}

/** Stable key for an addressable coordinate: `kind:pubkey:dTag`. */
export function addrCoord(a: { kind: number; pubkey: string; identifier: string }): string {
  return `${a.kind}:${a.pubkey}:${a.identifier}`;
}

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
  /** Addressable (naddr / `a`-tag) references — e.g. quoted long-form articles. */
  addrs: AddressRef[];
  repostId?: string;
  /** A kind-6 repost embeds the original event JSON in `content`. */
  repostEvent?: MinimalEvent;
}

/** Decode a `nostr:`-stripped bech32 entity into a pubkey, event id, or address. */
export function decodeNostrEntity(bech: string): { pubkey?: string; id?: string; address?: AddressRef } {
  try {
    const d = nip19.decode(bech);
    if (d.type === "npub") return { pubkey: d.data as string };
    if (d.type === "nprofile") return { pubkey: (d.data as { pubkey: string }).pubkey };
    if (d.type === "note") return { id: d.data as string };
    if (d.type === "nevent") return { id: (d.data as { id: string }).id };
    if (d.type === "naddr") {
      const a = d.data as { kind: number; pubkey: string; identifier: string; relays?: string[] };
      return { address: { kind: a.kind, pubkey: a.pubkey, identifier: a.identifier, relays: a.relays } };
    }
  } catch {
    // ignore
  }
  return {};
}

/** Pubkeys tagged via npub/nprofile mentions inside a note's content. */
export function mentionPubkeysFromContent(content: string): string[] {
  const out: string[] = [];
  for (const tok of parseNoteContent(content || "")) {
    if (tok.type === "mention") {
      const { pubkey } = decodeNostrEntity(tok.bech32);
      if (pubkey) out.push(pubkey);
    }
  }
  return out;
}

/** Parse an `a` tag value (`kind:pubkey:dTag`) into an address ref. */
function parseATag(value: string, relay?: string): AddressRef | null {
  const parts = value.split(":");
  if (parts.length < 3) return null;
  const kind = parseInt(parts[0], 10);
  const pubkey = parts[1];
  const identifier = parts.slice(2).join(":");
  if (!Number.isFinite(kind) || !/^[0-9a-f]{64}$/i.test(pubkey)) return null;
  return { kind, pubkey, identifier, relays: relay ? [relay] : undefined };
}

export function analyzeNote(ev: MinimalEvent): NoteAnalysis {
  const tags = ev.tags || [];
  const eTags = tags.filter((t) => t[0] === "e");
  const pTags = tags.filter((t) => t[0] === "p").map((t) => t[1]).filter(Boolean);
  const qTags = tags.filter((t) => t[0] === "q").map((t) => t[1]).filter(Boolean);
  // Addressable references via `a` tags (NIP-23 article links etc.).
  const tagAddrs = tags
    .filter((t) => t[0] === "a" && typeof t[1] === "string")
    .map((t) => parseATag(t[1], t[2]))
    .filter((a): a is AddressRef => a !== null);

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
    // Include pubkeys tagged inside the reposted note's content so the embedded
    // card can show @names instead of raw npubs.
    const innerMentions = repostEvent ? mentionPubkeysFromContent(repostEvent.content) : [];
    const mentionPubkeys = Array.from(new Set([...pTags, ...innerMentions]));
    return { isReply: false, replyToPubkeys: [], quoteIds: [], mentionPubkeys, addrs: tagAddrs, repostId, repostEvent };
  }

  // Quotes + mentions + addressable refs embedded in content.
  const contentQuoteIds: string[] = [];
  const contentMentionPks: string[] = [];
  const contentAddrs: AddressRef[] = [];
  for (const tok of parseNoteContent(ev.content || "")) {
    if (tok.type === "mention") {
      const { pubkey, id, address } = decodeNostrEntity(tok.bech32);
      if (pubkey) contentMentionPks.push(pubkey);
      if (id) contentQuoteIds.push(id);
      if (address) contentAddrs.push(address);
    }
  }
  const addrs = Array.from(
    new Map([...tagAddrs, ...contentAddrs].map((a) => [addrCoord(a), a])).values(),
  );

  const mentionMarkerIds = eTags.filter((t) => t[3] === "mention").map((t) => t[1]).filter(Boolean);
  // Any non-"mention" e tag means this is a reply (covers marked + legacy positional).
  const isReply = eTags.some((t) => t[3] !== "mention");
  const quoteIds = Array.from(new Set([...qTags, ...mentionMarkerIds, ...contentQuoteIds]));
  const mentionPubkeys = Array.from(new Set([...pTags, ...contentMentionPks]));
  const replyToPubkeys = isReply ? Array.from(new Set(pTags)) : [];

  return { isReply, replyToPubkeys, quoteIds, mentionPubkeys, addrs };
}

/**
 * The thread ancestry of a reply (NIP-10): the conversation `root` and the
 * immediate `parent` it replies to. Handles marked tags (`root`/`reply`) and the
 * legacy positional convention (first e = root, last e = parent); `mention`
 * e-tags are ignored. Returns {} when the note isn't a reply. When a note replies
 * straight to the root, parentId === rootId.
 */
export function replyRefs(ev: MinimalEvent): { rootId?: string; parentId?: string } {
  const eTags = (ev.tags || []).filter((t) => t[0] === "e" && t[1]);
  const threadTags = eTags.filter((t) => (t[3] || "") !== "mention");
  if (threadTags.length === 0) return {};
  const marked = threadTags.filter((t) => t[3] === "root" || t[3] === "reply");
  if (marked.length > 0) {
    const rootId = threadTags.find((t) => t[3] === "root")?.[1];
    const replyId = threadTags.find((t) => t[3] === "reply")?.[1];
    // A direct reply to the root carries only a `root` marker → root is the parent.
    return { rootId, parentId: replyId || rootId };
  }
  // Legacy positional: first e-tag is the root, last is the immediate parent.
  const ids = threadTags.map((t) => t[1]);
  return { rootId: ids[0], parentId: ids[ids.length - 1] };
}

/**
 * Collect every referenced pubkey + event id across a batch of notes, so the
 * share page can resolve profiles + quoted events in two batched relay queries.
 */
export function collectRefs(events: MinimalEvent[]): { pubkeys: string[]; ids: string[]; addrs: AddressRef[] } {
  const pubkeys = new Set<string>();
  const ids = new Set<string>();
  const addrMap = new Map<string, AddressRef>();
  for (const ev of events) {
    const a = analyzeNote(ev);
    a.mentionPubkeys.forEach((pk) => pubkeys.add(pk));
    a.replyToPubkeys.forEach((pk) => pubkeys.add(pk));
    a.quoteIds.forEach((id) => ids.add(id));
    a.addrs.forEach((ad) => { addrMap.set(addrCoord(ad), ad); pubkeys.add(ad.pubkey); });
    if (a.repostId) ids.add(a.repostId);
    if (a.repostEvent?.pubkey) pubkeys.add(a.repostEvent.pubkey);
  }
  return { pubkeys: Array.from(pubkeys), ids: Array.from(ids), addrs: Array.from(addrMap.values()) };
}
