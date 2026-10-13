/**
 * Signed events carried inside other events, checked before they are believed:
 * a zap receipt's request (NIP-57 9734 in the 9735's `description`), a
 * community approval's post (NIP-72 4550 content).
 *
 * A zap receipt is signed by the recipient's wallet service, not the payer.
 * The payer is only ever a claim the receipt repeats: the request it embeds,
 * whose signature is the one thing that ties a person to the zap. A request
 * that does not verify, or that names another event, payer or recipient than
 * the receipt does, is a claim and nothing more. (Even a verified one proves
 * that person ASKED to zap; that the receipt is real is the wallet's word,
 * checkable only against the recipient's LNURL `nostrPubkey`.)
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

/**
 * Signature checks are the costly part, and a zap poll's tally re-reads every
 * receipt as each one arrives: remember each embedded JSON's answer. Bounded —
 * the oldest answers go first.
 */
const SIGNED = new Map<string, boolean>();
const SIGNED_MAX = 5000;
function signedJson(raw: string, parsed: unknown): boolean {
  const held = SIGNED.get(raw);
  if (held !== undefined) return held;
  const ok = isVerifiedEvent(parsed);
  if (SIGNED.size >= SIGNED_MAX) SIGNED.delete(SIGNED.keys().next().value as string);
  SIGNED.set(raw, ok);
  return ok;
}

export interface ZapRequest {
  /** The request's own id; one request is one payment, however many receipts repeat it. */
  id: string | null;
  /** Who signed the request — a throwaway key on an anonymous zap. */
  pubkey: string | null;
  content: string;
  /** Its tags, string ones only. */
  tags: string[][];
  /** `anon` (NIP-57): signed by a throwaway key, so it names nobody. */
  anonymous: boolean;
  /**
   * Signed, a 9734, and about what the receipt says it is about: the same `e`,
   * `a` and `p`, and — when the receipt names its payer in `P` — signed by them.
   */
  verified: boolean;
}

const first = (tags: string[][], name: string) => tags.find((t) => t[0] === name && typeof t[1] === "string")?.[1];

/** A zap receipt's embedded request, read and checked against the receipt. Null when it carries none. */
export function readZapRequest(receipt: { tags: string[][] }): ZapRequest | null {
  const raw = first(receipt.tags, "description");
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const req = parsed as Record<string, unknown>;
  const tags = Array.isArray(req.tags)
    ? (req.tags as unknown[]).filter((t): t is string[] => Array.isArray(t) && t.every((x) => typeof x === "string"))
    : [];
  const pubkey =
    typeof req.pubkey === "string" && HEX64.test(req.pubkey.toLowerCase()) ? req.pubkey.toLowerCase() : null;
  const P = first(receipt.tags, "P")?.toLowerCase();
  // The receipt copies these from the request; one that differs is about something else.
  const agrees = (name: string) => {
    const said = first(receipt.tags, name);
    return said === undefined || first(tags, name)?.toLowerCase() === said.toLowerCase();
  };
  const verified =
    req.kind === 9734 &&
    !!pubkey &&
    (P === undefined || P === pubkey) &&
    agrees("e") &&
    agrees("a") &&
    agrees("p") &&
    signedJson(raw, parsed);
  return {
    id: typeof req.id === "string" && HEX64.test(req.id) ? req.id : null,
    pubkey,
    content: typeof req.content === "string" ? req.content : "",
    tags,
    anonymous: tags.some((t) => t[0] === "anon"),
    verified,
  };
}
