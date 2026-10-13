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
  /** Relay hints for `quoteIds` and `repostId` — from `nevent`s and `e`/`q` tags. */
  quoteRelays: string[];
  mentionPubkeys: string[];
  /** Addressable (naddr / `a`-tag) references — e.g. quoted long-form articles. */
  addrs: AddressRef[];
  repostId?: string;
  /** A kind-6 repost embeds the original event JSON in `content`. */
  repostEvent?: MinimalEvent;
}

/** Decode a `nostr:`-stripped bech32 entity into a pubkey, event id, or address. `relays` are an `nevent`'s hints. */
export function decodeNostrEntity(bech: string): {
  pubkey?: string;
  id?: string;
  relays?: string[];
  address?: AddressRef;
} {
  try {
    const d = nip19.decode(bech);
    if (d.type === "npub") return { pubkey: d.data as string };
    if (d.type === "nprofile") return { pubkey: (d.data as { pubkey: string }).pubkey };
    if (d.type === "note") return { id: d.data as string };
    if (d.type === "nevent") {
      const e = d.data as { id: string; relays?: string[] };
      return { id: e.id, relays: e.relays?.length ? e.relays : undefined };
    }
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

/**
 * Parse an `a` tag value (`kind:pubkey:dTag`) into an address ref. The key is
 * lower-cased: relays return it so, and a store keyed by it never matches an
 * upper-case one.
 */
export function parseATag(value: string, relay?: string): AddressRef | null {
  const parts = value.split(":");
  if (parts.length < 3) return null;
  const kind = parseInt(parts[0], 10);
  const pubkey = parts[1].toLowerCase();
  const identifier = parts.slice(2).join(":");
  if (!Number.isFinite(kind) || !/^[0-9a-f]{64}$/i.test(pubkey)) return null;
  return { kind, pubkey, identifier, relays: relay ? [relay] : undefined };
}

/**
 * Whether an event's `e` tags can make it a reply. Not a highlight's (the
 * text it quotes), and not a replaceable or addressable event's: a bookmark
 * set's `e` tags are the notes it holds, an article's what it cites — never a
 * post it answers; nor a repost's, which is the post it carries. Everything
 * else keeps its thread: a note, a comment, a live-chat message, and the post
 * a reaction or zap is about.
 */
export function isThreadedKind(kind: number): boolean {
  // A repost's `e` (NIP-18) is the post it carries, drawn inside it — not one it answers.
  if (kind === 9802 || kind === 0 || kind === 3 || kind === 6 || kind === 16) return false;
  return !((kind >= 10000 && kind < 20000) || (kind >= 30000 && kind < 40000));
}

/** The relay a tag names beside its id, when it names one. */
function tagRelayOf(t: string[] | undefined): string | undefined {
  return t && typeof t[2] === "string" && /^wss?:\/\//i.test(t[2]) ? t[2] : undefined;
}

const HEX64 = /^[0-9a-f]{64}$/i;

/** NIP-22 comment kind. */
export const COMMENT_KIND = 1111;
/** NIP-A0 voice reply: threads by NIP-22 scopes, as a comment does. */
export const VOICE_REPLY_KIND = 1244;
/** Kinds that thread by NIP-22 scopes (`E`/`A`/`I` root, `e`/`a`/`i` parent). */
const NIP22_KINDS: ReadonlySet<number> = new Set([COMMENT_KIND, VOICE_REPLY_KIND]);
/** NIP-C7 chat message kind: a reply names its parent with a `q` tag. */
export const CHAT_KIND = 9;

/**
 * The message a NIP-C7 chat message (kind 9) answers: its first `q` tag. The
 * spec's own reply also names that parent in its text (`nostr:nevent1…\nyes`),
 * so a `q` the content quotes is still the parent; `analyzeNote` drops it from
 * the quotes, as it is drawn above. A later `q` is a quote.
 */
export function chatParentOf(ev: MinimalEvent): { id: string; relay?: string; pubkey?: string } | null {
  if (ev.kind !== CHAT_KIND) return null;
  const q = (ev.tags || []).find((t) => t[0] === "q" && HEX64.test(t[1] ?? ""));
  if (!q) return null;
  return { id: q[1], relay: tagRelayOf(q), pubkey: HEX64.test(q[3] ?? "") ? q[3] : undefined };
}

/**
 * Whether a NIP-22 comment names a scope at all: an event, an address or an
 * external id, as its parent or its root — one naming only its root answers
 * the root (commentRefs).
 */
function hasCommentParent(tags: string[][]): boolean {
  return tags.some((t) => ["e", "a", "i", "E", "A", "I"].includes(t[0]) && !!t[1]);
}

export function analyzeNote(ev: MinimalEvent): NoteAnalysis {
  const tags = ev.tags || [];
  const eTags = tags.filter((t) => t[0] === "e");
  const pTags = tags
    .filter((t) => t[0] === "p")
    .map((t) => t[1])
    .filter(Boolean);
  const qTags = tags
    .filter((t) => t[0] === "q")
    .map((t) => t[1])
    .filter(Boolean);
  /** The relay a tag names beside its id, when it names one. */
  const tagRelay = (t: string[]) => (typeof t[2] === "string" && /^wss?:\/\//i.test(t[2]) ? [t[2]] : []);
  // Addressable references via `a` tags (NIP-23 article links etc.). A
  // comment's `a` is the thing it answers (its NIP-22 scope), drawn above it
  // as the thread, not again below as a link it carries.
  const tagAddrs = tags
    .filter((t) => t[0] === "a" && typeof t[1] === "string" && !NIP22_KINDS.has(ev.kind))
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
    const quoteRelays = eTags[0] ? tagRelay(eTags[0]) : [];
    // Include pubkeys tagged inside the reposted note's content so the embedded
    // card can show @names instead of raw npubs.
    const innerMentions = repostEvent ? mentionPubkeysFromContent(repostEvent.content) : [];
    const mentionPubkeys = Array.from(new Set([...pTags, ...innerMentions]));
    return {
      isReply: false,
      replyToPubkeys: [],
      quoteIds: [],
      quoteRelays,
      mentionPubkeys,
      addrs: tagAddrs,
      repostId,
      repostEvent,
    };
  }

  // Quotes + mentions + addressable refs embedded in content.
  const contentQuoteIds: string[] = [];
  const contentQuoteRelays: string[] = [];
  const contentMentionPks: string[] = [];
  const contentAddrs: AddressRef[] = [];
  for (const tok of parseNoteContent(ev.content || "")) {
    if (tok.type === "mention") {
      const { pubkey, id, relays, address } = decodeNostrEntity(tok.bech32);
      if (pubkey) contentMentionPks.push(pubkey);
      if (id) contentQuoteIds.push(id);
      if (id && relays) contentQuoteRelays.push(...relays);
      if (address) contentAddrs.push(address);
    }
  }
  const addrs = Array.from(new Map([...tagAddrs, ...contentAddrs].map((a) => [addrCoord(a), a])).values());

  const mentionMarkerIds = eTags
    .filter((t) => t[3] === "mention")
    .map((t) => t[1])
    .filter(Boolean);
  // Any non-"mention" e tag means this is a reply (covers marked + legacy positional),
  // on a kind that threads by them. A comment also answers an address or an
  // external id (NIP-22); a chat message answers the `q` it doesn't quote (NIP-C7).
  const chatParent = chatParentOf(ev);
  const isReply =
    (isThreadedKind(ev.kind) && eTags.some((t) => t[3] !== "mention")) ||
    (NIP22_KINDS.has(ev.kind) && hasCommentParent(tags)) ||
    !!chatParent;
  const quoteIds = Array.from(new Set([...qTags, ...mentionMarkerIds, ...contentQuoteIds])).filter(
    (id) => id !== chatParent?.id,
  );
  const quoteRelays = Array.from(
    new Set([
      ...tags.filter((t) => t[0] === "q" || (t[0] === "e" && t[3] === "mention")).flatMap(tagRelay),
      ...contentQuoteRelays,
    ]),
  );
  const mentionPubkeys = Array.from(new Set([...pTags, ...contentMentionPks]));
  const replyToPubkeys = isReply
    ? Array.from(new Set([...(chatParent?.pubkey ? [chatParent.pubkey] : []), ...pTags]))
    : [];

  return { isReply, replyToPubkeys, quoteIds, quoteRelays, mentionPubkeys, addrs };
}

/**
 * Where a reply sits: the conversation's root and the post it answers. Ids for
 * notes (NIP-10) and chat (NIP-C7); for a NIP-22 comment the root or parent may
 * also be an address (an article, a video) or an external id (a web page, a
 * book — NIP-73), with the kind each scope names (`K`/`k`).
 */
export interface ReplyRefs {
  rootId?: string;
  parentId?: string;
  rootAddr?: AddressRef;
  parentAddr?: AddressRef;
  rootExternal?: string;
  parentExternal?: string;
  rootKind?: string;
  parentKind?: string;
  /** Relays the scope tags name, to look for the root and parent on. */
  hints?: string[];
}

/** Drop the keys nobody set, so an answer compares by what it says. */
function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * A NIP-22 comment's scopes: the parent from lowercase `e`/`a`/`i` (+ `k`), the
 * root from uppercase `E`/`A`/`I` (+ `K`). A comment that names no root scope
 * is read as answering its root directly.
 */
export function commentRefs(ev: MinimalEvent): ReplyRefs {
  const tags = ev.tags || [];
  const first = (name: string) => tags.find((t) => t[0] === name && typeof t[1] === "string" && t[1] !== "");
  const scope = (eName: string, aName: string, iName: string, kName: string) => {
    const e = first(eName);
    const a = first(aName);
    const i = first(iName);
    return {
      id: e?.[1],
      addr: a ? (parseATag(a[1], tagRelayOf(a)) ?? undefined) : undefined,
      external: i?.[1],
      kind: first(kName)?.[1],
      hints: [tagRelayOf(e), tagRelayOf(a)].filter((r): r is string => !!r),
    };
  };
  const parent = scope("e", "a", "i", "k");
  const rootScope = scope("E", "A", "I", "K");
  const hasRoot = !!(rootScope.id || rootScope.addr || rootScope.external);
  const hasParent = !!(parent.id || parent.addr || parent.external);
  if (!hasRoot && !hasParent) return {};
  const root = hasRoot ? rootScope : parent;
  const p = hasParent ? parent : rootScope;
  const hints = Array.from(new Set([...root.hints, ...p.hints]));
  return defined({
    rootId: root.id,
    parentId: p.id,
    rootAddr: root.addr,
    parentAddr: p.addr,
    rootExternal: root.external,
    parentExternal: p.external,
    rootKind: root.kind,
    parentKind: p.kind,
    hints: hints.length ? hints : undefined,
  });
}

/** Whether two thread scopes name the same thing: one id, one address, or one external id. */
export function sameScope(
  a: { id?: string; addr?: AddressRef; external?: string },
  b: { id?: string; addr?: AddressRef; external?: string },
): boolean {
  if (a.addr && b.addr) return addrCoord(a.addr) === addrCoord(b.addr);
  if (a.id && b.id) return a.id === b.id;
  if (a.external && b.external) return a.external === b.external;
  return false;
}

/**
 * A post's heading, where its kind gives it one: a NIP-7D thread's `title`
 * (kind 11), a note's NIP-14 `subject` (kind 1). A reply's "Re: …" subject
 * repeats the post above it and is not a heading.
 */
export function noteHeadingOf(ev: { kind: number; tags: string[][] }): string | null {
  const name = ev.kind === 11 ? "title" : ev.kind === 1 ? "subject" : null;
  if (!name) return null;
  const value = (ev.tags || []).find((t) => t[0] === name && typeof t[1] === "string")?.[1]?.trim();
  if (!value || (name === "subject" && /^re:/i.test(value))) return null;
  return value;
}

/**
 * The thread ancestry of a reply (NIP-10): the conversation `root` and the
 * immediate `parent` it replies to. Handles marked tags (`root`/`reply`) and the
 * legacy positional convention (first e = root, last e = parent); `mention`
 * e-tags are ignored. Returns {} when the note isn't a reply. When a note replies
 * straight to the root, parentId === rootId.
 */
export function replyRefs(ev: MinimalEvent): ReplyRefs {
  // A list's `e` is an item it holds, a highlight's the text it quotes: not a post either answers.
  if (!isThreadedKind(ev.kind)) return {};
  // A comment (and a voice reply) threads by its NIP-22 scopes, which may be addresses or external ids.
  if (NIP22_KINDS.has(ev.kind)) return commentRefs(ev);
  const eTags = (ev.tags || []).filter((t) => t[0] === "e" && t[1]);
  const threadTags = eTags.filter((t) => (t[3] || "") !== "mention");
  if (threadTags.length === 0) {
    // A chat reply names its parent with `q` (NIP-C7); chat has no deeper root.
    const chat = chatParentOf(ev);
    return chat ? defined({ rootId: chat.id, parentId: chat.id, hints: chat.relay ? [chat.relay] : undefined }) : {};
  }
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
export function collectRefs(events: MinimalEvent[]): {
  pubkeys: string[];
  ids: string[];
  idRelays: string[];
  addrs: AddressRef[];
} {
  const pubkeys = new Set<string>();
  const ids = new Set<string>();
  const idRelays = new Set<string>();
  const addrMap = new Map<string, AddressRef>();
  for (const ev of events) {
    const a = analyzeNote(ev);
    a.mentionPubkeys.forEach((pk) => pubkeys.add(pk));
    a.replyToPubkeys.forEach((pk) => pubkeys.add(pk));
    a.quoteIds.forEach((id) => ids.add(id));
    a.quoteRelays.forEach((relay) => idRelays.add(relay));
    a.addrs.forEach((ad) => {
      addrMap.set(addrCoord(ad), ad);
      pubkeys.add(ad.pubkey);
    });
    if (a.repostId) ids.add(a.repostId);
    if (a.repostEvent?.pubkey) pubkeys.add(a.repostEvent.pubkey);
  }
  return {
    pubkeys: Array.from(pubkeys),
    ids: Array.from(ids),
    idRelays: Array.from(idRelays),
    addrs: Array.from(addrMap.values()),
  };
}
