/**
 * NIP-59 gift wrapping for NIP-17 private messages: rumor → seal → wrap.
 *
 * - The **rumor** is the message itself (kind 14 chat, kind 15 file, kind 7
 *   reaction), complete with id but never signed, so a leaked copy proves
 *   nothing about who wrote it.
 * - The **seal** (kind 13) is the rumor NIP-44-encrypted to one recipient and
 *   signed by the sender. Its tags are empty: nothing in it says who it is for.
 * - The **wrap** (kind 1059) is the seal encrypted again, signed by a key made
 *   for this one message, and p-tagged to the recipient so their inbox relays
 *   know where it goes.
 *
 * Both outer timestamps are pushed up to two days into the past, so a relay
 * cannot line up a wrap with the moment it was written. That is the buffer the
 * history pager has to respect (lib/dm/pager): a wrap dated D can carry a
 * message written as late as D + 2 days.
 *
 * Written against the account surface rather than applesauce's gift-wrap
 * factory: the factory only jitters timestamps by an hour, and a seal must be
 * signed through `signAs` so the Active Account — not whatever signer is in
 * reach — is the one speaking.
 */
import { finalizeEvent, generateSecretKey, getEventHash, nip44, verifyEvent, type NostrEvent } from "nostr-tools";

export const SEAL_KIND = 13;
export const GIFT_WRAP_KIND = 1059;
export const CHAT_KIND = 14;
export const FILE_KIND = 15;
export const REACTION_KIND = 7;

/** NIP-59: outer timestamps are randomized up to two days into the past. */
export const WRAP_JITTER_SECONDS = 2 * 24 * 60 * 60;

/** An unsigned event that carries its own id. */
export interface Rumor {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

/** The two operations wrapping needs from the sender's key. */
export interface SealSigner {
  pubkey: string;
  /** NIP-44 encrypt to `recipient` with the sender's key. */
  encrypt(recipient: string, plaintext: string): Promise<string>;
  /** Sign the seal as the sender. Seals carry no tags. */
  signSeal(template: { kind: number; created_at: number; tags: string[][]; content: string }): Promise<NostrEvent>;
}

/** NIP-44 decrypt with the reader's key, from the given counterparty. */
export type Decrypt = (counterparty: string, ciphertext: string) => Promise<string>;

const now = () => Math.floor(Date.now() / 1000);

/** A moment up to two days before `at`, for a seal or a wrap. */
export function randomPast(at = now(), random = Math.random): number {
  return at - Math.floor(random() * WRAP_JITTER_SECONDS);
}

/** Build a rumor and stamp its id. */
export function makeRumor(fields: Omit<Rumor, "id" | "created_at"> & { created_at?: number }): Rumor {
  const base = { created_at: now(), ...fields };
  const unsigned = {
    pubkey: base.pubkey,
    created_at: base.created_at,
    kind: base.kind,
    tags: base.tags,
    content: base.content,
  };
  return { ...unsigned, id: getEventHash(unsigned) };
}

/** Seal `rumor` for `recipient`, then wrap it with a one-time key. */
export async function wrapRumor(
  rumor: Rumor,
  recipient: string,
  signer: SealSigner,
  opts: { expiration?: number; at?: number; random?: () => number } = {},
): Promise<NostrEvent> {
  const at = opts.at ?? now();
  const random = opts.random ?? Math.random;
  const seal = await signer.signSeal({
    kind: SEAL_KIND,
    created_at: randomPast(at, random),
    tags: [],
    content: await signer.encrypt(recipient, JSON.stringify(rumor)),
  });

  const key = generateSecretKey();
  const tags: string[][] = [["p", recipient]];
  if (opts.expiration) tags.push(["expiration", String(opts.expiration)]);
  return finalizeEvent(
    {
      kind: GIFT_WRAP_KIND,
      created_at: randomPast(at, random),
      tags,
      content: nip44.encrypt(JSON.stringify(seal), nip44.getConversationKey(key, recipient)),
    },
    key,
  );
}

export interface Unwrapped {
  rumor: Rumor;
  seal: NostrEvent;
  wrap: NostrEvent;
}

/** Why a wrap could not be opened — kept apart so a caller can tell "not for us" from "broken". */
export class UnwrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnwrapError";
  }
}

function parseEvent(json: string, what: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new UnwrapError(`${what} is not an event`);
}

const isHex64 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

function asRumor(raw: Record<string, unknown>): Rumor {
  const { pubkey, created_at, kind, tags, content } = raw;
  if (!isHex64(pubkey) || typeof created_at !== "number" || typeof kind !== "number" || typeof content !== "string")
    throw new UnwrapError("rumor is malformed");
  if (!Array.isArray(tags) || !tags.every((t) => Array.isArray(t) && t.every((v) => typeof v === "string")))
    throw new UnwrapError("rumor tags are malformed");
  const unsigned = { pubkey, created_at, kind, tags: tags as string[][], content };
  // The id is recomputed rather than trusted: a sender could otherwise reuse
  // another message's id and replace it in our store.
  return { ...unsigned, id: getEventHash(unsigned) };
}

/**
 * Open a wrap addressed to the reader. Two decrypts, in order: the wrap with
 * its one-time key, then the seal with its author's key. Throws `UnwrapError`
 * when anything doesn't hold — a forged seal, a rumor claiming another author.
 */
export async function unwrapGiftWrap(wrap: NostrEvent, decrypt: Decrypt): Promise<Unwrapped> {
  if (wrap.kind !== GIFT_WRAP_KIND) throw new UnwrapError("not a gift wrap");
  if (!verifyEvent(wrap)) throw new UnwrapError("gift wrap signature is invalid");

  const seal = parseEvent(await decrypt(wrap.pubkey, wrap.content), "seal") as unknown as NostrEvent;
  if (seal.kind !== SEAL_KIND) throw new UnwrapError("inner event is not a seal");
  if (!verifyEvent(seal)) throw new UnwrapError("seal signature is invalid");

  const rumor = asRumor(parseEvent(await decrypt(seal.pubkey, seal.content), "rumor"));
  // NIP-59: the seal's signature is the only proof of authorship, so the rumor
  // must claim the same author or anyone could put words in someone's mouth.
  if (rumor.pubkey !== seal.pubkey) throw new UnwrapError("rumor author does not match the seal");
  return { rumor, seal, wrap };
}

/** NIP-40, on the wrap or the rumor: the moment a message asked to be forgotten. */
export function expirationOf(event: { tags: string[][] }): number | undefined {
  const value = event.tags.find((t) => t[0] === "expiration")?.[1];
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
