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

export interface ZapRequest {
  /** The request's own id; one request is one payment, however many receipts repeat it. */
  id: string | null;
  /** Who signed the request — a throwaway key on an anonymous zap. */
  pubkey: string | null;
  /** The zap's comment (NIP-57: the request's content), untrimmed. */
  content: string;
  /** Its tags, string ones only. */
  tags: string[][];
  /** `anon` (NIP-57): signed by a throwaway key, so it names nobody. */
  anonymous: boolean;
  /**
   * Signed, a 9734, and about what the receipt says it is about: the same set
   * of `e` and of `a`, the same `p`, and — when the receipt names its payer in
   * `P` — signed by them.
   */
  verified: boolean;
}

/** A receipt's `description`, parsed: the request as it claims to be, before any check. */
export interface ZapDescription {
  /** The parsed JSON, for the signature check. */
  parsed: Record<string, unknown>;
  id: string | null;
  pubkey: string | null;
  kind: unknown;
  content: string;
  tags: string[][];
}

const first = (tags: string[][], name: string) => tags.find((t) => t[0] === name && typeof t[1] === "string")?.[1];
const valuesOf = (tags: string[][], name: string, norm: (v: string) => string) =>
  new Set(tags.filter((t) => t[0] === name && typeof t[1] === "string").map((t) => norm(t[1])));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((v) => b.has(v));
const lower = (v: string) => v.toLowerCase();
/** An address with its kind and key lower-cased; its `d` is case-sensitive. */
const normalAddr = (v: string) => {
  const [kind, pubkey = "", ...d] = v.split(":");
  return [kind, pubkey.toLowerCase(), ...d].join(":");
};

/*
 * Both answers are kept per receipt EVENT (the object the store hands out), so
 * a zap poll's tally — re-read over every receipt as each one arrives — parses
 * each description once and checks each signature once, ever. Never keyed on
 * what the request claims (its id or signature): that is the thing unchecked.
 */
const DESCRIPTIONS = new WeakMap<object, ZapDescription | null>();
const REQUESTS = new WeakMap<object, ZapRequest | null>();

/** A receipt's embedded request as JSON says it, unchecked; null when it carries none. Read once per receipt. */
export function zapDescription(receipt: { tags: string[][] }): ZapDescription | null {
  if (DESCRIPTIONS.has(receipt)) return DESCRIPTIONS.get(receipt)!;
  const read = parseDescription(receipt);
  DESCRIPTIONS.set(receipt, read);
  return read;
}

function parseDescription(receipt: { tags: string[][] }): ZapDescription | null {
  const raw = first(receipt.tags, "description");
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const req = parsed as Record<string, unknown>;
  const tags = Array.isArray(req.tags)
    ? (req.tags as unknown[]).filter((t): t is string[] => Array.isArray(t) && t.every((x) => typeof x === "string"))
    : [];
  return {
    parsed: req,
    id: typeof req.id === "string" && HEX64.test(req.id) ? req.id : null,
    pubkey: typeof req.pubkey === "string" && HEX64.test(req.pubkey.toLowerCase()) ? req.pubkey.toLowerCase() : null,
    kind: req.kind,
    content: typeof req.content === "string" ? req.content : "",
    tags,
  };
}

/** A zap receipt's embedded request, read and checked against the receipt. Null when it carries none. */
export function readZapRequest(receipt: { tags: string[][] }): ZapRequest | null {
  if (REQUESTS.has(receipt)) return REQUESTS.get(receipt)!;
  const read = checkRequest(receipt);
  REQUESTS.set(receipt, read);
  return read;
}

function checkRequest(receipt: { tags: string[][] }): ZapRequest | null {
  const desc = zapDescription(receipt);
  if (!desc) return null;
  const { tags, pubkey } = desc;
  const P = first(receipt.tags, "P")?.toLowerCase();
  const receiptP = first(receipt.tags, "p")?.toLowerCase();
  const requestP = first(tags, "p")?.toLowerCase();
  const verified =
    desc.kind === 9734 &&
    !!pubkey &&
    (P === undefined || P === pubkey) &&
    // The receipt copies these from the request (NIP-57). One that names more,
    // fewer or other events is about something else than what was asked.
    sameSet(valuesOf(receipt.tags, "e", lower), valuesOf(tags, "e", lower)) &&
    sameSet(valuesOf(receipt.tags, "a", normalAddr), valuesOf(tags, "a", normalAddr)) &&
    receiptP === requestP &&
    isVerifiedEvent(desc.parsed);
  return {
    id: desc.id,
    pubkey,
    content: desc.content,
    tags,
    anonymous: tags.some((t) => t[0] === "anon"),
    verified,
  };
}
