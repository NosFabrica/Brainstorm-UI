/**
 * An event carried inside another event's content or tags, as JSON: a repost's
 * note (NIP-18 kind 6/16), a community approval's post (NIP-72 4550), a zap
 * receipt's request (NIP-57 9735's `description`).
 *
 * Anyone can write any JSON there. Until its signature checks out it is a claim
 * by the carrier, never a post by the author it names: drawn as theirs only
 * once it is a whole event (hex id and pubkey, numeric kind and time, string
 * tags and content) whose id is its hash and whose signature is that author's.
 */
import { verifyEvent, type NostrEvent } from "nostr-tools";

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

/** Tags as NIP-01 has them: arrays of strings. Anything else is not an event's tags. */
export function isStringTags(v: unknown): v is string[][] {
  return Array.isArray(v) && v.every((t) => Array.isArray(t) && t.every((x) => typeof x === "string"));
}

/** A whole NIP-01 event whose id is its hash and whose signature is its author's. Never throws. */
export function isVerifiedEvent(v: unknown): v is NostrEvent {
  const e = v as Partial<NostrEvent> | null;
  if (
    !e ||
    typeof e !== "object" ||
    typeof e.id !== "string" ||
    !HEX64.test(e.id) ||
    typeof e.pubkey !== "string" ||
    !HEX64.test(e.pubkey) ||
    typeof e.sig !== "string" ||
    !HEX128.test(e.sig) ||
    !Number.isSafeInteger(e.kind) ||
    !Number.isSafeInteger(e.created_at) ||
    typeof e.content !== "string" ||
    !isStringTags(e.tags)
  )
    return false;
  try {
    return verifyEvent(e as NostrEvent);
  } catch {
    return false;
  }
}

export interface EmbeddedExpectations {
  /** The id the carrier names for it (a repost's `e`): an event with another id is not the one carried. */
  expectId?: string;
  /** The address the carrier names for it (`kind:pubkey:d`, a generic repost's `a`). */
  expectAddr?: string;
}

/*
 * One check per JSON text, ever: a feed re-reads the same repost on every
 * render, and a Schnorr verification is the costly part. Keyed on the whole
 * text (the thing being checked), never on what it claims to be. Bounded, so a
 * long session's feed does not keep every repost it ever saw.
 */
const MAX_CACHED = 1000;
const CHECKED = new Map<string, NostrEvent | null>();

function checkText(text: string): NostrEvent | null {
  if (CHECKED.has(text)) return CHECKED.get(text)!;
  let read: NostrEvent | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (isVerifiedEvent(parsed)) {
      const e = parsed as NostrEvent;
      // Only the event's own fields: whatever else the JSON carried is not part of what was signed.
      read = Object.freeze({
        id: e.id,
        pubkey: e.pubkey,
        created_at: e.created_at,
        kind: e.kind,
        tags: e.tags,
        content: e.content,
        sig: e.sig,
      }) as NostrEvent;
    }
  } catch {
    read = null;
  }
  if (CHECKED.size >= MAX_CACHED) CHECKED.delete(CHECKED.keys().next().value as string);
  CHECKED.set(text, read);
  return read;
}

const addrOf = (e: NostrEvent) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
/** An address with its kind and key lower-cased; its `d` is case-sensitive. */
const normalAddr = (v: string) => {
  const [kind, pubkey = "", ...d] = v.split(":");
  return [kind, pubkey.toLowerCase(), ...d].join(":");
};

/**
 * The event a JSON text (or an already-parsed value) carries, when it is a
 * whole, signed event — and, when the carrier names it, the one it names.
 * Null otherwise. Never throws.
 */
export function readEmbeddedEvent(json: unknown, expect: EmbeddedExpectations = {}): NostrEvent | null {
  let event: NostrEvent | null;
  if (typeof json === "string") {
    if (!json.trim().startsWith("{")) return null;
    event = checkText(json);
  } else {
    event = isVerifiedEvent(json) ? json : null;
  }
  if (!event) return null;
  if (expect.expectId !== undefined && event.id !== expect.expectId.toLowerCase()) return null;
  if (expect.expectAddr !== undefined && addrOf(event) !== normalAddr(expect.expectAddr)) return null;
  return event;
}
