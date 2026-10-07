/**
 * Private messages for whoever is signed in: one DmEngine per Active Account,
 * started the moment the account is (so the live subscription warms the inbox
 * before Messages is opened) and stopped on a switch or sign-out.
 */
import type { NostrEvent } from "nostr-tools";
import { accountManager } from "@/accounts";
import { LocalAccount } from "@/accounts/local-account";
import { RemoteAccount } from "@/accounts/remote-signer";
import { BrainstormExtensionAccount, EXTENSION_WRAP_DEADLINE_MS } from "@/accounts/extension";
import { isUnlockCancelled } from "@/accounts/local-signer";
import { classifySignerError, messageOf, SignerDeclinedError } from "@/accounts/signer-errors";
import { canSignSilently, signAs, signingFailure, type PublishOutcome } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { eventStore } from "@/lib/eventStore";
import { deviceSealer, dmCacheBackend } from "@/lib/dm/cache";
import { DM_RELAY_LIST_KIND, dmRelayTags, loadDmRelays } from "@/lib/dm/inboxRelays";
import { ensureReadFloor } from "@/lib/dm/prefs";
import { hydrateDmPrefs, startDmPrefsSync } from "@/lib/dm/prefsSync";
import { publishToRelays } from "@/services/nostr";
import { DmEngine, type DmAccount, type SendResult, type SignerFailure } from "./engine";
import { encryptFile, fileTags } from "@/lib/dm/fileCrypto";
import { FILE_KIND } from "@/lib/dm/giftWrap";
import { publishBlossomServers, uploadToBlossom } from "@/services/blossom";
import { ENCRYPTED_BLOSSOM_SERVERS, encryptedUploadServers, loadBlossomServers } from "@/lib/blossomServers";
import { poolTransport } from "./transport";

function classifyFor(account: BrainstormAccount) {
  return (error: unknown): SignerFailure => {
    const kind = classifySignerError(error);
    if (kind === "cancelled") return "cancelled";
    // Ran out of time, or the extension isn't here yet: not a "no", and not the message's fault.
    if (kind === "timeout" || kind === "missing") return "unreachable";
    // Asked too fast: a pace to keep, never a fault — not even for a key held here.
    if (kind === "rate-limited") return "rate-limited";
    // The extension is on another profile: its key can't open these, but this account's can.
    if (kind === "wrong-account") return "wrong-account";
    // A key held here can't say no: once unlocked, any failure is the payload's.
    if (account instanceof LocalAccount) return "broken";
    // A payload that won't decrypt is broken for good.
    if (kind === "bad-payload") return "broken";
    // Only a "no" is a no. Anything else — Alby locked since this page enabled it
    // ("Password is not set") — failed without asking anyone: calling it a decline
    // told the reader they had refused a prompt they never saw. Neither is ever
    // remembered as "unreadable".
    return kind === "declined" ? "refused" : "failed";
  };
}

/** A bunker can send a whole JSON-RPC error; the notice quotes a line, not a page. */
const EXPLAIN_MAX = 200;

/**
 * The signer's own words, for the reader to act on: Alby's "permission denied"
 * (this site blocked in its settings) or "Password is not set" (locked). Not our
 * own wrapper for a signer that answered nothing — that says nothing new.
 */
function explainSignerError(error: unknown): string | undefined {
  // By name too, as classifySignerError checks it: a copy from another bundle chunk is still ours.
  if (error instanceof SignerDeclinedError || (error as { name?: unknown })?.name === "SignerDeclinedError")
    return undefined;
  const text = messageOf(error).trim();
  return text.length > EXPLAIN_MAX ? `${text.slice(0, EXPLAIN_MAX - 1)}…` : text || undefined;
}

/**
 * The most wraps a NIP-46 signer opens at once. Each wrap is two round trips (the
 * wrap, then its seal) through the bunker's relay to the signer app and back, about
 * 0.7s each: one at a time, a 240-message inbox took over five minutes to open. A
 * signer that limits its rate (Amethyst: a burst of ~40, then "rate limited") is
 * met by the engine slowing down and carrying on, not by a lower ceiling here.
 */
export const REMOTE_DECRYPT_CONCURRENCY = 6;

/**
 * Opening messages, past the Account's request queue for a NIP-46 signer only. The
 * queue runs every request one at a time; a bunker answers each by its id, so there
 * is nothing to keep in order — and decrypts don't prompt once allowed. Signing and
 * sealing still queue: those are where a signer asks, and where order matters.
 */
function openerFor(account: BrainstormAccount) {
  if (account instanceof RemoteAccount) return account.signer.nip44;
  return account.nip44;
}

/**
 * How the engine opens wraps for this account's kind of signer.
 * - NIP-46: several at once, and a request the signer dropped is given up early.
 * - An extension: one at a time — its requests queue one at a time anyway, and a
 *   second wrap waiting behind a 30s silence ran out its deadline before it was even
 *   asked, showing "unreachable" and losing the extension's verdict on the first.
 *   Its deadline covers the signer's own worst case, so the signer always decides
 *   first; never given up early.
 */
export function engineOptionsFor(account: BrainstormAccount) {
  if (account instanceof RemoteAccount) return { concurrency: REMOTE_DECRYPT_CONCURRENCY, dropDetection: true };
  if (account instanceof BrainstormExtensionAccount)
    return { concurrency: 1, dropDetection: false, decryptTimeoutMs: EXTENSION_WRAP_DEADLINE_MS };
  return { dropDetection: false };
}

export function dmAccountFor(account: BrainstormAccount): DmAccount {
  const nip44 = account.nip44;
  const opener = openerFor(account);
  return {
    pubkey: account.pubkey,
    decrypt: opener ? (counterparty, ciphertext) => opener.decrypt(counterparty, ciphertext) : undefined,
    sealSigner: nip44
      ? {
          pubkey: account.pubkey,
          encrypt: (recipient, plaintext) => nip44.encrypt(recipient, plaintext),
          signSeal: (template) => signAs(account, template),
        }
      : undefined,
    // Only a key held here opens messages unasked, and only if it can unlock
    // without the Recovery-password modal. Extensions and bunkers prompt in their
    // own app, so they wait until the reader opens Messages.
    canOpenInBackground: async () => account instanceof LocalAccount && (await canSignSilently(account)),
    classify: classifyFor(account),
    explain: explainSignerError,
  };
}

let current: DmEngine | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of [...listeners]) l();
}

function startFor(account: BrainstormAccount | undefined) {
  if (current?.pubkey === account?.pubkey) return;
  current?.stop();
  current = null;
  if (account) {
    ensureReadFloor(account.pubkey);
    // Pinned/muted/accepted chats from the account's encrypted copy. A key held here
    // can open it unasked; an extension or bunker would prompt, so it waits for Messages.
    if (account instanceof LocalAccount) void hydrateDmPrefs(account.pubkey);
    current = new DmEngine(dmAccountFor(account), {
      ...engineOptionsFor(account),
      transport: poolTransport,
      loadInbox: (pubkey, opts) => loadDmRelays(pubkey, opts),
      cache: dmCacheBackend(),
      sealer: deviceSealer,
    });
    void current.start();
  }
  notify();
}

/** Begin following the Active Account. Called once at boot (main.tsx). */
export function startDirectMessages(): () => void {
  const stopPrefsSync = startDmPrefsSync();
  startFor(accountManager.active);
  const sub = accountManager.active$.subscribe((account) => startFor(account));
  return () => {
    sub.unsubscribe();
    stopPrefsSync();
    startFor(undefined);
  };
}

/** The engine for the Active Account, or null when signed out. */
export function dmEngine(): DmEngine | null {
  return current;
}

export function subscribeDmEngine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Turn private messages on: publish the inbox list. The inbox relays sign the
 * reader in (NIP-42) when they ask (services/relayAuth) — they won't hand over
 * an inbox otherwise.
 */
export async function turnOnMessages(relays: string[]): Promise<PublishOutcome> {
  const account = accountManager.active;
  if (!account) return { success: false, error: "Sign in first." };
  const outcome = await turnOnInbox(account, relays);
  if (outcome.success) await ensureBlossomServers(account.pubkey);
  return outcome;
}

/**
 * Attachments need somewhere to go: someone with no Blossom server list (kind 10063)
 * gets one naming servers that take encrypted files. Never replaces a list they have,
 * and a failure here doesn't undo turning messages on — uploads fall back to the
 * same servers anyway.
 */
async function ensureBlossomServers(pubkey: string): Promise<void> {
  const existing = await loadBlossomServers(pubkey, { fresh: true, timeoutMs: 6000 }).catch(() => null);
  if (!existing || existing.found) return;
  await publishBlossomServers(ENCRYPTED_BLOSSOM_SERVERS).catch(() => {});
}

async function turnOnInbox(account: { pubkey: string }, relays: string[]): Promise<PublishOutcome> {
  // "No inbox list" may only have been a slow lookup: never replace one the
  // account already published (from another client) with our suggestions.
  const existing = await loadDmRelays(account.pubkey, { fresh: true, timeoutMs: 6000 }).catch(() => null);
  if (existing?.relays.length) {
    if (current?.pubkey === account.pubkey) void current.refreshInbox();
    return { success: true };
  }
  return publishInboxRelays(relays);
}

/**
 * Publish the account's inbox relay list (kind 10050), where everyone sends
 * them private messages. Also sent to the relays themselves, so a client that
 * looks there finds it.
 */
export async function publishInboxRelays(relays: string[]): Promise<PublishOutcome> {
  const account = accountManager.active;
  if (!account) return { success: false, error: "Sign in first." };
  let signed: NostrEvent;
  try {
    signed = await signAs(account, { kind: DM_RELAY_LIST_KIND, tags: dmRelayTags(relays), content: "" });
  } catch (error) {
    return signingFailure(error);
  }
  eventStore.add(signed);
  // One relay taking it is enough to start; a dead one shouldn't hold up setup.
  const outcome = await publishToRelays(signed, relays, { need: 1, timeoutMs: 8000 });
  if (current?.pubkey === account.pubkey) void current.refreshInbox();
  return outcome;
}

/** Image dimensions, for the `dim` tag (best effort). */
function imageDim(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(`${img.naturalWidth}x${img.naturalHeight}`);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(undefined);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Send a file (NIP-17 kind 15): encrypted here with a fresh AES-GCM key,
 * uploaded as ciphertext, and the key sent only inside the wrapped message.
 */
export async function sendFile(
  engine: DmEngine,
  room: string,
  file: File,
  opts: { replyTo?: string; timer?: number; subject?: string } = {},
): Promise<SendResult> {
  const enc = await encryptFile(new Uint8Array(await file.arrayBuffer()));
  let url: string;
  try {
    // Their own servers (kind 10063) first; ones known to take ciphertext after.
    const me = accountManager.active?.pubkey;
    const own = me ? ((await loadBlossomServers(me, { timeoutMs: 2500 }).catch(() => null))?.servers ?? []) : [];
    url = await uploadToBlossom(
      new Blob([enc.cipher], { type: "application/octet-stream" }),
      "Upload encrypted file",
      encryptedUploadServers(own),
    );
  } catch (error) {
    if (isUnlockCancelled(error)) return { ok: false, error: "Cancelled" };
    return { ok: false, error: "Couldn't upload the file. Please try again." };
  }
  const tags = fileTags(file, enc, await imageDim(file));
  return engine.send(room, url, { ...opts, kind: FILE_KIND, tags });
}

// Development only: lets a console (or a browser test) look at the engine.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __dm?: unknown }).__dm = { dmEngine };
}
