import { nip19, finalizeEvent, getPublicKey, generateSecretKey, verifyEvent } from "nostr-tools";
import { decrypt as decryptSecretKeyNip49 } from "nostr-tools/nip49";
import { RelayPool } from "applesauce-relay";
import { env } from "@/lib/runtimeEnv";
import { isVaultSupported, encryptSecret, decryptSecret } from "@/lib/skVault";

const RAW_NIP85_RELAY_URL = env.VITE_NIP85_RELAY_URL;
const NIP85_RELAY_URL = RAW_NIP85_RELAY_URL.trim().replace(/\/+$/, "");

if (!NIP85_RELAY_URL) {
  // eslint-disable-next-line no-console
  console.error(
    "[nostr] VITE_NIP85_RELAY_URL is not set. NIP-85 publish/read flows will fail. " +
      "Set VITE_NIP85_RELAY_URL at build time (see README and Dockerfile).",
  );
}

export function getNip85RelayUrl(): string {
  if (!NIP85_RELAY_URL) {
    throw new Error(
      "VITE_NIP85_RELAY_URL is not configured. NIP-85 publish/read flows are disabled. " +
        "Set VITE_NIP85_RELAY_URL at build time (see README and Dockerfile).",
    );
  }
  return NIP85_RELAY_URL;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
import { EventStore, firstValueFrom } from "applesauce-core";
import {
  getProfileContent,
  getDisplayName,
  getProfilePicture,
  isValidProfile,
} from "applesauce-core/helpers/profile";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { ExtensionMissingError } from "applesauce-signers";
import { apiClient } from "./api";
import { sessions, SessionTransportError } from "@/accounts/session";
import { LocalAccount } from "@/accounts/local-account";
import {
  activeAccount,
  canSignSilently,
  decryptFromSelf,
  encryptToSelf,
  requireActiveAccount,
  signAs,
  signingFailure,
  type PublishOutcome,
} from "@/accounts/signing";
import { adoptAccount, extensionAccount, localAccount, releaseActiveAccount } from "@/accounts/login";
import type { AccountMetadata, BrainstormAccount } from "@/accounts/metadata";
import { activePubkey, rememberProfile } from "@/accounts/display";
import { queryClient } from "@/lib/queryClient";
import { extractAdminFlag } from "@/lib/jwt";
import { recordFollowList } from "@/lib/followStore";
import { isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { NostrEvent } from "applesauce-core/helpers";

// Ephemeral session copy for non-persistent logins (nsec paste without "remember
// me", extension fallback) — plaintext, cleared when the tab closes.
const SK_STORAGE_KEY = "brainstorm_sk_hex";
// LEGACY plaintext persistent key. Read-only now (for one-time migration); we no
// longer write it except in the rare vault-unsupported fallback. See SK_ENC_KEY.
const SK_PERSIST_KEY = "brainstorm_sk_hex_persist";
// Persistent account key, ENCRYPTED at rest (skVault device-key wrap). Holds a
// versioned envelope, never the raw key. This is the default for created/restored
// accounts that "stay signed in".
const SK_ENC_KEY = "brainstorm_sk_enc";

export type LoginErrorCode =
  | "NO_EXTENSION"
  | "EXTENSION_FAILED"
  | "PERMISSION_DENIED"
  | "SIGN_CANCELLED"
  | "INVALID_NSEC"
  | "SERVER_ERROR";

export class LoginError extends Error {
  code: LoginErrorCode;
  constructor(code: LoginErrorCode, message: string) {
    super(message);
    this.name = "LoginError";
    this.code = code;
  }
}

// The decrypted persistent key lives ONLY here — a module-level variable, never
// written back to any storage API. It's populated by `storeSecretKey` (fresh
// login/create) or by `ensureUnlocked` (silent async decrypt on cold boot).
let memSk: Uint8Array | null = null;
let unlockPromise: Promise<void> | null = null;

/**
 * Populate `memSk` from persisted storage, decrypting the encrypted envelope if
 * needed. Idempotent + memoized so concurrent callers share one in-flight decrypt.
 * Silent (no password, no prompt). Also performs the one-time legacy→encrypted
 * migration. Safe to call eagerly on boot and defensively before any local sign.
 */
export async function ensureUnlocked(): Promise<void> {
  if (memSk) return;
  if (unlockPromise) {
    await unlockPromise;
    return;
  }
  unlockPromise = doUnlock();
  try {
    await unlockPromise;
  } finally {
    unlockPromise = null;
  }
}

async function doUnlock(): Promise<void> {
  if (memSk) return;

  let sess: string | null = null;
  let encEnvelope: string | null = null;
  let legacy: string | null = null;
  try {
    sess = sessionStorage.getItem(SK_STORAGE_KEY);
    encEnvelope = localStorage.getItem(SK_ENC_KEY);
    legacy = localStorage.getItem(SK_PERSIST_KEY);
  } catch {
    return;
  }

  // Ephemeral session key (non-persistent login) — plaintext, never migrated.
  if (sess) {
    try {
      memSk = hexToBytes(sess);
    } catch {
      /* ignore */
    }
    return;
  }

  // Encrypted persistent key → decrypt with the device key, bound to this
  // account's pubkey (AAD). A foreign/corrupt envelope throws → treated as "no
  // key" (the user re-authenticates).
  if (encEnvelope) {
    const pubkey = activePubkey();
    if (pubkey && isVaultSupported()) {
      try {
        memSk = await decryptSecret(encEnvelope, pubkey);
      } catch {
        memSk = null;
      }
    }
    return;
  }

  // Legacy plaintext persist → migrate in place: hold in memory, re-encrypt, and
  // delete the plaintext. One-time, transparent, no user action.
  if (legacy) {
    try {
      memSk = hexToBytes(legacy);
    } catch {
      return;
    }
    if (isVaultSupported()) {
      try {
        const envelope = await encryptSecret(memSk, getPublicKey(memSk));
        localStorage.setItem(SK_ENC_KEY, envelope);
        localStorage.removeItem(SK_PERSIST_KEY);
      } catch {
        /* leave the plaintext key as-is (vault-unsupported fallback) */
      }
    }
  }
}

/**
 * Persist (or session-scope) a freshly-obtained secret key and hold it in memory.
 * Persistent keys are ENCRYPTED at rest via the device-key wrap; only if the
 * vault is unavailable do we fall back to plaintext localStorage (parity with the
 * old behavior — never orphan a brand-new account). Non-persistent keys stay in
 * plaintext sessionStorage (ephemeral, cleared on tab close).
 */
async function storeSecretKey(sk: Uint8Array, opts?: { persistent?: boolean }): Promise<void> {
  memSk = sk;
  try {
    if (opts?.persistent) {
      sessionStorage.removeItem(SK_STORAGE_KEY);
      if (isVaultSupported()) {
        try {
          const envelope = await encryptSecret(sk, getPublicKey(sk));
          localStorage.setItem(SK_ENC_KEY, envelope);
          localStorage.removeItem(SK_PERSIST_KEY);
          return;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            "[skVault] at-rest encryption failed — falling back to plaintext persist",
            err,
          );
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn("[skVault] at-rest encryption unavailable — falling back to plaintext persist");
      }
      // Fallback: plaintext persist (no worse than the prior behavior).
      localStorage.setItem(SK_PERSIST_KEY, bytesToHex(sk));
      localStorage.removeItem(SK_ENC_KEY);
    } else {
      sessionStorage.setItem(SK_STORAGE_KEY, bytesToHex(sk));
      localStorage.removeItem(SK_PERSIST_KEY);
      localStorage.removeItem(SK_ENC_KEY);
    }
  } catch {
    /* ignore */
  }
}

function clearSecretKey(): void {
  memSk = null;
  unlockPromise = null;
  try {
    sessionStorage.removeItem(SK_STORAGE_KEY);
    localStorage.removeItem(SK_PERSIST_KEY);
    localStorage.removeItem(SK_ENC_KEY);
  } catch {}
}

/** True when a secret key is held or persisted in any form (memory / session /
 * encrypted / legacy plaintext). A presence check — does NOT decrypt. */
function hasAnyStoredKey(): boolean {
  if (memSk) return true;
  try {
    return !!(
      sessionStorage.getItem(SK_STORAGE_KEY) ||
      localStorage.getItem(SK_ENC_KEY) ||
      localStorage.getItem(SK_PERSIST_KEY)
    );
  } catch {
    return false;
  }
}

/** True when an in-app–created account's key is persisted locally ("stay signed in"). */
export function hasPersistentKey(): boolean {
  try {
    return !!(localStorage.getItem(SK_ENC_KEY) || localStorage.getItem(SK_PERSIST_KEY));
  } catch {
    return false;
  }
}

/**
 * True when we hold the raw secret key for this account (created/restored account
 * persisted locally, OR an nsec pasted into the session) — i.e. when we can back
 * it up or reveal it. False for extension logins, where the key never leaves the
 * signer. Presence check only; the actual bytes come via `ensureUnlocked`.
 */
export function hasStoredSecretKey(): boolean {
  return hasAnyStoredKey();
}

/**
 * Sign an event with a freshly-generated THROWAWAY key. Used for anonymous
 * NIP-57 zaps from logged-out visitors: the key is ephemeral and discarded, so
 * the zap still appears in nostr clients (as an anonymous npub) instead of only
 * landing in the recipient's wallet. `finalizeEvent` sets pubkey/id/sig from the
 * generated key.
 */
export function signEventWithEphemeralKey(event: Record<string, unknown>): Record<string, unknown> {
  const sk = generateSecretKey();
  return finalizeEvent(event as any, sk) as unknown as Record<string, unknown>;
}

export interface NostrUser {
  pubkey: string;
  npub: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  profile?: ProfileContent;
  userData?: any;
  isAdmin?: boolean;
}


const eventStore = new EventStore();

let currentUser: NostrUser | null = null;

// One-time cleanup of pre-Task-#85 unscoped Brainstorm Assistant keys.
// These were stored globally so that one account's assistant identity bled
// into the next account that logged in on the same device. Per-user keys
// (prefix `brainstorm_assistant:<owner>:`) replace them; the legacy keys
// can be safely removed on app boot.
(function cleanupLegacyAssistantKeysOnce() {
  try {
    const legacy = [
      "brainstorm_assistant_pubkey",
      "brainstorm_assistant_event_id",
      "brainstorm_assistant_published_at",
      "brainstorm_assistant_first_publish_done",
      "brainstorm_assistant_profile",
      "brainstorm_assistant_dismissed",
    ];
    for (const k of legacy) {
      try { localStorage.removeItem(k); } catch {}
    }
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("brainstorm_assistant_picture_set:")) toRemove.push(k);
    }
    for (const k of toRemove) {
      try { localStorage.removeItem(k); } catch {}
    }
  } catch {}
})();

export function getCurrentUser(): NostrUser | null {
  if (currentUser) return currentUser;

  const stored = localStorage.getItem("nostr_user");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as NostrUser;
      if (parsed.isAdmin === undefined) {
        const token = localStorage.getItem("brainstorm_session_token");
        if (token) {
          parsed.isAdmin = extractAdminFlag(token);
          localStorage.setItem("nostr_user", JSON.stringify(parsed));
        }
      }
      currentUser = parsed;
      return currentUser;
    } catch {
      return null;
    }
  }
  return null;
}

function setCurrentUser(user: NostrUser | null) {
  const prev = currentUser;
  const prevPubkey = prev?.pubkey ?? null;
  currentUser = user;
  if (user) {
    localStorage.setItem("nostr_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("nostr_user");
  }
  const nextPubkey = user?.pubkey ?? null;
  const pubkeyChanged = prevPubkey !== nextPubkey;
  // v1 shadow: nothing listens any more — the header reads the Active Account's
  // metadata (ticket 06). The dispatch goes with the cache, in ticket 17.
  const profileChanged =
    !!user &&
    !!prev &&
    prev.pubkey === user.pubkey &&
    (prev.picture !== user.picture || prev.displayName !== user.displayName);
  if (pubkeyChanged || profileChanged) {
    try {
      window.dispatchEvent(new CustomEvent("brainstorm-user-changed", {
        detail: { previous: prevPubkey, current: nextPubkey },
      }));
    } catch {}
  }
}

export function updateCurrentUser(updates: Partial<NostrUser>) {
  const existing = getCurrentUser();
  if (!existing) return;
  const updated = { ...existing, ...updates };
  setCurrentUser(updated);
}

export function clearUserCache() {
  currentUser = null;
}

export const PROFILE_RELAYS = [
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://purplepag.es/",
  "wss://nostr.wine/",
];

/** Relays that actually carry note/article content (dropping purplepag.es, which
 *  is a profile-only relay). Used for hashtag / content queries. */
export const CONTENT_RELAYS = [
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://nostr.wine/",
];

const pool = new RelayPool();

export function fetchProfiles(
  pubkeys: string[],
  onProfile?: (pubkey: string, profile: ProfileContent) => void
): Promise<void> {
  return new Promise<void>((resolve) => {
    pool.request(PROFILE_RELAYS, { kinds: [0], authors: pubkeys }).subscribe({
      next: (event) => {
        try { 
          if (eventStore.add(event)) {
            if (onProfile && isValidProfile(event)) {
              const content = getProfileContent(event);
              if (content) onProfile(event.pubkey, content);
            }
          }; 
        } catch {}
      },
      error: () => resolve(),
      complete: () => resolve(),
    });
  });
}

export async function fetchOutboxRelayList(pubkey: string, timeoutMs = 10000): Promise<NostrEvent | undefined> {
  try {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS)

    const event = await Promise.race([
      firstValueFrom(pool.request(writeRelays, { kinds: [10002], authors: [pubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);

    if (!event) return undefined;

    try {
      eventStore.add(event as any);
    } catch {}

    return event as NostrEvent;
  } catch {}

  return undefined;
}

export async function fetchTrustProviderList(pubkey: string, timeoutMs = 10000): Promise<NostrEvent | undefined> {
  try {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS)

    const event = await Promise.race([
      firstValueFrom(pool.request(writeRelays, { kinds: [10040], authors: [pubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);

    if (!event) return undefined;

    try {
      eventStore.add(event as any);
    } catch {}

    return event as NostrEvent;
  } catch {}

  return undefined;
}


export interface Nip85TagCheck {
  present: boolean;
  innerPubkey: string | null;
  relayHint: string | null;
  pubkeyMatches: boolean;
  relayMatches: boolean;
}

export interface Nip85TagDetail {
  index: number;
  innerPubkey: string | null;
  relayHint: string | null;
  pubkeyMatches: boolean;
  relayMatches: boolean;
  isWinner: boolean;
}

export interface Nip85HealthCheck {
  expectedTaPubkey: string | null;
  expectedRelay: string;
  expectedRelayConfigured: boolean;
  eventFound: boolean;
  createdAt: number | null;
  rankTag: Nip85TagCheck;
  followersTag: Nip85TagCheck;
  rankTags: Nip85TagDetail[];
  followersTags: Nip85TagDetail[];
  rawEvent: NostrEvent | null;
}

const EMPTY_TAG_CHECK: Nip85TagCheck = {
  present: false,
  innerPubkey: null,
  relayHint: null,
  pubkeyMatches: false,
  relayMatches: false,
};

export async function checkNip85Health(
  pubkey: string,
  expectedTaPubkey: string | null,
  timeoutMs = 10000,
): Promise<Nip85HealthCheck> {
  const expectedRelay = NIP85_RELAY_URL;
  const expectedRelayConfigured = expectedRelay.length > 0;

  const event = await fetchTrustProviderList(pubkey, timeoutMs);

  const result: Nip85HealthCheck = {
    expectedTaPubkey,
    expectedRelay,
    expectedRelayConfigured,
    eventFound: !!event,
    createdAt: event?.created_at ?? null,
    rankTag: { ...EMPTY_TAG_CHECK },
    followersTag: { ...EMPTY_TAG_CHECK },
    rankTags: [],
    followersTags: [],
    rawEvent: event ?? null,
  };

  if (!event) return result;

  // Aggregate per-slot using existential ("any matching tag wins") semantics
  // to match the behavior of isUsingBrainstorm. If multiple tags of the same
  // type exist, a single matching tag is enough to mark the slot healthy.
  // We surface the matching tag's values when present; otherwise we fall back
  // to the first tag of that type so admins can still see what was published.
  const slots = ["rankTag", "followersTag"] as const;
  const tagNameFor = { rankTag: "30382:rank", followersTag: "30382:followers" } as const;

  for (const slot of slots) {
    const matching = event.tags.filter(
      (t) => Array.isArray(t) && t.length > 0 && t[0] === tagNameFor[slot],
    );
    if (matching.length === 0) continue;

    let anyPubkeyMatches = false;
    let anyRelayMatches = false;
    let bestTag: string[] | null = null;
    let pubkeyMatchTag: string[] | null = null;
    let relayMatchTag: string[] | null = null;
    const details: Nip85TagDetail[] = [];

    matching.forEach((tag, idx) => {
      const inner = typeof tag[1] === "string" ? tag[1] : null;
      const hint = typeof tag[2] === "string" ? tag[2] : null;
      const pubkeyOk = !!expectedTaPubkey && inner === expectedTaPubkey;
      // Preserve loose-equality semantics from isUsingBrainstorm by normalizing
      // both sides to strings before strict comparison.
      const relayOk = expectedRelayConfigured && hint !== null && String(hint) === String(expectedRelay);
      if (pubkeyOk) {
        anyPubkeyMatches = true;
        pubkeyMatchTag = pubkeyMatchTag ?? tag;
      }
      if (relayOk) {
        anyRelayMatches = true;
        relayMatchTag = relayMatchTag ?? tag;
      }
      if (pubkeyOk && relayOk) {
        bestTag = bestTag ?? tag;
      }
      details.push({
        index: idx,
        innerPubkey: inner,
        relayHint: hint,
        pubkeyMatches: pubkeyOk,
        relayMatches: relayOk,
        isWinner: false,
      });
    });

    // Prefer the fully-matching tag for display; otherwise prefer one matching
    // pubkey, then one matching relay, then the first tag we saw.
    const display = bestTag ?? pubkeyMatchTag ?? relayMatchTag ?? matching[0];
    const winnerIdx = matching.indexOf(display);
    if (winnerIdx >= 0 && details[winnerIdx]) {
      details[winnerIdx].isWinner = true;
    }
    const inner = typeof display[1] === "string" ? display[1] : null;
    const hint = typeof display[2] === "string" ? display[2] : null;

    result[slot] = {
      present: true,
      innerPubkey: inner,
      relayHint: hint,
      pubkeyMatches: anyPubkeyMatches,
      relayMatches: anyRelayMatches,
    };
    if (slot === "rankTag") result.rankTags = details;
    else result.followersTags = details;
  }

  return result;
}

export async function isUsingBrainstorm(pubkey: string, innerPubkey: string, timeoutMs = 10000): Promise<boolean> {
  console.log("isUsingBrainstorm", pubkey, innerPubkey)
  const event = await fetchTrustProviderList(pubkey, timeoutMs)

  let isUsingRank = false
  let isUsingFollowers = false

  if (event) {
    for (const tag of event.tags) {
      if (tag[0] === "30382:rank" && tag[1] === innerPubkey && tag[2] == NIP85_RELAY_URL) {
        isUsingRank = true
      }
      if (tag[0] === "30382:followers" && tag[1] === innerPubkey && tag[2] == NIP85_RELAY_URL) {
        isUsingFollowers = true
      }
    }
  }

  return isUsingRank && isUsingFollowers
}

export function loadOutboxRelayListFromDb(pubkey: string, currentRelays: string[]): string[] {
  const outboxEvent = eventStore.getReplaceable(10002, pubkey)
  const writeRelays = new Set<string>(currentRelays);
  
  if (outboxEvent) {
    for (const tag of outboxEvent.tags) {
      if (tag[0] === "r" && tag[1] && (tag.length <= 2 || tag[2] === "write")) {
        writeRelays.add(tag[1]);
      }
    }
  }

  return Array.from(writeRelays)
}

// NIP-78 application-specific data: stores the user's Brainstorm Assistant
// pointer (assistant pubkey + kind 0 event id) under their own pubkey so any
// device they sign in from can rediscover their existing assistant.
export const ASSISTANT_POINTER_D_TAG = "brainstorm.world/assistant";

export interface AssistantPointer {
  pubkey: string;
  eventId: string;
  publishedAt: number;
}

export async function fetchAssistantPointer(
  userPubkey: string,
  timeoutMs = 10000,
): Promise<AssistantPointer | null> {
  try {
    const writeRelays = loadOutboxRelayListFromDb(userPubkey, PROFILE_RELAYS);

    // NIP-78 events are addressable/replaceable — different relays may hold
    // different versions. Collect candidates across relays for the duration
    // of the timeout and pick the newest by `created_at` so we hydrate from
    // the most recent pointer rather than whichever relay answered first.
    const newest = await new Promise<any | null>((resolve) => {
      let best: any = null;
      const sub = pool.request(writeRelays, {
        kinds: [30078],
        authors: [userPubkey],
        "#d": [ASSISTANT_POINTER_D_TAG],
      }).subscribe({
        next: (event: any) => {
          try { eventStore.add(event); } catch {}
          if (!best || (event?.created_at ?? 0) > (best?.created_at ?? 0)) {
            best = event;
          }
        },
        error: () => { try { sub.unsubscribe(); } catch {} resolve(best); },
        complete: () => resolve(best),
      });
      setTimeout(() => { try { sub.unsubscribe(); } catch {} resolve(best); }, timeoutMs);
    });

    if (!newest) return null;

    let parsed: any = null;
    try { parsed = JSON.parse((newest as any).content || "{}"); } catch { return null; }
    const pubkey = typeof parsed?.pubkey === "string" ? parsed.pubkey : null;
    const eventId = typeof parsed?.event_id === "string" ? parsed.event_id : null;
    if (!pubkey || !eventId) return null;
    const publishedAt = Number(parsed.published_at) ||
      ((newest as any).created_at ? (newest as any).created_at * 1000 : Date.now());
    return { pubkey, eventId, publishedAt };
  } catch {
    return null;
  }
}

export async function publishAssistantPointer(
  pointer: AssistantPointer,
  { background = false }: { background?: boolean } = {},
): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  // The self-heal on app load is nobody's request, so a Locked Account that can't
  // open silently is left alone and syncs its pointer on a later load.
  if (background && !(await canSignSilently(account))) return { success: false, deferred: true };

  try {
    const signed = await signAs(account, {
      kind: 30078,
      tags: [["d", ASSISTANT_POINTER_D_TAG]],
      content: JSON.stringify({
        pubkey: pointer.pubkey,
        event_id: pointer.eventId,
        published_at: pointer.publishedAt,
      }),
    });
    return await publishToRelays(signed);
  } catch (err) {
    return signingFailure(err, "Failed to sign");
  }
}

// NIP-78 application-specific data: a user's PUBLIC-PROFILE personalization —
// what to hide, the section order, hand-picked "Followed by" people, and roles —
// stored under their own pubkey so they own it and it's portable across clients.
export const PROFILE_PREFS_D_TAG = "brainstorm.world/profile-prefs";

/** Fetch the latest published profile-prefs JSON for a pubkey (or null). The
 *  caller coerces it via `parseProfilePrefs`. Readable by anyone — drives what
 *  every visitor sees on the owner's /p page. */
export async function fetchProfilePrefs(
  pubkey: string,
  timeoutMs = 8000,
): Promise<Record<string, unknown> | null> {
  try {
    const relays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS);
    const newest = await new Promise<any | null>((resolve) => {
      let best: any = null;
      const sub = pool.request(relays, {
        kinds: [30078],
        authors: [pubkey],
        "#d": [PROFILE_PREFS_D_TAG],
      }).subscribe({
        next: (event: any) => {
          try { eventStore.add(event); } catch {}
          if (!best || (event?.created_at ?? 0) > (best?.created_at ?? 0)) best = event;
        },
        error: () => { try { sub.unsubscribe(); } catch {} resolve(best); },
        complete: () => resolve(best),
      });
      setTimeout(() => { try { sub.unsubscribe(); } catch {} resolve(best); }, timeoutMs);
    });
    if (!newest) return null;
    try { return JSON.parse((newest as any).content || "{}"); } catch { return null; }
  } catch {
    return null;
  }
}

/** Publish (sign + relay) the logged-in user's profile-prefs as a kind-30078
 *  event under their own key. */
export async function publishProfilePrefs(prefs: unknown): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const signed = await signAs(account, {
      kind: 30078,
      tags: [["d", PROFILE_PREFS_D_TAG]],
      content: JSON.stringify(prefs),
    });
    return await publishToRelays(signed);
  } catch (err) {
    return signingFailure(err, "Failed to sign");
  }
}

// NIP-78 application-specific data: the user's PRIVATE Network-Alerts prefs
// (today: the "ignored" list). Unlike profile-prefs above this is NOT public —
// which flagged accounts you chose to dismiss is your own moderation state, and
// publishing it in the clear would leak those decisions (and read as an
// association with them). So the content is NIP-44 encrypted to yourself: still
// portable across your devices/clients, readable only by your key.
export const ALERT_PREFS_D_TAG = "brainstorm.world/alert-prefs";

/** Fetch + decrypt the logged-in user's alert prefs (or null if none/unreadable). */
export const SCORE_JOURNAL_D_TAG = "brainstorm.world/score-journal";

/** Fetch + decrypt one of the user's private app-data blobs (or null). */
export async function fetchAlertPrefs(timeoutMs = 6000, dTag: string = ALERT_PREFS_D_TAG): Promise<Record<string, unknown> | null> {
  const account = activeAccount();
  if (!account) return null;
  // These hydrate on page load, so decrypting must never raise the unlock modal:
  // a Locked Account that can't open silently keeps its local copy and syncs on a
  // later load, exactly as background publishing defers.
  if (!(await canSignSilently(account))) return null;
  try {
    const relays = loadOutboxRelayListFromDb(account.pubkey, PROFILE_RELAYS);
    const newest = await new Promise<any | null>((resolve) => {
      let best: any = null;
      const sub = pool.request(relays, {
        kinds: [30078],
        authors: [account.pubkey],
        "#d": [dTag],
      }).subscribe({
        next: (event: any) => {
          if (!best || (event?.created_at ?? 0) > (best?.created_at ?? 0)) best = event;
        },
        error: () => { try { sub.unsubscribe(); } catch {} resolve(best); },
        complete: () => resolve(best),
      });
      setTimeout(() => { try { sub.unsubscribe(); } catch {} resolve(best); }, timeoutMs);
    });
    const content = (newest as any)?.content;
    if (!content) return null;
    const plain = await decryptFromSelf(account, content);
    if (!plain) return null;
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

/** Encrypt + publish the logged-in user's alert prefs as a kind-30078 event. */
export async function publishAlertPrefs(
  prefs: unknown,
  dTag: string = ALERT_PREFS_D_TAG,
  { background = false }: { background?: boolean } = {},
): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  // App-data writes that ride along with a page load are nobody's request, so a
  // Locked Account that can't open silently syncs on a later load instead.
  if (background && !(await canSignSilently(account))) return { success: false, deferred: true };
  try {
    const ciphertext = await encryptToSelf(account, JSON.stringify(prefs));
    if (!ciphertext) return { success: false, error: "Could not encrypt" };
    const signed = await signAs(account, {
      kind: 30078,
      tags: [["d", dTag]],
      content: ciphertext,
    });
    return await publishToRelays(signed);
  } catch (err) {
    return signingFailure(err, "Failed to sign");
  }
}

export async function fetchProfileEvent(
  pubkey: string,
  timeoutMs = 10000,
  extraRelays: string[] = [],
): Promise<NostrEvent | undefined> {
  try {
    const baseRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS);
    const extras = extraRelays.map((r) => r.trim()).filter((r) => r.length > 0);
    const writeRelays = Array.from(new Set([...baseRelays, ...extras]));
    const event = await Promise.race([
      firstValueFrom(pool.request(writeRelays, { kinds: [0], authors: [pubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);
    if (!event) return undefined;
    try { eventStore.add(event as any); } catch {}
    return event as NostrEvent;
  } catch {}
  return undefined;
}

async function fetchProfileFromRelays(
  pubkey: string,
  timeoutMs: number,
  extraRelays: string[] = [],
): Promise<ProfileContent | undefined> {
  const event = await fetchProfileEvent(pubkey, timeoutMs, extraRelays);
  if (!event) return undefined;
  if (isValidProfile(event as any)) {
    return getProfileContent(event as any);
  }
  if (typeof event.content === "string") {
    try {
      return JSON.parse(event.content) as ProfileContent;
    } catch {}
  }
  return undefined;
}

/**
 * Trusted lightning-address lookup for PAYMENT paths. Fetches the raw kind-0
 * event, cryptographically verifies its signature AND that it was signed by the
 * expected pubkey, then returns the `lud16` from that verified event. Returns
 * `null` if the profile can't be verified (so callers must NOT pay an
 * unverified / forged address). Use this — not a parsed `profile.lud16` — before
 * resolving an LNURL to send sats.
 */
export async function getVerifiedProfileLud16(
  pubkey: string,
  timeoutMs = 10000,
): Promise<{ lud16: string | null; verified: boolean }> {
  const event = await fetchProfileEvent(pubkey, timeoutMs);
  if (!event) return { lud16: null, verified: false };
  try {
    if (event.pubkey !== pubkey || !verifyEvent(event as any)) {
      return { lud16: null, verified: false };
    }
  } catch {
    return { lud16: null, verified: false };
  }
  if (typeof event.content !== "string") return { lud16: null, verified: true };
  try {
    const content = JSON.parse(event.content) as { lud16?: unknown };
    const lud16 = typeof content?.lud16 === "string" ? content.lud16 : null;
    return { lud16, verified: true };
  } catch {
    return { lud16: null, verified: true };
  }
}

export async function fetchProfile(pubkey: string, timeoutMs = 10000): Promise<ProfileContent | undefined> {
  // Relay-only. Kind-0 metadata is read from the author's outbox relays (merged
  // with PROFILE_RELAYS) — no external HTTP gateways (nostr.band / nostrhttp).
  return fetchProfileFromRelays(pubkey, timeoutMs);
}

/**
 * Fetch a kind-0 profile for the public share page, from relays only — including
 * any `nprofile` relay hints, so a profile not yet on the default relay set can
 * still be resolved.
 */
export async function fetchProfileForShare(
  pubkey: string,
  opts: { relayHints?: string[]; timeoutMs?: number } = {},
): Promise<ProfileContent | undefined> {
  return fetchProfileFromRelays(pubkey, opts.timeoutMs ?? 10000, opts.relayHints ?? []);
}

/**
 * NIP-39 external identity claims from a kind-0 event — the `i` tags, e.g.
 * `["i", "github:alice", "<proof>"]`. Returns the raw `platform:identity`
 * claim strings (parsed for display by `lib/externalIdentity`). Reuses the
 * cached kind-0 event, so it piggybacks on the share-page profile fetch.
 */
export async function fetchExternalIdentities(
  pubkey: string,
  opts: { relayHints?: string[]; timeoutMs?: number } = {},
): Promise<string[]> {
  const event = await fetchProfileEvent(pubkey, opts.timeoutMs ?? 10000, opts.relayHints ?? []);
  if (!event) return [];
  return (event.tags || [])
    .filter((t) => t[0] === "i" && typeof t[1] === "string" && t[1].includes(":"))
    .map((t) => t[1] as string);
}

/**
 * Fetch the most recent events of the given kinds for an author, newest first.
 * Generic relay query feeding the share page's content "teaser" blocks (notes,
 * photos, articles, …). Merges the author's outbox relays with optional
 * `nprofile` relay hints, de-dupes across relays, and caps to `limit`.
 */
export async function fetchRecentByKinds(
  pubkey: string,
  kinds: number[],
  limit = 5,
  opts: { relayHints?: string[]; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const relays = Array.from(new Set([
    ...loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS),
    ...(opts.relayHints ?? []).map((r) => r.trim()).filter((r) => r.length > 0),
  ]));

  return new Promise<NostrEvent[]>((resolve) => {
    const collected = new Map<string, NostrEvent>();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sub.unsubscribe(); } catch {}
      const arr = Array.from(collected.values())
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .slice(0, limit);
      resolve(arr);
    };

    const timer = setTimeout(finish, timeoutMs);
    const sub = pool.request(relays, { kinds, authors: [pubkey], limit }).subscribe({
      next: (event) => {
        try { eventStore.add(event); } catch {}
        collected.set((event as NostrEvent).id, event as NostrEvent);
      },
      error: () => finish(),
      complete: () => finish(),
    });
  });
}

/**
 * Fetch a profile's NIP-53 live events (kind 30311). Unlike other content these
 * are usually authored by the streaming PLATFORM (zap.stream, etc.) with the
 * streamer referenced via a `p`-tag "host" — so we query BOTH `authors` and
 * `#p`, and add the zap.stream relay where most live events live. De-duped to
 * the latest per addressable coordinate.
 */
export async function fetchLiveStreams(
  pubkey: string,
  opts: { relayHints?: string[]; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  // Live events are authored by the streaming PLATFORM, so they live on common
  // relays + the streaming relay — NOT (only) the streamer's own outbox. Always
  // include the big shared relays so a platform-hosted stream is found.
  const relays = Array.from(new Set([
    ...PROFILE_RELAYS,
    ...loadOutboxRelayListFromDb(pubkey, []),
    ...(opts.relayHints ?? []).map((r) => r.trim()).filter((r) => r.length > 0),
    "wss://relay.zap.stream/",
    "wss://relay.nostr.band/",
  ]));

  return new Promise<NostrEvent[]>((resolve) => {
    const collected = new Map<string, NostrEvent>();
    let done = false;
    let completed = 0;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { subA.unsubscribe(); } catch {}
      try { subP.unsubscribe(); } catch {}
      // Keep the latest version per addressable coordinate (kind:pubkey:d).
      const byCoord = new Map<string, NostrEvent>();
      for (const ev of collected.values()) {
        const d = ev.tags.find((t) => t[0] === "d")?.[1] || "";
        const coord = `${ev.kind}:${ev.pubkey}:${d}`;
        const prev = byCoord.get(coord);
        if (!prev || (ev.created_at || 0) > (prev.created_at || 0)) byCoord.set(coord, ev);
      }
      resolve(Array.from(byCoord.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 8));
    };

    const onComplete = () => { if (++completed >= 2) finish(); };
    const handler = {
      next: (event: unknown) => { try { eventStore.add(event as NostrEvent); } catch {} collected.set((event as NostrEvent).id, event as NostrEvent); },
      error: onComplete,
      complete: onComplete,
    };
    const timer = setTimeout(finish, timeoutMs);
    const subA = pool.request(relays, { kinds: [30311], authors: [pubkey], limit: 8 }).subscribe(handler);
    const subP = pool.request(relays, { kinds: [30311], "#p": [pubkey], limit: 8 }).subscribe(handler);
  });
}

/**
 * Fetch events by id (referenced/quoted/reposted notes for the share page's
 * rich note rendering). De-dupes across relays; resolves once all relays
 * complete or the timeout fires.
 */
export async function fetchEventsByIds(
  ids: string[],
  relays: string[] = PROFILE_RELAYS,
  timeoutMs = 6000,
): Promise<NostrEvent[]> {
  const unique = Array.from(new Set(ids.filter((id) => /^[0-9a-f]{64}$/i.test(id))));
  if (!unique.length) return [];
  const targetRelays = relays.length ? relays : PROFILE_RELAYS;
  return new Promise<NostrEvent[]>((resolve) => {
    const collected = new Map<string, NostrEvent>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sub.unsubscribe(); } catch {}
      resolve(Array.from(collected.values()));
    };
    const timer = setTimeout(finish, timeoutMs);
    const sub = pool.request(targetRelays, { ids: unique }).subscribe({
      next: (event) => {
        try { eventStore.add(event); } catch {}
        collected.set((event as NostrEvent).id, event as NostrEvent);
        if (collected.size >= unique.length) finish();
      },
      error: () => finish(),
      complete: () => finish(),
    });
  });
}

/**
 * Generic relay query: collect events matching an arbitrary Nostr filter until
 * EOSE or timeout, deduped by id. Used to fetch a post's reply thread
 * (`{ "#e": [id], kinds: [1] }`) and, later, engagement (kinds 7/9735).
 */
export async function fetchEventsByFilter(
  filter: Record<string, unknown>,
  relays: string[] = PROFILE_RELAYS,
  timeoutMs = 6000,
): Promise<NostrEvent[]> {
  const targetRelays = relays.length ? relays : PROFILE_RELAYS;
  return new Promise<NostrEvent[]>((resolve) => {
    const collected = new Map<string, NostrEvent>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sub.unsubscribe(); } catch {}
      resolve(Array.from(collected.values()));
    };
    const timer = setTimeout(finish, timeoutMs);
    const sub = pool.request(targetRelays, filter as Parameters<typeof pool.request>[1]).subscribe({
      next: (event) => {
        try { eventStore.add(event); } catch {}
        collected.set((event as NostrEvent).id, event as NostrEvent);
      },
      error: () => finish(),
      complete: () => finish(),
    });
  });
}

/**
 * Fetch notes + long-form articles carrying a `#t` hashtag tag, newest first.
 * Powers the `/t/:hashtag` content feed. Queries content relays only (not the
 * profile-only relay). The tag is lowercased — Nostr `t` tags are lowercase by
 * convention.
 */
export async function fetchNotesByHashtag(
  tag: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const t = tag.toLowerCase().replace(/^#/, "").trim();
  if (!t) return [];
  const events = await fetchEventsByFilter(
    { kinds: [1, 30023], "#t": [t], limit: opts.limit ?? 100 },
    CONTENT_RELAYS,
    opts.timeoutMs ?? 6000,
  );
  return events.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

/**
 * Fetch addressable/replaceable events (kind-30000+, e.g. NIP-23 articles) by
 * coordinate — what an `naddr` or `a` tag points to. For each
 * `{kind, pubkey, identifier}` queries `{kinds, authors, "#d"}` (a single
 * combined filter), keeps the NEWEST version per coordinate, and returns a
 * `Map` keyed by `kind:pubkey:identifier`. Used by the share page to resolve
 * articles referenced inside notes into rich cards.
 */
export async function fetchAddressableEvents(
  coords: { kind: number; pubkey: string; identifier: string; relays?: string[] }[],
  relays: string[] = PROFILE_RELAYS,
  timeoutMs = 6000,
): Promise<Map<string, NostrEvent>> {
  const result = new Map<string, NostrEvent>();
  const valid = coords.filter((c) => c && Number.isFinite(c.kind) && /^[0-9a-f]{64}$/i.test(c.pubkey));
  if (!valid.length) return result;
  const coordKey = (c: { kind: number; pubkey: string; identifier: string }) =>
    `${c.kind}:${c.pubkey}:${c.identifier}`;
  const wanted = new Set(valid.map(coordKey));
  const targetRelays = Array.from(new Set(
    [...relays, ...valid.flatMap((c) => c.relays ?? [])].map((r) => r.trim()).filter(Boolean),
  ));
  const kinds = Array.from(new Set(valid.map((c) => c.kind)));
  const authors = Array.from(new Set(valid.map((c) => c.pubkey)));
  const identifiers = Array.from(new Set(valid.map((c) => c.identifier)));
  return new Promise<Map<string, NostrEvent>>((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); try { sub.unsubscribe(); } catch {}; resolve(result); };
    const timer = setTimeout(finish, timeoutMs);
    const sub = pool
      .request(targetRelays.length ? targetRelays : PROFILE_RELAYS, { kinds, authors, "#d": identifiers })
      .subscribe({
        next: (event) => {
          try { eventStore.add(event); } catch {}
          const ev = event as NostrEvent;
          const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
          const key = `${ev.kind}:${ev.pubkey}:${d}`;
          if (!wanted.has(key)) return;
          const existing = result.get(key);
          if (!existing || (ev.created_at || 0) > (existing.created_at || 0)) result.set(key, ev);
        },
        error: () => finish(),
        complete: () => finish(),
      });
  });
}

/** Fetch kind-0 profiles for many pubkeys, returning a pubkey→content map. */
export async function fetchProfileMap(
  pubkeys: string[],
  timeoutMs = 6000,
): Promise<Map<string, ProfileContent>> {
  const unique = Array.from(new Set(pubkeys.filter((pk) => /^[0-9a-f]{64}$/i.test(pk))));
  const map = new Map<string, ProfileContent>();
  if (!unique.length) return map;
  return new Promise<Map<string, ProfileContent>>((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); try { sub.unsubscribe(); } catch {}; resolve(map); };
    const timer = setTimeout(finish, timeoutMs);
    const sub = pool.request(PROFILE_RELAYS, { kinds: [0], authors: unique }).subscribe({
      next: (event) => {
        try { eventStore.add(event); } catch {}
        try {
          if (isValidProfile(event as any)) {
            const content = getProfileContent(event as any);
            if (content) map.set((event as NostrEvent).pubkey, content);
          }
        } catch {}
        if (map.size >= unique.length) finish();
      },
      error: () => finish(),
      complete: () => finish(),
    });
  });
}

export function applyProfileToUser(content: ProfileContent): Partial<NostrUser> {
  return {
    profile: content,
    displayName: getDisplayName(content) || content.name || content.display_name,
    picture: getProfilePicture(content) || content.picture || content.image,
    about: content.about,
    nip05: content.nip05,
  };
}

/**
 * Cache a fetched kind-0 on the Account it belongs to. The Account's metadata is
 * what the header reads, so this is what makes an avatar appear moments after
 * login — and it persists, so the next load renders it before any relay answers.
 */
export function cacheProfile(content: ProfileContent, pubkey?: string): void {
  const account = activeAccount();
  // A switch mid-fetch means this profile belongs to whoever we were before.
  if (!account || (pubkey !== undefined && account.pubkey !== pubkey)) return;
  const { displayName, picture, nip05 } = applyProfileToUser(content);
  rememberProfile(account, { name: displayName, picture, nip05 });
}

/** Did the signer's own UI turn us down, rather than something breaking? */
function refusedBySigner(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : "").toLowerCase();
  return message.includes("denied") || message.includes("rejected") || message.includes("cancel");
}

/**
 * Authenticate an Account, adopt it as the one that signs, and fold in the v1
 * caches every reader still expects. The Account is only adopted once the
 * backend has accepted it, so a failed login leaves nothing behind.
 */
async function signIn(account: BrainstormAccount, metadata: AccountMetadata): Promise<NostrUser> {
  const token = await sessions.authenticate(account);
  // Signing in still *replaces* the previous identity, keys and all, as v1's did:
  // until the picker lands (ticket 11) nothing could show or remove an Account
  // that piled up here.
  releaseActiveAccount();
  adoptAccount(account, { ...metadata, npub: nip19.npubEncode(account.pubkey) });

  // v1 shadow: the backup nags and the onboarding cards still read these
  // pubkey-namespaced flags, so they carry the same answer as the metadata does.
  if (metadata.backedUp) writeV1Flag("brainstorm_backup_done", account.pubkey);
  if (metadata.createdInApp) writeV1Flag("brainstorm_created_inapp", account.pubkey);

  return completeLogin(account, token);
}

function writeV1Flag(name: string, pubkey: string): void {
  try { localStorage.setItem(`${name}:${pubkey}`, "true"); } catch { /* ignore */ }
}

async function completeLogin(account: BrainstormAccount, token: string): Promise<NostrUser> {
  const pubkey = account.pubkey;
  // v1 shadow: `api.ts` and `getCurrentUser` still read these (tickets 06, 17).
  localStorage.setItem("brainstorm_session_token", token);

  const isAdmin = extractAdminFlag(token);
  const npub = nip19.npubEncode(pubkey);

  const user: NostrUser = { pubkey, npub, isAdmin };
  setCurrentUser(user);

  // Load the authoritative contact list (kind 3) once at login and persist it as
  // the known-follows floor, so the follow handlers can never publish a list
  // shorter than what the user actually follows (wipe guard). Fire-and-forget.
  void import("./socialActions")
    .then((m) => m.fetchContactList(pubkey))
    .then((ev) => { if (ev) recordFollowList(pubkey, ev as any); })
    .catch(() => {});

  // Start fetching the user's profile metadata (kind 0) immediately at login
  // instead of deferring it to the dashboard. This removes the dashboard-mount
  // delay from the time-to-avatar. Fire-and-forget so login is never blocked on
  // relay latency; when it resolves, updateCurrentUser dispatches a
  // user-changed event that the header/menu listen to, so the avatar appears
  // as soon as the metadata arrives.
  void fetchProfile(pubkey)
    .then((content) => {
      if (!content) return;
      cacheProfile(content, pubkey);
      updateCurrentUser(applyProfileToUser(content));
    })
    .catch(() => {});

  return user;
}

export async function handleLogin(): Promise<NostrUser> {
  let account: BrainstormAccount;
  try {
    // Also the extension wait: the constructor asks for a pubkey, so an extension
    // that never appears or refuses fails here rather than at the first publish.
    account = await extensionAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (err instanceof ExtensionMissingError) {
      throw new LoginError(
        "NO_EXTENSION",
        "No sign-in extension detected. You can use your key instead, or add a browser sign-in extension."
      );
    }
    if (refusedBySigner(err)) {
      throw new LoginError(
        "PERMISSION_DENIED",
        "Your extension denied the request. Unlock it and approve access, or use your key."
      );
    }
    throw new LoginError(
      "EXTENSION_FAILED",
      `Your sign-in extension didn't respond${msg ? `: ${msg}` : ""}. Unlock it and try again, or use your key.`
    );
  }

  try {
    // The extension holds the key → recoverable, so the backup nags leave it alone.
    const user = await signIn(account, { remembered: true, backedUp: true });
    // Only now: a cancelled extension prompt must not cost the previous user their key.
    clearSecretKey();
    return user;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (err instanceof SessionTransportError) {
      throw new LoginError("SERVER_ERROR", msg || "Failed to reach server.");
    }
    if (refusedBySigner(err)) {
      throw new LoginError(
        "SIGN_CANCELLED",
        "Signing was cancelled. Approve the request in your extension, or use your key."
      );
    }
    throw new LoginError(
      "EXTENSION_FAILED",
      `Your extension couldn't sign you in${msg ? `: ${msg}` : ""}. Try again, or use your key.`
    );
  }
}

/**
 * Shared login core: take a raw secret key, hand it to an Account that signs the
 * server's challenge LOCALLY (the key never leaves the device), and complete the
 * session. `opts.persistent` is "stay signed in" — a Remembered Account.
 */
async function authenticateWithSecretKey(sk: Uint8Array, opts?: { persistent?: boolean }): Promise<NostrUser> {
  let account: LocalAccount;
  try {
    account = await localAccount(sk);
  } catch {
    throw new LoginError("INVALID_NSEC", "We couldn't read a valid account from that key.");
  }

  await storeSecretKey(sk, opts); // v1 shadow, until ticket 17 retires it
  try {
    // The user supplied their own key → they demonstrably hold it, so the account
    // is recoverable and the backup nags leave it alone.
    return await signIn(account, { remembered: !!opts?.persistent, backedUp: true });
  } catch (err) {
    clearSecretKey();
    throw asLoginError(err);
  }
}

/** A failed exchange in v1's taxonomy. A key we hold can only fail at the server. */
function asLoginError(err: unknown): LoginError {
  if (err instanceof LoginError) return err;
  const message = err instanceof Error ? err.message : "";
  return new LoginError("SERVER_ERROR", message || "Server error during login.");
}

export async function loginWithNsec(nsec: string, opts?: { persistent?: boolean }): Promise<NostrUser> {
  const trimmed = nsec.trim();
  if (!trimmed) {
    throw new LoginError("INVALID_NSEC", "Please paste your key to continue.");
  }

  let sk: Uint8Array;
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "nsec") {
      throw new Error("Not an nsec key");
    }
    sk = decoded.data as Uint8Array;
  } catch {
    throw new LoginError(
      "INVALID_NSEC",
      "That doesn't look like a valid key. Double-check it and try again."
    );
  }

  // `persistent` ("Remember me on this device") stores the key in localStorage so
  // the user stays signed in. Default false → ephemeral sessionStorage.
  return authenticateWithSecretKey(sk, opts);
}

/**
 * Restore an account from an encrypted backup key (NIP-49 `ncryptsec…`) + password.
 * Decryption happens entirely in the browser; the password is never sent anywhere.
 * Restored accounts persist (stay signed in), matching created-account behavior.
 */
export async function loginWithEncryptedBackup(ncryptsec: string, password: string, opts?: { persistent?: boolean }): Promise<NostrUser> {
  const trimmed = ncryptsec.trim();
  if (!trimmed) {
    throw new LoginError("INVALID_NSEC", "Please paste your backup key to continue.");
  }
  if (!password) {
    throw new LoginError("INVALID_NSEC", "Enter the password you used for this backup.");
  }

  let sk: Uint8Array;
  try {
    sk = decryptSecretKeyNip49(trimmed, password);
  } catch {
    throw new LoginError("INVALID_NSEC", "Wrong password, or this isn't a valid backup key.");
  }

  // Restoring from a backup defaults to staying signed in (the user has the password).
  return authenticateWithSecretKey(sk, { persistent: opts?.persistent ?? true });
}

export function logout() {
  // Brainstorm Assistant data is namespaced per owner, so logging out does
  // not need to wipe it — switching accounts naturally isolates state and
  // the user's own assistant identity should still be there next login.
  const prevPubkey = activePubkey();
  setCurrentUser(null);
  localStorage.removeItem("brainstorm_session_token");
  // The Account goes with the key: nothing may still sign as an identity this
  // browser has just been told to forget.
  releaseActiveAccount();
  clearSecretKey();
  queryClient.clear();

  // Clear leftover Web-of-Trust scoring state so the next session starts clean.
  // Global markers bleed across accounts (a new login would inherit the previous
  // user's "calculating"/"ready" bar); the per-user markers re-drive the
  // "Calculating…" pill for ~30min if the same user logs back in. Wipe both.
  try {
    ["brainstorm_calc_active", "brainstorm_scores_ready_nudge", "brainstorm_calc_completed"].forEach((k) =>
      localStorage.removeItem(k),
    );
    if (prevPubkey) {
      [
        `brainstorm_calc_triggered_at:${prevPubkey}`,
        `brainstorm_calc_pill_dismissed:${prevPubkey}`,
        `brainstorm_calc_completed:${prevPubkey}`,
      ].forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    /* ignore */
  }
}

export async function publishToRelays(
  signedEvent: NostrEvent,
  relays: string[] = PROFILE_RELAYS
): Promise<{ success: boolean; relay?: string; error?: string; accepted?: number; total?: number }> {
  const writeRelays = loadOutboxRelayListFromDb(signedEvent.pubkey, PROFILE_RELAYS)

  try {
    const responses = await pool.publish(writeRelays, signedEvent as any);
    // `accepted` lets callers judge how broadly the event propagated, rather than
    // treating a single relay's "ok" as fully published.
    const accepted = responses.filter(r => r.ok).length;
    const total = responses.length || writeRelays.length;
    const succeeded = responses.find(r => r.ok);
    if (succeeded) return { success: true, relay: succeeded.from, accepted, total };
    return { success: false, error: responses[0]?.message || "All relays failed", accepted: 0, total };
  } catch {
    return { success: false, error: "All relays failed", accepted: 0, total: writeRelays.length };
  }
}

// ─── Native account creation + first-run auto-setup ──────────────────────────

// The NosFabrica/GrapeRank "seed" account. New users are no longer auto-followed
// to it; instead it's offered as a (preselected, removable) suggestion in the
// /welcome "Build your network" step so their trust calc has something to anchor
// on if they choose to keep it.
export const SEED_FOLLOW_NPUB =
  "npub1healthsx3swcgtknff7zwpg8aj2q7h49zecul5rz490f6z2zp59qnfvp8p";
export let SEED_FOLLOW_HEX = "";
try {
  const decoded = nip19.decode(SEED_FOLLOW_NPUB);
  if (decoded.type === "npub") SEED_FOLLOW_HEX = decoded.data as string;
} catch {}

const initialSetupFlag = (pubkey: string) => `brainstorm_initial_setup_done:${pubkey}`;

/**
 * Build → sign as the Active Account → publish, verifying the signer didn't
 * mutate the kind before broadcasting. Returns the publish result.
 */
async function signAndPublish(
  template: { kind: number; tags: string[][]; content: string },
  expectedKind: number,
): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const signed = await signAs(account, template);
    if (signed.kind !== expectedKind) {
      return { success: false, error: "Signer returned an unexpected event kind" };
    }
    return await publishToRelays(signed);
  } catch (e) {
    return signingFailure(e);
  }
}

/**
 * Publish the user's profile metadata (kind 0) and reflect it in the header.
 * Retries while propagation is thin (only 0-1 relays accepted) so the avatar/bio
 * actually reach the relays other clients read from, and (re)publishes the NIP-65
 * outbox list so outbox-model clients can find this kind-0. Resolves failure only
 * when zero relays accept after retries — so callers surface a real error instead
 * of the local cache masking a publish that never landed.
 */
const PROFILE_PUBLISH_BACKOFF_MS = [800, 2000];
export async function publishProfile(
  content: Record<string, unknown>,
  tags: string[][] = [],
): Promise<PublishOutcome> {
  const template = { kind: 0, tags, content: JSON.stringify(content) };
  let res = await signAndPublish(template, 0);
  for (let attempt = 0; attempt < PROFILE_PUBLISH_BACKOFF_MS.length; attempt++) {
    if (res.cancelled) break; // they declined to unlock — don't ask again
    if ((res.accepted ?? (res.success ? 1 : 0)) >= 2) break; // broad enough
    await new Promise((r) => setTimeout(r, PROFILE_PUBLISH_BACKOFF_MS[attempt]));
    res = await signAndPublish(template, 0);
  }
  if (res.success) {
    try {
      const profile = content as unknown as ProfileContent;
      cacheProfile(profile);
      updateCurrentUser(applyProfileToUser(profile));
    } catch {}
    // Keep the outbox list fresh (the signup publish may have silently failed),
    // so other clients can locate this kind-0. Best-effort.
    void publishRelayList(PROFILE_RELAYS).catch(() => {});
  }
  return { success: res.success, error: res.error, cancelled: res.cancelled };
}

/** Publish a NIP-65 relay list (kind 10002). */
export async function publishRelayList(
  relays: string[],
): Promise<PublishOutcome> {
  const tags = relays.filter(Boolean).map((r) => ["r", r]);
  return signAndPublish({ kind: 10002, tags, content: "" }, 10002);
}

/**
 * Kick off WoT scoring and, for in-app-created accounts only, the background
 * trust-anchor publish. Called once the user has actually followed ≥1 account
 * (the "calculate my scores" CTA) — NOT at account creation, since a follow-less
 * account can't be scored.
 *
 * Computing scores (`triggerGrapeRank`) publishes nothing under the user's key
 * and just populates their `ta_pubkey`, so it always runs. Publishing the NIP-85
 * provider declaration (kind 10040) is a public act under their key, so we only
 * auto-do it for accounts created here (signing up via Brainstorm = consent).
 * Existing users select Brainstorm explicitly via the dashboard card / Settings
 * (with a replace-warning) — we never overwrite a provider choice they didn't
 * make here.
 */
export async function triggerScoringAndAnchor(pubkey: string): Promise<void> {
  // Mark the start so the global status chip can show "Calculating…" immediately,
  // before the backend's graperankResult reflects an in-progress record.
  try { localStorage.setItem(`brainstorm_calc_triggered_at:${pubkey}`, String(Date.now())); } catch {}
  try { await apiClient.triggerGrapeRank(); } catch {}
  let createdInApp = false;
  try { createdInApp = localStorage.getItem(`brainstorm_created_inapp:${pubkey}`) === "true"; } catch {}
  if (createdInApp) void pollAndPublishTrustAnchor(pubkey);
}

/**
 * Publish the user's NIP-85 declaration (kind 10040) selecting Brainstorm as
 * their rank+followers provider, unless it's already in place. Idempotent and
 * best-effort: a no-op once this account is marked activated or a Brainstorm
 * 10040 already exists on relays; never throws. Shared by the post-score poll
 * and the self-healing app-load effect (AutoActivateBrainstorm).
 */
export async function ensureBrainstormTrustAnchor(pubkey: string, taPubkey: string): Promise<void> {
  if (!pubkey || !taPubkey) return;
  if (isNip85Activated(pubkey)) return;
  // Nobody asked for this publish, so it must never raise the unlock modal. A
  // Locked Account that can't open silently is left alone; the effect re-runs on
  // every app load, and `ensureBrainstormTrustAnchor` is idempotent.
  const account = activeAccount();
  if (!account || account.pubkey !== pubkey) return;
  if (!(await canSignSilently(account))) return;
  // Already declared Brainstorm on relays (e.g. published from another device)?
  // Record it locally and stop — nothing to publish.
  try {
    if (await isUsingBrainstorm(pubkey, taPubkey)) {
      markNip85Activated(pubkey);
      return;
    }
  } catch {}
  try {
    const signed = await signNip85(taPubkey, getNip85RelayUrl());
    const res = await publishToRelays(signed);
    if (res.success) {
      markNip85Activated(pubkey);
    }
  } catch {}
}

/**
 * Background-poll for the user's trust anchor (assigned by the backend after
 * GrapeRank runs) and publish their NIP-85 declaration once it exists.
 * Best-effort: never throws, gives up after the backoff schedule. Only the
 * immediate post-score path — cross-session reliability is the app-load effect.
 */
async function pollAndPublishTrustAnchor(pubkey: string): Promise<void> {
  if (isNip85Activated(pubkey)) return;
  const delaysMs = [15000, 20000, 30000, 45000, 60000, 60000, 60000, 60000, 60000, 60000];
  for (const delay of delaysMs) {
    await new Promise((r) => setTimeout(r, delay));
    let taPubkey: string | null = null;
    try {
      const history = await apiClient.getUserHistory();
      taPubkey = history?.data?.ta_pubkey ?? null;
    } catch {
      continue;
    }
    if (!taPubkey) continue;
    await ensureBrainstormTrustAnchor(pubkey, taPubkey);
    return; // TA resolved — stop polling regardless of publish outcome.
  }
}

/**
 * The "magic finish": after an account exists, best-effort publish profile,
 * relay list and a seed follow, then kick off scoring and (in the background)
 * publish the trust anchor. Idempotent per pubkey; never blocks or throws.
 */
export async function runInitialSetup(
  pubkey: string,
  profile: { name: string; about?: string; picture?: string },
  opts: { inviterPubkey?: string } = {},
): Promise<void> {
  try {
    if (localStorage.getItem(initialSetupFlag(pubkey)) === "true") return;
  } catch {}

  const content: Record<string, unknown> = { name: profile.name, display_name: profile.name };
  if (profile.about) content.about = profile.about;
  if (profile.picture) content.picture = profile.picture;
  try { await publishProfile(content); } catch {}
  try { await publishRelayList(PROFILE_RELAYS); } catch {}

  // NOTE: we intentionally do NOT publish a seed follow list or trigger scoring
  // here. New users choose who to follow in the post-signup "Build your network"
  // step (/welcome), which publishes their chosen kind-3 and then triggers
  // scoring via `triggerScoringAndAnchor`. Auto-following an account the user
  // didn't choose is both a trust-graph artifact and a wipe risk.

  // If they arrived via an invite link, remember the inviter so /welcome can
  // preselect them among the suggested follows.
  try {
    const inviter = (opts.inviterPubkey || "").toLowerCase();
    if (/^[0-9a-f]{64}$/.test(inviter) && inviter !== pubkey.toLowerCase()) {
      sessionStorage.setItem("brainstorm_pending_invite_hex", inviter);
    }
  } catch {}

  // Bootstrap publishes done — guard against re-running on reload.
  try { localStorage.setItem(initialSetupFlag(pubkey), "true"); } catch {}
}

/**
 * Create a brand-new Brainstorm account: generate a keypair client-side, log in
 * via the existing challenge/verify flow, persist the key locally so the user
 * stays signed in, and fire-and-forget the first-run setup. Mirrors
 * `loginWithNsec` but with a generated key.
 */
export async function createAccount(
  displayName: string,
  opts: { inviterPubkey?: string } = {},
): Promise<NostrUser> {
  const name = displayName.trim();
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const account = await localAccount(sk);

  await storeSecretKey(sk, { persistent: true }); // v1 shadow, until ticket 17 retires it
  let user: NostrUser;
  try {
    // A brand-new key exists only in this browser, so it is emphatically not
    // backed up — `createdInApp` is what points the onboarding nags at it.
    user = await signIn(account, { remembered: true, createdInApp: true });
  } catch (err) {
    clearSecretKey();
    throw asLoginError(err);
  }

  // A brand-new account has no kind-0 on relays yet, so completeLogin returns a
  // nameless user (its profile fetch finds nothing). Apply the name the user
  // just typed right away so the header/profile show it immediately, instead of
  // waiting for the relay round-trip after runInitialSetup publishes.
  if (name) {
    rememberProfile(account, { name });
    updateCurrentUser({ displayName: name });
    user = { ...user, displayName: name };
  }

  // Don't block the UI on relay/scoring work.
  void runInitialSetup(pubkey, { name }, { inviterPubkey: opts.inviterPubkey }).catch(() => {});
  return user;
}

export async function signNip85(
  serviceKey: string,
  relayHint: string
): Promise<NostrEvent> {
  return signAs(requireActiveAccount(), {
    kind: 10040,
    tags: [
      ["30382:rank", serviceKey, relayHint],
      ["30382:followers", serviceKey, relayHint],
    ],
    content: "",
  });
}

export async function signNip85Deactivation(): Promise<NostrEvent> {
  return signAs(requireActiveAccount(), { kind: 10040, tags: [], content: "" });
}

export interface ReportMetadata {
  reporterPubkey: string;
  targetPubkey: string;
  reportType: string;
  timestamp: number;
  reason: string;
}

export interface MuteMetadata {
  muterPubkey: string;
  timestamp: number;
}

export async function fetchReportsForPubkey(
  targetPubkey: string,
  timeoutMs = 12000
): Promise<ReportMetadata[]> {
  const reports: ReportMetadata[] = [];
  const seen = new Set<string>();

  return new Promise<ReportMetadata[]>((resolve) => {
    const timer = setTimeout(() => resolve(reports), timeoutMs);

    pool.request(PROFILE_RELAYS, { kinds: [1984], "#p": [targetPubkey] }).subscribe({
      next: (event) => {
        try {
          const eventId = (event as any).id || `${event.pubkey}-${event.created_at}`;
          if (seen.has(eventId)) return;
          seen.add(eventId);

          let reportType = "other";
          for (const tag of event.tags) {
            if (tag[0] === "p" && tag[1] === targetPubkey && tag[2]) {
              reportType = tag[2];
              break;
            }
          }

          reports.push({
            reporterPubkey: event.pubkey,
            targetPubkey,
            reportType,
            timestamp: event.created_at,
            reason: event.content || "",
          });
        } catch {}
      },
      error: () => { clearTimeout(timer); resolve(reports); },
      complete: () => { clearTimeout(timer); resolve(reports); },
    });
  });
}

export async function fetchReportsByPubkey(
  reporterPubkey: string,
  timeoutMs = 12000
): Promise<ReportMetadata[]> {
  const reports: ReportMetadata[] = [];
  const seen = new Set<string>();

  return new Promise<ReportMetadata[]>((resolve) => {
    const timer = setTimeout(() => resolve(reports), timeoutMs);

    pool.request(PROFILE_RELAYS, { kinds: [1984], authors: [reporterPubkey] }).subscribe({
      next: (event) => {
        try {
          const eventId = (event as any).id || `${event.pubkey}-${event.created_at}`;
          if (seen.has(eventId)) return;
          seen.add(eventId);

          for (const tag of event.tags) {
            if (tag[0] === "p" && tag[1]) {
              reports.push({
                reporterPubkey: event.pubkey,
                targetPubkey: tag[1],
                reportType: tag[2] || "other",
                timestamp: event.created_at,
                reason: event.content || "",
              });
            }
          }
        } catch {}
      },
      error: () => { clearTimeout(timer); resolve(reports); },
      complete: () => { clearTimeout(timer); resolve(reports); },
    });
  });
}

export async function fetchMuteListTimestamp(
  muterPubkey: string,
  timeoutMs = 10000
): Promise<MuteMetadata | undefined> {
  try {
    const event = await Promise.race([
      firstValueFrom(pool.request(PROFILE_RELAYS, { kinds: [10000], authors: [muterPubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);

    if (!event) return undefined;

    return {
      muterPubkey,
      timestamp: event.created_at,
    };
  } catch {}
  return undefined;
}

const WOT_SEARCH_RELAY = env.VITE_WOT_SEARCH_RELAY.trim();

export interface NostrSearchResult {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export function searchNostrProfiles(
  query: string,
  options: { limit?: number; timeoutMs?: number } = {}
): Promise<NostrSearchResult[]> {
  const { limit = 10, timeoutMs = 5000 } = options;
  if (!WOT_SEARCH_RELAY) {
    // eslint-disable-next-line no-console
    console.error(
      "[nostr] VITE_WOT_SEARCH_RELAY is not set — Nostr profile search is disabled. " +
        "Set VITE_WOT_SEARCH_RELAY at build/deploy time (see README and Dockerfile).",
    );
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    const results: NostrSearchResult[] = [];
    const seen = new Set<string>();
    let ws: WebSocket | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch {}
      resolve(results);
    };

    const timeout = setTimeout(finish, timeoutMs);

    try {
      ws = new WebSocket(WOT_SEARCH_RELAY);

      ws.onopen = () => {
        const req = JSON.stringify(["REQ", "search-1", {
          kinds: [0],
          search: query,
          limit,
        }]);
        ws!.send(req);
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === "EVENT" && data[2]) {
            const event = data[2];
            const pubkey = event.pubkey;
            if (pubkey && !seen.has(pubkey)) {
              seen.add(pubkey);
              try {
                const content = JSON.parse(event.content || "{}");
                results.push({
                  pubkey,
                  npub: nip19.npubEncode(pubkey),
                  name: content.name || undefined,
                  displayName: content.display_name || content.displayName || undefined,
                  picture: content.picture || undefined,
                  about: content.about || undefined,
                  nip05: content.nip05 || undefined,
                });
              } catch {
                results.push({ pubkey, npub: nip19.npubEncode(pubkey) });
              }
            }
          } else if (data[0] === "EOSE") {
            clearTimeout(timeout);
            finish();
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        finish();
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        finish();
      };
    } catch {
      clearTimeout(timeout);
      finish();
    }
  });
}

export { eventStore, pool };
