/**
 * What a NIP-17 conversation IS: the set of people in it. There is no room id
 * on the wire — the sender plus every `p` tag names the room, so adding or
 * removing someone is, by definition, a different chat.
 */
import { nip19 } from "nostr-tools";
import { CHAT_KIND, FILE_KIND, REACTION_KIND, type Rumor } from "./giftWrap";

const isHex64 = (v: string) => /^[0-9a-f]{64}$/.test(v);

/** Everyone in the conversation a rumor belongs to, sender included, sorted. */
export function participantsOf(rumor: Pick<Rumor, "pubkey" | "tags">): string[] {
  const set = new Set<string>([rumor.pubkey]);
  for (const t of rumor.tags) if (t[0] === "p" && t[1] && isHex64(t[1])) set.add(t[1]);
  return [...set].sort();
}

/** The stable key for a room: its sorted participants. */
export function roomKey(participants: Iterable<string>): string {
  return [...new Set(participants)].sort().join(",");
}

/** The people in a room other than `me` — who a 1:1 chat is "with". */
export function othersIn(key: string, me: string): string[] {
  const all = key.split(",").filter(Boolean);
  const others = all.filter((pk) => pk !== me);
  // A note to self is a room of one; it is "with" yourself.
  return others.length ? others : all;
}

/**
 * The room as a URL segment: the other people as npubs joined by "+". Readable,
 * shareable with yourself, and needs no lookup table to resolve.
 */
export function roomSlug(key: string, me: string): string {
  return othersIn(key, me)
    .map((pk) => nip19.npubEncode(pk))
    .join("+");
}

/** The inverse of `roomSlug`; null when any part isn't an npub (or hex key). */
export function roomKeyFromSlug(slug: string, me: string): string | null {
  const others: string[] = [];
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null; // "/messages/%zz" — a bad link, not a crash
  }
  for (const part of decoded.split("+")) {
    const p = part.trim();
    if (!p) continue;
    if (isHex64(p)) {
      others.push(p);
      continue;
    }
    try {
      const id = nip19.decode(p);
      if (id.type === "npub") others.push(id.data);
      else if (id.type === "nprofile") others.push(id.data.pubkey);
      else return null;
    } catch {
      return null;
    }
  }
  if (!others.length) return null;
  return roomKey([me, ...others]);
}

export function tagValue(rumor: Pick<Rumor, "tags">, name: string): string | undefined {
  return rumor.tags.find((t) => t[0] === name)?.[1];
}

/** NIP-17: the chat's current name rides on the newest message that sets one. */
export function subjectOf(rumor: Pick<Rumor, "tags">): string | undefined {
  const s = tagValue(rumor, "subject")?.trim();
  return s || undefined;
}

/** The message a chat message replies to (its `e` tag), if any. */
export function replyTargetOf(rumor: Pick<Rumor, "kind" | "tags">): string | undefined {
  if (rumor.kind !== CHAT_KIND && rumor.kind !== FILE_KIND) return undefined;
  const marked = rumor.tags.find((t) => t[0] === "e" && t[3] === "reply")?.[1];
  return marked ?? tagValue(rumor, "e");
}

/** For a reaction: which message it is about. */
export function reactionTargetOf(rumor: Pick<Rumor, "kind" | "tags">): string | undefined {
  if (rumor.kind !== REACTION_KIND) return undefined;
  const es = rumor.tags.filter((t) => t[0] === "e" && t[1]);
  return es[es.length - 1]?.[1];
}

/** How a reaction reads: NIP-25's "+" is a like; anything else is shown as sent. */
export function reactionLabel(content: string): string {
  const c = content.trim();
  if (!c || c === "+") return "❤️";
  if (c === "-") return "👎";
  return c.length > 8 ? c.slice(0, 8) : c;
}

/** A kind-15 file message's metadata (NIP-17 "File Message"). */
export interface FileMeta {
  url: string;
  mime?: string;
  algorithm?: string;
  key?: string;
  nonce?: string;
  /** sha256 of the encrypted bytes. */
  hash?: string;
  size?: number;
  dim?: string;
  blurhash?: string;
  /** The sender's file name (a "name" tag; inside the encrypted message, so only the chat sees it). */
  name?: string;
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/json": "json",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "weba",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * What to call a file: the sender's name for it, else its URL's last segment with an
 * extension the file type agrees with. Blossom names blobs by hash, and encrypted ones
 * come back as "<hash>.bin", which tells the reader nothing.
 */
export function fileDisplayName(meta: Pick<FileMeta, "url" | "mime" | "name">): string {
  if (meta.name) return meta.name;
  const last = meta.url.split("/").pop()?.split(/[?#]/)[0] || "";
  const base = last.replace(/\.[a-z0-9]{1,5}$/i, "") || "Attachment";
  const ext = (meta.mime && EXTENSIONS[meta.mime.toLowerCase()]) || last.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  const shortBase = /^[0-9a-f]{64}$/i.test(base) ? `File ${base.slice(0, 8)}` : base;
  return ext && ext !== "bin" ? `${shortBase}.${ext}` : shortBase;
}

export function fileMetaOf(rumor: Pick<Rumor, "kind" | "tags" | "content">): FileMeta | undefined {
  if (rumor.kind !== FILE_KIND) return undefined;
  const url = rumor.content.trim();
  if (!/^https?:\/\//i.test(url)) return undefined;
  const size = Number(tagValue(rumor, "size"));
  return {
    url,
    mime: tagValue(rumor, "file-type"),
    algorithm: tagValue(rumor, "encryption-algorithm"),
    key: tagValue(rumor, "decryption-key"),
    nonce: tagValue(rumor, "decryption-nonce"),
    hash: tagValue(rumor, "x"),
    size: Number.isFinite(size) && size > 0 ? size : undefined,
    dim: tagValue(rumor, "dim"),
    blurhash: tagValue(rumor, "blurhash"),
    name: tagValue(rumor, "name")?.trim() || undefined,
  };
}

/** The tags a new chat message carries: everyone but the sender, a reply, a name. */
export function chatTags(
  recipients: string[],
  opts: { replyTo?: string; subject?: string; expiration?: number } = {},
): string[][] {
  const tags = recipients.map((pk) => ["p", pk]);
  if (opts.replyTo) tags.push(["e", opts.replyTo, "", "reply"]);
  if (opts.subject?.trim()) tags.push(["subject", opts.subject.trim()]);
  if (opts.expiration) tags.push(["expiration", String(opts.expiration)]);
  return tags;
}

/** How a kind-15 reads in a preview or a notification: "Voice message", "Photo", "File". */
export function fileLabel(rumor: Pick<Rumor, "kind" | "tags">): string {
  const mime = tagValue(rumor, "file-type") ?? "";
  if (mime.startsWith("audio/")) return "Voice message";
  if (mime.startsWith("image/")) return "Photo";
  if (mime.startsWith("video/")) return "Video";
  return "File";
}
