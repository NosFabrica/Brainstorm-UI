/**
 * Private messages for whoever is signed in: one DmEngine per Active Account,
 * started the moment the account is (so the live subscription warms the inbox
 * before Messages is opened) and stopped on a switch or sign-out.
 */
import type { NostrEvent } from "nostr-tools";
import { accountManager } from "@/accounts";
import { LocalAccount } from "@/accounts/local-account";
import { isUnlockCancelled } from "@/accounts/local-signer";
import { isRemoteSignerTimeout } from "@/accounts/remote-signer";
import { canSignSilently, signAs, signingFailure, type PublishOutcome } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { eventStore } from "@/lib/eventStore";
import { deviceSealer, dmCacheBackend } from "@/lib/dm/cache";
import { DM_RELAY_LIST_KIND, dmRelayTags, loadDmRelays } from "@/lib/dm/inboxRelays";
import { ensureReadFloor } from "@/lib/dm/prefs";
import { publishToRelays } from "@/services/nostr";
import { DmEngine, type DmAccount, type SendResult, type SignerFailure } from "./engine";
import { encryptFile, fileTags } from "@/lib/dm/fileCrypto";
import { FILE_KIND } from "@/lib/dm/giftWrap";
import { uploadToBlossom } from "@/services/blossom";
import { poolTransport } from "./transport";

function classify(error: unknown): SignerFailure {
  if (isUnlockCancelled(error)) return "cancelled";
  if (isRemoteSignerTimeout(error)) return "unreachable";
  const message = error instanceof Error ? error.message : String(error);
  // A payload that won't decrypt is broken for good; anything else is the
  // signer saying no, which must never be remembered as "unreadable".
  if (/invalid (mac|payload|padding|base64)|unknown version|invalid.*length/i.test(message)) return "broken";
  return "refused";
}

export function dmAccountFor(account: BrainstormAccount): DmAccount {
  const nip44 = account.nip44;
  return {
    pubkey: account.pubkey,
    decrypt: nip44 ? (counterparty, ciphertext) => nip44.decrypt(counterparty, ciphertext) : undefined,
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
    classify,
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
    current = new DmEngine(dmAccountFor(account), {
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
  startFor(accountManager.active);
  const sub = accountManager.active$.subscribe((account) => startFor(account));
  return () => {
    sub.unsubscribe();
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
  opts: { replyTo?: string; timer?: number } = {},
): Promise<SendResult> {
  const enc = await encryptFile(new Uint8Array(await file.arrayBuffer()));
  let url: string;
  try {
    url = await uploadToBlossom(new Blob([enc.cipher], { type: "application/octet-stream" }), "Upload encrypted file");
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
