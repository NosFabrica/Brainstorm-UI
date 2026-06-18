import { nip19, finalizeEvent, getPublicKey, generateSecretKey } from "nostr-tools";
import { encrypt as encryptSecretKeyNip49, decrypt as decryptSecretKeyNip49 } from "nostr-tools/nip49";
import { RelayPool } from "applesauce-relay";
import { env } from "@/lib/runtimeEnv";

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
import { apiClient } from "./api";
import { queryClient } from "@/lib/queryClient";
import { extractAdminFlag } from "@/lib/jwt";
import { NostrEvent } from "applesauce-core/helpers";

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
  }
}

const SK_STORAGE_KEY = "brainstorm_sk_hex";
// Persistent variant for self-custodial accounts created in-app, so they "stay
// signed in" across sessions (extension/nsec flows keep using the session copy).
const SK_PERSIST_KEY = "brainstorm_sk_hex_persist";

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

function getStoredSecretKey(): Uint8Array | null {
  try {
    const hex =
      sessionStorage.getItem(SK_STORAGE_KEY) || localStorage.getItem(SK_PERSIST_KEY);
    if (!hex) return null;
    return hexToBytes(hex);
  } catch {
    return null;
  }
}

function storeSecretKey(sk: Uint8Array, opts?: { persistent?: boolean }): void {
  try {
    const hex = bytesToHex(sk);
    if (opts?.persistent) {
      // Created-in-app account: persist so the user stays signed in. Clear any
      // stale session copy so the two stores never disagree.
      localStorage.setItem(SK_PERSIST_KEY, hex);
      sessionStorage.removeItem(SK_STORAGE_KEY);
    } else {
      sessionStorage.setItem(SK_STORAGE_KEY, hex);
      localStorage.removeItem(SK_PERSIST_KEY);
    }
  } catch {}
}

function clearSecretKey(): void {
  try {
    sessionStorage.removeItem(SK_STORAGE_KEY);
    localStorage.removeItem(SK_PERSIST_KEY);
  } catch {}
}

export function hasLocalSecretKey(): boolean {
  return getStoredSecretKey() !== null;
}

/** True when an in-app–created account's key is persisted locally ("stay signed in"). */
export function hasPersistentKey(): boolean {
  try {
    return !!localStorage.getItem(SK_PERSIST_KEY);
  } catch {
    return false;
  }
}

/**
 * True when we hold the raw secret key in this session (created/restored account
 * in localStorage, OR an nsec pasted into sessionStorage) — i.e. when we can back
 * it up or reveal it. False for extension logins, where the key never leaves the
 * signer.
 */
export function hasStoredSecretKey(): boolean {
  return !!getStoredSecretKey();
}

function signWithStoredKey(event: Record<string, unknown>): Record<string, unknown> {
  const sk = getStoredSecretKey();
  if (!sk) throw new Error("No local secret key available.");
  const eventToSign = {
    kind: event.kind as number,
    tags: (event.tags as string[][]) ?? [],
    content: (event.content as string) ?? "",
    created_at: (event.created_at as number) ?? Math.floor(Date.now() / 1000),
  };
  return finalizeEvent(eventToSign, sk) as unknown as Record<string, unknown>;
}

export async function signEventLocally(
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (window.nostr) {
    try {
      const signed = await window.nostr.signEvent(event);
      if (signed && signed.sig) return signed;
      throw new Error("Extension returned an unsigned event");
    } catch (err) {
      if (hasLocalSecretKey()) {
        return signWithStoredKey(event);
      }
      throw err;
    }
  }
  if (hasLocalSecretKey()) {
    return signWithStoredKey(event);
  }
  throw new Error("No signer available. Please sign in again.");
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
  // Also notify listeners when the same user's profile metadata fills in
  // (e.g. the avatar/name fetched right after login), so the header and
  // mobile menu re-render instead of waiting for the next page render.
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
): Promise<{ success: boolean; error?: string }> {
  const user = getCurrentUser();
  if (!user?.pubkey) return { success: false, error: "Not logged in" };
  if (!window.nostr && !hasLocalSecretKey()) {
    return { success: false, error: "No signer available" };
  }

  const event = {
    kind: 30078,
    tags: [["d", ASSISTANT_POINTER_D_TAG]],
    content: JSON.stringify({
      pubkey: pointer.pubkey,
      event_id: pointer.eventId,
      published_at: pointer.publishedAt,
    }),
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  try {
    const signed = await signEventLocally(event);
    return await publishToRelays(signed);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to sign" };
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

// Resolve with the first promise that yields a truthy value. Unlike
// Promise.race (first to *settle*) this skips sources that resolve to
// undefined/null, only falling back to undefined once every source is done.
function firstTruthy<T>(promises: Array<Promise<T | undefined>>): Promise<T | undefined> {
  return new Promise((resolve) => {
    let remaining = promises.length;
    if (remaining === 0) {
      resolve(undefined);
      return;
    }
    let settled = false;
    for (const p of promises) {
      p.then((value) => {
        if (!settled && value) {
          settled = true;
          resolve(value);
        }
      })
        .catch(() => {})
        .finally(() => {
          remaining -= 1;
          if (remaining === 0 && !settled) resolve(undefined);
        });
    }
  });
}

// Recursively scan an arbitrary JSON payload for a kind 0 profile event and
// return its parsed content. Handles the differing envelopes used by the HTTP
// sources: nostrhttp.com returns a bare array of events, while api.nostr.band
// wraps the event under `profiles[].event`.
function extractKind0Content(node: unknown, depth = 0): ProfileContent | undefined {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractKind0Content(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if (obj.kind === 0 && typeof obj.content === "string") {
    try {
      const parsed = JSON.parse(obj.content) as ProfileContent;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }
  for (const key of Object.keys(obj)) {
    const found = extractKind0Content(obj[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function fetchProfileFromUrl(url: string, timeoutMs: number): Promise<ProfileContent | undefined> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    return extractKind0Content(json);
  } catch {
    return undefined;
  }
}

// HTTP fast-path for kind 0 profile metadata. Queries CORS-enabled HTTP
// gateways in parallel so a slow/unavailable relay set never bottlenecks the
// avatar. Returns the first source that yields a valid profile.
export async function fetchProfileHttp(pubkey: string, timeoutMs = 6000): Promise<ProfileContent | undefined> {
  let npub: string;
  try {
    npub = nip19.npubEncode(pubkey);
  } catch {
    return undefined;
  }
  const urls = [
    `https://nostrhttp.com/${npub}`,
    `https://api.nostr.band/v0/stats/profile/${npub}`,
  ];
  return firstTruthy(urls.map((u) => fetchProfileFromUrl(u, timeoutMs)));
}

async function fetchProfileFromRelays(pubkey: string, timeoutMs: number): Promise<ProfileContent | undefined> {
  const event = await fetchProfileEvent(pubkey, timeoutMs);
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

export async function fetchProfile(pubkey: string, timeoutMs = 10000): Promise<ProfileContent | undefined> {
  // Race the HTTP fast-path against the relay query and take whichever returns
  // a valid kind 0 profile first. The HTTP gateways are usually faster and
  // avoid worst-case relay hangs; the relay query stays as the resilient
  // fallback (and still warms the relay pool / event store).
  return firstTruthy([
    fetchProfileHttp(pubkey, Math.min(timeoutMs, 6000)),
    fetchProfileFromRelays(pubkey, timeoutMs),
  ]);
}

/**
 * Fetch a kind-0 profile for the public share page, reporting whether it had to
 * fall back to relays. The HTTP/indexed gateways are treated as the "known"
 * path; when they miss (a profile not yet indexed by Brainstorm), we query the
 * relays — including any `nprofile` relay hints — and flag `foundViaRelays` so
 * the UI can show a "fetched from relays" state. (Adding the hinted relays to
 * the backend sync pipeline is handled server-side; here we only pass them on.)
 */
export async function fetchProfileForShare(
  pubkey: string,
  opts: { relayHints?: string[]; timeoutMs?: number } = {},
): Promise<{ content?: ProfileContent; foundViaRelays: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const relayHints = opts.relayHints ?? [];

  const http = await fetchProfileHttp(pubkey, Math.min(timeoutMs, 6000));
  if (http) return { content: http, foundViaRelays: false };

  const event = await fetchProfileEvent(pubkey, timeoutMs, relayHints);
  if (event) {
    let content: ProfileContent | undefined;
    if (isValidProfile(event as any)) {
      content = getProfileContent(event as any);
    } else if (typeof event.content === "string") {
      try { content = JSON.parse(event.content) as ProfileContent; } catch {}
    }
    if (content) return { content, foundViaRelays: true };
  }

  return { content: undefined, foundViaRelays: false };
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

async function waitForNostrExtension(maxWaitMs = 800, intervalMs = 200): Promise<boolean> {
  if (window.nostr) return true;
  const start = Date.now();
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (window.nostr) {
        clearInterval(check);
        resolve(true);
      } else if (Date.now() - start >= maxWaitMs) {
        clearInterval(check);
        resolve(false);
      }
    }, intervalMs);
  });
}

async function completeLogin(pubkey: string, signedEvent: Record<string, unknown>): Promise<NostrUser> {
  let result;
  try {
    result = await apiClient.verifyAuthChallenge(pubkey, signedEvent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error during login.";
    throw new LoginError("SERVER_ERROR", msg);
  }
  const token = result.data?.token || (result as any).token;
  if (!token) {
    throw new LoginError("SERVER_ERROR", "No token received from server. Please try again.");
  }
  localStorage.setItem("brainstorm_session_token", token);

  const isAdmin = extractAdminFlag(token);
  const npub = nip19.npubEncode(pubkey);

  const user: NostrUser = { pubkey, npub, isAdmin };
  setCurrentUser(user);

  // Start fetching the user's profile metadata (kind 0) immediately at login
  // instead of deferring it to the dashboard. This removes the dashboard-mount
  // delay from the time-to-avatar. Fire-and-forget so login is never blocked on
  // relay latency; when it resolves, updateCurrentUser dispatches a
  // user-changed event that the header/menu listen to, so the avatar appears
  // as soon as the metadata arrives.
  void fetchProfile(pubkey)
    .then((content) => {
      if (content) updateCurrentUser(applyProfileToUser(content));
    })
    .catch(() => {});

  return user;
}

export async function handleLogin(): Promise<NostrUser> {
  const extensionFound = await waitForNostrExtension();
  if (!extensionFound) {
    throw new LoginError(
      "NO_EXTENSION",
      "No sign-in extension detected. You can use your key instead, or add a browser sign-in extension."
    );
  }

  let pubkey: string;
  try {
    pubkey = await window.nostr!.getPublicKey();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const lower = msg.toLowerCase();
    if (lower.includes("denied") || lower.includes("rejected") || lower.includes("cancel")) {
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

  if (!pubkey || typeof pubkey !== "string") {
    throw new LoginError(
      "EXTENSION_FAILED",
      "Your extension returned an invalid public key. Unlock it and try again, or use your key."
    );
  }

  let challenge: string;
  try {
    challenge = await apiClient.getAuthChallenge(pubkey);
  } catch (err) {
    throw new LoginError("SERVER_ERROR", err instanceof Error ? err.message : "Failed to reach server.");
  }

  const event: Record<string, unknown> = {
    kind: 22242,
    tags: [
      ["t", "brainstorm_login"],
      ["challenge", challenge],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey,
  };

  let signedEvent: Record<string, unknown>;
  try {
    signedEvent = await window.nostr!.signEvent(event);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const lower = msg.toLowerCase();
    if (lower.includes("denied") || lower.includes("rejected") || lower.includes("cancel")) {
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

  if (!signedEvent || !signedEvent.sig) {
    throw new LoginError(
      "EXTENSION_FAILED",
      "Your extension couldn't complete sign-in. Try again, or use your key."
    );
  }

  clearSecretKey();
  return completeLogin(pubkey, signedEvent);
}

/**
 * Shared login core: take a raw secret key, sign the server's challenge LOCALLY
 * (the key never leaves the device), and complete the session. `opts.persistent`
 * stores the key in localStorage so a restored/created account stays signed in.
 */
async function authenticateWithSecretKey(sk: Uint8Array, opts?: { persistent?: boolean }): Promise<NostrUser> {
  let pubkey: string;
  try {
    pubkey = getPublicKey(sk);
  } catch {
    throw new LoginError("INVALID_NSEC", "We couldn't read a valid account from that key.");
  }

  let challenge: string;
  try {
    challenge = await apiClient.getAuthChallenge(pubkey);
  } catch (err) {
    throw new LoginError("SERVER_ERROR", err instanceof Error ? err.message : "Failed to reach server.");
  }

  const eventTemplate = {
    kind: 22242,
    tags: [
      ["t", "brainstorm_login"],
      ["challenge", challenge],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };

  const signedEvent = finalizeEvent(eventTemplate, sk) as unknown as Record<string, unknown>;

  storeSecretKey(sk, opts);
  try {
    return await completeLogin(pubkey, signedEvent);
  } catch (err) {
    clearSecretKey();
    throw err;
  }
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
  setCurrentUser(null);
  localStorage.removeItem("brainstorm_session_token");
  clearSecretKey();
  queryClient.clear();
}

export async function publishToRelays(
  signedEvent: Record<string, unknown>,
  relays: string[] = PROFILE_RELAYS
): Promise<{ success: boolean; relay?: string; error?: string }> {
  const writeRelays = loadOutboxRelayListFromDb((signedEvent as any).pubkey, PROFILE_RELAYS)

  try {
    const responses = await pool.publish(writeRelays, signedEvent as any);
    const succeeded = responses.find(r => r.ok);
    if (succeeded) return { success: true, relay: succeeded.from };
    return { success: false, error: responses[0]?.message || "All relays failed" };
  } catch {
    return { success: false, error: "All relays failed" };
  }
}

// ─── Native account creation + first-run auto-setup ──────────────────────────

// Single curated account every new user auto-follows so their graph/feed is
// never empty (and the trust calc has something to anchor on).
const SEED_FOLLOW_NPUB =
  "npub1healthsx3swcgtknff7zwpg8aj2q7h49zecul5rz490f6z2zp59qnfvp8p";
let SEED_FOLLOW_HEX = "";
try {
  const decoded = nip19.decode(SEED_FOLLOW_NPUB);
  if (decoded.type === "npub") SEED_FOLLOW_HEX = decoded.data as string;
} catch {}

const initialSetupFlag = (pubkey: string) => `brainstorm_initial_setup_done:${pubkey}`;

/**
 * Build → locally sign → publish an event, verifying the signer didn't mutate
 * the kind before broadcasting. Returns the publish result.
 */
async function signAndPublish(
  template: { kind: number; tags: string[][]; content: string },
  expectedKind: number,
): Promise<{ success: boolean; error?: string }> {
  const user = getCurrentUser();
  if (!user?.pubkey) return { success: false, error: "Not logged in" };
  if (!window.nostr && !hasLocalSecretKey()) {
    return { success: false, error: "No signer available" };
  }
  try {
    const event = {
      ...template,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: user.pubkey,
    };
    const signed = await signEventLocally(event);
    if ((signed as { kind?: number }).kind !== expectedKind) {
      return { success: false, error: "Signer returned an unexpected event kind" };
    }
    return await publishToRelays(signed);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Signing failed" };
  }
}

/** Publish the user's profile metadata (kind 0) and reflect it in the header. */
export async function publishProfile(
  content: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const res = await signAndPublish({ kind: 0, tags: [], content: JSON.stringify(content) }, 0);
  if (res.success) {
    try {
      updateCurrentUser(applyProfileToUser(content as unknown as ProfileContent));
    } catch {}
  }
  return res;
}

/** Publish a NIP-65 relay list (kind 10002). */
export async function publishRelayList(
  relays: string[],
): Promise<{ success: boolean; error?: string }> {
  const tags = relays.filter(Boolean).map((r) => ["r", r]);
  return signAndPublish({ kind: 10002, tags, content: "" }, 10002);
}

/** Publish a fresh follow list (kind 3) — for brand-new accounts only. */
export async function publishFollowList(
  pubkeys: string[],
): Promise<{ success: boolean; error?: string }> {
  const tags = pubkeys.filter(Boolean).map((pk) => ["p", pk]);
  return signAndPublish({ kind: 3, tags, content: "" }, 3);
}

/**
 * Background-poll for the user's trust anchor (assigned by the backend after
 * GrapeRank runs) and publish their NIP-85 declaration (kind 10040) once it
 * exists. Best-effort: never throws, gives up after the backoff schedule.
 */
async function pollAndPublishTrustAnchor(pubkey: string): Promise<void> {
  try {
    if (localStorage.getItem("brainstorm_nip85_activated") === "true") return;
  } catch {}
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
    try {
      const signed = await signNip85(taPubkey, getNip85RelayUrl());
      const res = await publishToRelays(signed);
      if (res.success) {
        try { localStorage.setItem("brainstorm_nip85_activated", "true"); } catch {}
      }
    } catch {}
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

  const content: Record<string, unknown> = { name: profile.name };
  if (profile.about) content.about = profile.about;
  if (profile.picture) content.picture = profile.picture;
  try { await publishProfile(content); } catch {}
  try { await publishRelayList(PROFILE_RELAYS); } catch {}
  // Seed the new account's follow list: the default seed + the inviter (if the
  // account was created via someone's invite link), so they start connected and
  // their web of trust isn't empty. Deduped; never self.
  try {
    const follows = new Set<string>();
    if (SEED_FOLLOW_HEX) follows.add(SEED_FOLLOW_HEX);
    const inviter = (opts.inviterPubkey || "").toLowerCase();
    if (/^[0-9a-f]{64}$/.test(inviter) && inviter !== pubkey.toLowerCase()) follows.add(inviter);
    if (follows.size) await publishFollowList(Array.from(follows));
  } catch {}

  // Bootstrap publishes done — guard against re-running on reload.
  try { localStorage.setItem(initialSetupFlag(pubkey), "true"); } catch {}

  // Kick off scoring (swallow cooldown/429 — this is background).
  try { await apiClient.triggerGrapeRank(); } catch {}

  // Publish the trust anchor once the backend computes it.
  void pollAndPublishTrustAnchor(pubkey);
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

  let challenge: string;
  try {
    challenge = await apiClient.getAuthChallenge(pubkey);
  } catch (err) {
    throw new LoginError("SERVER_ERROR", err instanceof Error ? err.message : "Failed to reach server.");
  }

  const eventTemplate = {
    kind: 22242,
    tags: [
      ["t", "brainstorm_login"],
      ["challenge", challenge],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signedEvent = finalizeEvent(eventTemplate, sk) as unknown as Record<string, unknown>;

  storeSecretKey(sk, { persistent: true });
  let user: NostrUser;
  try {
    user = await completeLogin(pubkey, signedEvent);
  } catch (err) {
    clearSecretKey();
    throw err;
  }

  // Don't block the UI on relay/scoring work.
  void runInitialSetup(pubkey, { name }, { inviterPubkey: opts.inviterPubkey }).catch(() => {});
  return user;
}

/** Encrypt the stored secret key with a passphrase (NIP-49) for an optional backup. */
export function exportEncryptedKey(password: string): string {
  const sk = getStoredSecretKey();
  if (!sk) throw new Error("No account key available to back up.");
  return encryptSecretKeyNip49(sk, password);
}

/**
 * Encode the stored secret key as a raw `nsec…` for an explicit, in-app reveal
 * (advanced users only). Runs entirely client-side; never written to disk.
 */
export function exportNsec(): string {
  const sk = getStoredSecretKey();
  if (!sk) throw new Error("No account key available.");
  return nip19.nsecEncode(sk);
}

export async function signNip85(
  serviceKey: string,
  relayHint: string
): Promise<Record<string, unknown>> {
  const user = getCurrentUser();
  if (!user?.pubkey) {
    throw new Error("Not logged in");
  }
  if (!window.nostr && !hasLocalSecretKey()) {
    throw new Error("No signer available. Please sign in again.");
  }

  const event = {
    kind: 10040,
    tags: [
      ["30382:rank", serviceKey, relayHint],
      ["30382:followers", serviceKey, relayHint],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  return await signEventLocally(event);
}

export async function signNip85Deactivation(): Promise<Record<string, unknown>> {
  const user = getCurrentUser();
  if (!user?.pubkey) {
    throw new Error("Not logged in");
  }
  if (!window.nostr && !hasLocalSecretKey()) {
    throw new Error("No signer available. Please sign in again.");
  }

  const event = {
    kind: 10040,
    tags: [],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  return await signEventLocally(event);
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

const WOT_SEARCH_RELAY = "wss://brainstorm.world/relay";

export interface NostrSearchResult {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

/**
 * Search profiles via the legacy Brainstorm Meilisearch endpoint.
 * Supports per-user WoT perspective ("house" vs "user").
 */
export async function searchProfilesMeili(
  query: string,
  options: { limit?: number; timeoutMs?: number; userPubkey?: string; pov?: "house" | "user" } = {}
): Promise<NostrSearchResult[]> {
  const { limit = 10, timeoutMs = 8000, userPubkey, pov = "house" } = options;
  const { apiClient } = await import("./api");
  const data = await apiClient.searchProfilesLegacyMeili(query, pov, userPubkey, limit, timeoutMs);
  const hits = data.hits;
  const seen = new Set<string>();
  const out: NostrSearchResult[] = [];
  for (const h of hits) {
    const pubkey = typeof h?.pubkey === "string" ? (h.pubkey as string) : undefined;
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);
    let npub: string;
    if (typeof h?.npub === "string" && h.npub) {
      npub = h.npub as string;
    } else {
      try { npub = nip19.npubEncode(pubkey); } catch { continue; }
    }
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.length > 0 ? v : undefined;
    out.push({
      pubkey,
      npub,
      name: str(h?.name),
      displayName: str(h?.display_name) || str(h?.displayName),
      picture: str(h?.picture),
      about: str(h?.about),
      nip05: str(h?.nip05),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function searchNostrProfiles(
  query: string,
  options: { limit?: number; timeoutMs?: number } = {}
): Promise<NostrSearchResult[]> {
  const { limit = 10, timeoutMs = 5000 } = options;
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
