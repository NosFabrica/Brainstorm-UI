import { nip19, finalizeEvent, getPublicKey } from "nostr-tools";
import { RelayPool } from "applesauce-relay";

const RAW_NIP85_RELAY_URL = (import.meta.env.VITE_NIP85_RELAY_URL as string | undefined) ?? "";
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
    const hex = sessionStorage.getItem(SK_STORAGE_KEY);
    if (!hex) return null;
    return hexToBytes(hex);
  } catch {
    return null;
  }
}

function storeSecretKey(sk: Uint8Array): void {
  try {
    sessionStorage.setItem(SK_STORAGE_KEY, bytesToHex(sk));
  } catch {}
}

function clearSecretKey(): void {
  try {
    sessionStorage.removeItem(SK_STORAGE_KEY);
  } catch {}
}

export function hasLocalSecretKey(): boolean {
  return getStoredSecretKey() !== null;
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
  const prevPubkey = currentUser?.pubkey ?? null;
  currentUser = user;
  if (user) {
    localStorage.setItem("nostr_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("nostr_user");
  }
  const nextPubkey = user?.pubkey ?? null;
  if (prevPubkey !== nextPubkey) {
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

// Collect replaceable-event candidates across relays for a short settle window
// after each *newer* match arrives, then return the one with the highest
// created_at. Returns undefined on timeout/error/no events. Settling protects
// us from picking a stale copy when one relay answers fast and another holds
// a newer revision — important for kind 10040 which is admin-debug-critical.
// The settle timer resets every time we see a strictly newer event, capped by
// the overall timeoutMs so worst-case latency is still bounded.
async function fetchLatestReplaceable(
  relays: string[],
  filter: Parameters<typeof pool.request>[1],
  timeoutMs: number,
  settleMs = 600,
): Promise<NostrEvent | undefined> {
  return new Promise<NostrEvent | undefined>((resolve) => {
    let best: NostrEvent | undefined;
    let resolved = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const overall = setTimeout(() => finish(), timeoutMs);
    const sub = pool.request(relays, filter).subscribe({
      next: (event) => {
        const ev = event as NostrEvent;
        const isNewer = !best || ev.created_at > best.created_at;
        if (isNewer) {
          best = ev;
          // Reset the settle window so a newer revision arriving slightly
          // after a fast stale relay still gets picked up.
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(), settleMs);
        } else if (!settleTimer) {
          // First event ever (but not strictly newer than nothing — defensive)
          settleTimer = setTimeout(() => finish(), settleMs);
        }
      },
      error: () => finish(),
      complete: () => finish(),
    });

    function finish() {
      if (resolved) return;
      resolved = true;
      clearTimeout(overall);
      if (settleTimer) clearTimeout(settleTimer);
      try { sub.unsubscribe(); } catch {}
      resolve(best);
    }
  });
}

// Normalize a relay URL for dedup: trim whitespace, lowercase, strip a
// single trailing slash. Outbox relays often store wss://x/ and wss://x as
// distinct entries; without normalizing we'd query the same relay twice.
function normalizeRelayUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

function dedupRelays(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u) continue;
    const key = normalizeRelayUrl(u);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

export async function fetchTrustProviderList(pubkey: string, timeoutMs = 10000): Promise<NostrEvent | undefined> {
  try {
    const baseRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS);
    // Query the NIP-85 relay first — Brainstorm publishes 10040 there, and
    // most general-purpose relays don't carry kind 10040. Outbox relays remain
    // a fallback so we still find events published elsewhere. Dedup with URL
    // normalization so trailing-slash variants don't double up.
    const nip85 = NIP85_RELAY_URL;
    const writeRelays = nip85 ? dedupRelays([nip85, ...baseRelays]) : dedupRelays(baseRelays);

    const event = await fetchLatestReplaceable(
      writeRelays,
      { kinds: [10040], authors: [pubkey] },
      timeoutMs,
    );

    if (!event) return undefined;

    try {
      eventStore.add(event as any);
    } catch {}

    return event;
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

export async function fetchProfile(pubkey: string, timeoutMs = 10000): Promise<ProfileContent | undefined> {
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
  return user;
}

export async function handleLogin(): Promise<NostrUser> {
  const extensionFound = await waitForNostrExtension();
  if (!extensionFound) {
    throw new LoginError(
      "NO_EXTENSION",
      "No Nostr extension detected. You can sign in with your nsec instead, or install a NIP-07 extension."
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
        "Your extension denied the request. Unlock it and approve access, or sign in with your nsec."
      );
    }
    throw new LoginError(
      "EXTENSION_FAILED",
      `Your Nostr extension didn't respond${msg ? `: ${msg}` : ""}. Unlock it and try again, or sign in with your nsec.`
    );
  }

  if (!pubkey || typeof pubkey !== "string") {
    throw new LoginError(
      "EXTENSION_FAILED",
      "Your extension returned an invalid public key. Unlock it and try again, or sign in with your nsec."
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
        "Signing was cancelled. Approve the request in your extension, or sign in with your nsec."
      );
    }
    throw new LoginError(
      "EXTENSION_FAILED",
      `Your extension couldn't sign the login event${msg ? `: ${msg}` : ""}. Try again, or sign in with your nsec.`
    );
  }

  if (!signedEvent || !signedEvent.sig) {
    throw new LoginError(
      "EXTENSION_FAILED",
      "Your extension returned an unsigned event. Try again, or sign in with your nsec."
    );
  }

  clearSecretKey();
  return completeLogin(pubkey, signedEvent);
}

export async function loginWithNsec(nsec: string): Promise<NostrUser> {
  const trimmed = nsec.trim();
  if (!trimmed) {
    throw new LoginError("INVALID_NSEC", "Please paste your nsec (starts with “nsec1…”).");
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
      "That doesn't look like a valid nsec. It should start with “nsec1” and be 63 characters long."
    );
  }

  let pubkey: string;
  try {
    pubkey = getPublicKey(sk);
  } catch {
    throw new LoginError("INVALID_NSEC", "Couldn't derive a public key from that nsec.");
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

  storeSecretKey(sk);
  try {
    return await completeLogin(pubkey, signedEvent);
  } catch (err) {
    clearSecretKey();
    throw err;
  }
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
const MEILI_SEARCH_API = "https://brainstorm.world/api/search/profiles/meili";

export interface NostrSearchResult {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export async function searchProfilesMeili(
  query: string,
  options: { limit?: number; timeoutMs?: number; userPubkey?: string; pov?: "house" | "user" } = {}
): Promise<NostrSearchResult[]> {
  const { limit = 10, timeoutMs = 8000, userPubkey, pov = "house" } = options;
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    offset: "0",
    wotPov: pov,
  });
  if (pov === "user" && userPubkey) params.set("userPubkey", userPubkey);

  const resp = await fetch(`${MEILI_SEARCH_API}?${params.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
  const data = await resp.json();
  if (!data?.success) throw new Error("Search service unavailable");

  const hits: any[] = Array.isArray(data.hits) ? data.hits : [];
  const seen = new Set<string>();
  const out: NostrSearchResult[] = [];
  for (const h of hits) {
    const pubkey: string | undefined = h?.pubkey;
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);
    let npub: string = h?.npub;
    if (!npub) {
      try { npub = nip19.npubEncode(pubkey); } catch { continue; }
    }
    out.push({
      pubkey,
      npub,
      name: h?.name || undefined,
      displayName: h?.display_name || h?.displayName || undefined,
      picture: h?.picture || undefined,
      about: h?.about || undefined,
      nip05: h?.nip05 || undefined,
    });
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
