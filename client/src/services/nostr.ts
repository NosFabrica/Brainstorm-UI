import { nip19, finalizeEvent, generateSecretKey, verifyEvent } from "nostr-tools";
import { env } from "@/lib/runtimeEnv";
import { declaresTrustProvider } from "@/lib/nip85Declaration";
import { pool } from "@/lib/relayPool";
import { eventStore } from "@/lib/eventStore";
import { searchRelay } from "@/lib/searchRelay";
import { CONTENT_RELAYS, PROFILE_RELAYS } from "@/lib/relays";
import { requestAll, requestAllByRelay, requestNewest, requestOne } from "@/lib/relayRequest";
import { addressLoader, loadReplaceable } from "@/lib/loaders";
import {
  dedupeRelays,
  inboxRelays,
  outboxRelays,
  outboxRelaysFromDb,
  parseRelayList,
  planOutboxReads,
} from "@/lib/relayRouting";

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
import {
  accountFor,
  accountsFor,
  activateAccount,
  adoptAccount,
  extensionAccount,
  forgetAccount,
  localAccount,
  signOutActiveAccount,
} from "@/accounts/login";
import { updateMetadata, type AccountMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { activePubkey, identityHas, rememberProfile } from "@/accounts/display";
import {
  openPastedKey,
  UNUSABLE_BACKUP_MESSAGE,
  type RestoreFailure,
} from "@/accounts/restore";
import { queryClient } from "@/lib/queryClient";
import { extractAdminFlag } from "@/lib/jwt";
import { recordFollowList } from "@/lib/followStore";
import { accountKey, clearAccountStorage, clearSessionScopedStorage } from "@/lib/accountStorage";
import { isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { NostrEvent } from "applesauce-core/helpers";


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




/**
 * Unlike its neighbours this one streams: `onProfile` fires per profile as each
 * arrives, so a caller can paint each avatar the moment it lands rather than
 * after the slowest relay.
 *
 * Per pubkey rather than one filter over all of them, because that is what lets
 * the loader answer from the store for the ones it already holds and merge the
 * rest into whatever batch is forming. A single `authors: [...]` filter would
 * fetch every one of them again.
 */
export function fetchProfiles(
  pubkeys: string[],
  onProfile?: (pubkey: string, profile: ProfileContent) => void
): Promise<void> {
  const unique = Array.from(new Set(pubkeys));
  return Promise.all(
    unique.map(async (pubkey) => {
      const event = await loadReplaceable(0, pubkey);
      try {
        if (!event || !onProfile || !isValidProfile(event)) return;
        const content = getProfileContent(event);
        if (content) onProfile(event.pubkey, content);
      } catch {}
    }),
  ).then(() => undefined);
}

/**
 * A user's NIP-65 relay list (kind 10002) — the routing table everything else
 * reads from.
 *
 * Asked for on the BOOTSTRAP set rather than on "their outbox relays": their
 * outbox is what this event defines, so routing the lookup by it is circular
 * and, on a cold store, just restates the defaults. `PROFILE_RELAYS` carries
 * purplepag.es, which exists to index exactly this kind.
 */
export async function fetchOutboxRelayList(pubkey: string, timeoutMs = 10000): Promise<NostrEvent | undefined> {
  try {
    return await loadReplaceable(10002, pubkey, { relays: PROFILE_RELAYS, timeoutMs });
  } catch {}

  return undefined;
}

/**
 * A user's NIP-85 trust-provider declaration (kind 10040), from the relays they
 * write to. The relay list is loaded first — without that the read falls back to
 * the hardcoded set and an activation published only to the user's own relays
 * reads as "never activated".
 */
export async function fetchTrustProviderList(pubkey: string, timeoutMs = 10000): Promise<NostrEvent | undefined> {
  try {
    const writeRelays = await outboxRelays(pubkey, PROFILE_RELAYS);

    return await loadReplaceable(10040, pubkey, { relays: writeRelays, timeoutMs });
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
  const event = await fetchTrustProviderList(pubkey, timeoutMs)
  return !!event && declaresTrustProvider(event, innerPubkey, NIP85_RELAY_URL)
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
    // Awaited, not read from the store: app data lives wherever its author
    // publishes and the default set carries almost none of it, so guessing here
    // reads back as "this user has no assistant" and mints a second one.
    const writeRelays = await outboxRelays(userPubkey, PROFILE_RELAYS);

    // NIP-78 events are addressable/replaceable — different relays may hold
    // different versions, so this waits out the window for the newest rather
    // than hydrating from whichever relay answered first.
    const newest = await loadReplaceable(30078, userPubkey, {
      identifier: ASSISTANT_POINTER_D_TAG,
      relays: writeRelays,
      timeoutMs,
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
    const relays = await outboxRelays(pubkey, PROFILE_RELAYS);
    const newest = await loadReplaceable(30078, pubkey, {
      identifier: PROFILE_PREFS_D_TAG,
      relays,
      timeoutMs,
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
    const relays = await outboxRelays(account.pubkey, PROFILE_RELAYS);
    const newest = await loadReplaceable(30078, account.pubkey, {
      identifier: dTag,
      relays,
      timeoutMs,
    });
    const content = newest?.content;
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
  const extras = extraRelays.map((r) => r.trim()).filter((r) => r.length > 0);
  try {
    // Kind-0 is the one kind the default set genuinely covers — purplepag.es
    // exists to index it — so the first pass does NOT pay for a relay-list
    // lookup it usually doesn't need. Time-to-avatar is on this path.
    const known = dedupeRelays([...outboxRelaysFromDb(pubkey, PROFILE_RELAYS), ...extras]);
    // Explicit relays mean somebody is asking about those relays — the admin
    // health card passes operator-entered ones to find out whether they carry
    // this kind-0. A cached answer is not an answer to that.
    const first = await loadReplaceable(0, pubkey, { relays: known, timeoutMs, fromRelays: extras.length > 0 });
    if (first) return first;
    // Somebody asking about NAMED relays gets an answer about those relays.
    // Widening the search on a miss would answer a different question — and
    // "yes, this relay has their kind-0" is the admin card's whole output.
    if (extras.length) return undefined;

    // Nothing came back. NOW learn where this author actually writes, and ask
    // there before concluding they have no profile — a user who publishes only
    // to their own relays is invisible to the default set.
    const routed = await outboxRelays(pubkey, PROFILE_RELAYS);
    if (routed.length === known.length && routed.every((r) => known.includes(r))) return undefined;
    return await loadReplaceable(0, pubkey, { relays: routed, timeoutMs, fromRelays: true });
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
  const hints = (opts.relayHints ?? []).map((r) => r.trim()).filter((r) => r.length > 0);

  // The search relay's corpus is wider than the content relays' (probed:
  // a Divine creator's kind-34236 videos lived only there) — ask it too.
  //
  // It does NOT wait on the NIP-65 lookup: finding out where this author writes
  // tells the relay fan-out where to go and tells the search relay nothing, so
  // putting it in front of both would just add its latency to the whole read.
  const [fromRelays, fromSearch] = await Promise.all([
    outboxRelays(pubkey, PROFILE_RELAYS).then((routed) =>
      requestAll(dedupeRelays([...routed, ...hints]), { kinds, authors: [pubkey], limit }, timeoutMs),
    ),
    fetchFromSearchRelayByFilter({ kinds, authors: [pubkey], limit }, timeoutMs),
  ]);
  const byId = new Map<string, NostrEvent>();
  for (const e of [...fromRelays, ...fromSearch]) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, limit);
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
  // include the big shared relays so a platform-hosted stream is found. The
  // streamer's own relays join that set (a self-hosted stream IS their event),
  // but nothing here waits on the lookup to find out.
  const relays = outboxRelays(pubkey, []).then((routed) =>
    dedupeRelays([
      ...PROFILE_RELAYS,
      ...routed,
      ...(opts.relayHints ?? []).map((r) => r.trim()).filter((r) => r.length > 0),
      "wss://relay.zap.stream/",
      "wss://relay.nostr.band/",
    ]),
  );

  // Two filters rather than one, because a platform-hosted stream names the
  // streamer in a `p` tag while a self-hosted one authors it. They share the
  // window: both start now, and neither waits on the other.
  // The search relay's corpus is wider than the content relays' (probed:
  // a bridged Owncast channel's live event lived only there) — ask it too,
  // for both shapes.
  const [authored, hosted, searchAuthored, searchHosted] = await Promise.all([
    relays.then((r) => requestAll(r, { kinds: [30311], authors: [pubkey], limit: 8 }, timeoutMs)),
    relays.then((r) => requestAll(r, { kinds: [30311], "#p": [pubkey], limit: 8 }, timeoutMs)),
    fetchFromSearchRelayByFilter({ kinds: [30311], authors: [pubkey], limit: 8 }, timeoutMs),
    fetchFromSearchRelayByFilter({ kinds: [30311], "#p": [pubkey], limit: 8 }, timeoutMs),
  ]);

  // Keep the latest version per addressable coordinate (kind:pubkey:d).
  const byCoord = new Map<string, NostrEvent>();
  for (const event of [...authored, ...hosted, ...searchAuthored, ...searchHosted]) {
    const d = event.tags.find((tag) => tag[0] === "d")?.[1] || "";
    const coord = `${event.kind}:${event.pubkey}:${d}`;
    const previous = byCoord.get(coord);
    if (!previous || (event.created_at || 0) > (previous.created_at || 0)) byCoord.set(coord, event);
  }
  return Array.from(byCoord.values())
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, 8);
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

  // The store first: search results are stored on arrival, so an event found
  // through search opens instantly — no network, no relay-coverage roulette.
  const found = new Map<string, NostrEvent>();
  for (const id of unique) {
    const known = eventStore.getEvent(id);
    if (known) found.set(id, known);
  }
  let missing = unique.filter((id) => !found.has(id));

  if (missing.length) {
    const targetRelays = relays.length ? relays : PROFILE_RELAYS;
    // Asking by id means the answer set is known up front: once every one has
    // arrived there is nothing left to wait for.
    const fetched = await requestAll(targetRelays, { ids: missing }, timeoutMs, {
      enough: (collected) => collected.size >= missing.length,
    });
    for (const event of fetched) found.set(event.id, event);
    missing = missing.filter((id) => !found.has(id));
  }

  if (missing.length) {
    // Last resort: the SEARCH relay, whose corpus is wider than the content
    // relays' — an id found by search may exist nowhere else we ask. Its
    // reads need a lens; include:spam is the "any event, unranked" one.
    for (const event of await fetchFromSearchRelay(missing, Math.min(timeoutMs, 5000))) {
      eventStore.add(event);
      found.set(event.id, event);
    }
  }

  return [...found.values()];
}

/** Any filter against the search relay, with the lens it requires; EOSE or
 *  timeout resolves, never rejects. */
function fetchFromSearchRelayByFilter(filter: Record<string, unknown>, timeoutMs: number): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    let relay: ReturnType<typeof searchRelay>;
    try {
      relay = searchRelay();
    } catch {
      relay = null;
    }
    if (!relay) return resolve([]);
    const events: NostrEvent[] = [];
    let sub: { unsubscribe: () => void } | null = null;
    const timer = setTimeout(finish, timeoutMs);
    try {
      sub = relay
        .req({ ...filter, search: "include:spam" } as Parameters<typeof relay.req>[0])
        .subscribe((msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            eventStore.add(msg.event);
            events.push(msg.event);
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        });
    } catch {
      finish();
    }
    function finish() {
      clearTimeout(timer);
      sub?.unsubscribe();
      resolve(events);
    }
  });
}

function fetchFromSearchRelay(ids: string[], timeoutMs: number): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    let relay: ReturnType<typeof searchRelay>;
    try {
      relay = searchRelay();
    } catch {
      relay = null;
    }
    if (!relay) return resolve([]);
    const events: NostrEvent[] = [];
    const sub = relay
      .req({ ids, search: "include:spam", limit: ids.length })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) events.push(msg.event);
        else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(events);
    }
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
  return requestAll(targetRelays, filter as Parameters<typeof pool.request>[1], timeoutMs);
}

/**
 * Events from MANY known authors, each relay asked only about the authors it
 * actually serves.
 *
 * The plain `fetchEventsByFilter(…, CONTENT_RELAYS)` shape this replaces sent
 * one filter naming every author to a fixed handful of relays — the pre-outbox
 * answer, and the one place the model had no effect at all. Here the authors'
 * own relays are loaded, a bounded set is chosen to cover as many of them as
 * possible, and each connection gets a filter naming only its own.
 *
 * `fallback` is where an author with no relay list is looked for, and the floor
 * for anyone the connection budget could not otherwise cover.
 */
export async function fetchEventsByAuthors(
  pubkeys: string[],
  filter: Omit<Record<string, unknown>, "authors">,
  {
    fallback = CONTENT_RELAYS,
    timeoutMs = 8000,
    maxConnections,
  }: { fallback?: string[]; timeoutMs?: number; maxConnections?: number } = {},
): Promise<NostrEvent[]> {
  if (!pubkeys.length) return [];
  const plan = await planOutboxReads(pubkeys, fallback, { maxConnections });
  return requestAllByRelay(plan, filter as Parameters<typeof requestAllByRelay>[1], timeoutMs);
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
  // Addressable events live where their AUTHOR writes — an `naddr` that names no
  // relay is otherwise a coin flip against the default set. Their outbox relays
  // join whatever the caller and the pointer already named.
  const authorRelays = await outboxRelays(
    Array.from(new Set(valid.map((c) => c.pubkey))),
    [],
  ).catch(() => [] as string[]);
  const targetRelays = dedupeRelays(
    [...relays, ...authorRelays, ...valid.flatMap((c) => c.relays ?? [])],
  );
  const kinds = Array.from(new Set(valid.map((c) => c.kind)));
  const authors = Array.from(new Set(valid.map((c) => c.pubkey)));
  const identifiers = Array.from(new Set(valid.map((c) => c.identifier)));
  const events = await requestAll(
    targetRelays.length ? targetRelays : PROFILE_RELAYS,
    { kinds, authors, "#d": identifiers },
    timeoutMs,
  );
  // The filter is a cross-product of the requested kinds, authors and d-tags, so
  // it matches coordinates nobody asked for; `wanted` is what narrows it back.
  const keep = (event: NostrEvent) => {
    const d = event.tags.find((tag) => tag[0] === "d")?.[1] ?? "";
    const key = `${event.kind}:${event.pubkey}:${d}`;
    if (!wanted.has(key)) return;
    const existing = result.get(key);
    if (!existing || (event.created_at || 0) > (existing.created_at || 0)) result.set(key, event);
  };
  for (const event of events) keep(event);

  // Last resort, as fetchEventsByIds does: the SEARCH relay, whose corpus is
  // wider than the content relays'. GitCitadel's wiki articles (kind 30818)
  // were listed by search and unopenable — their naddr names no relay, and
  // the content relays never had them (Benjamin, 2026-09-05).
  const missing = valid.filter((c) => !result.has(coordKey(c)));
  if (missing.length) {
    const found = await fetchFromSearchRelayByFilter(
      {
        kinds: Array.from(new Set(missing.map((c) => c.kind))),
        authors: Array.from(new Set(missing.map((c) => c.pubkey))),
        "#d": Array.from(new Set(missing.map((c) => c.identifier))),
      },
      Math.min(timeoutMs, 5000),
    );
    for (const event of found) keep(event);
  }
  return result;
}

/** Fetch kind-0 profiles for many pubkeys, returning a pubkey→content map. */
export async function fetchProfileMap(
  pubkeys: string[],
  timeoutMs = 6000,
): Promise<Map<string, ProfileContent>> {
  const unique = Array.from(new Set(pubkeys.filter((pk) => /^[0-9a-f]{64}$/i.test(pk))));
  const map = new Map<string, ProfileContent>();
  if (!unique.length) return map;
  // Per pubkey, so the ones already in the store cost nothing and the rest join
  // whatever batch is forming rather than opening a request of their own.
  const events = await Promise.all(
    unique.map((pubkey) => loadReplaceable(0, pubkey, { timeoutMs })),
  );
  for (const event of events) {
    try {
      if (!event || !isValidProfile(event as any)) continue;
      const content = getProfileContent(event as any);
      if (content) map.set(event.pubkey, content);
    } catch {}
  }
  return map;
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
  rememberProfile(account, {
    name: getDisplayName(content) || content.name || content.display_name,
    picture: getProfilePicture(content) || content.picture || content.image,
    nip05: content.nip05,
  });
}


/**
 * Kinds we do NOT deliver to the inboxes of the people they name.
 *
 * Two reasons, and they are different. Some of these `p`-tag a membership list
 * rather than an address book: a kind-3 names everyone you follow and is
 * addressed to none of them, so routing it to their inboxes would be a
 * broadcast nobody asked for.
 *
 * The rest are CLAIMS ABOUT a person rather than messages TO them. A report or
 * a disputed tag is a signal for the reader's own network to weigh; pushing it
 * into its subject's inbox is not a notification they asked for, and an inbox
 * you can write to with an accusation is a harassment vector. Those stay on the
 * author's own relays (and, for tags, the hub), where a reader looking for them
 * will find them.
 */
const NOT_ADDRESSED_TO_P_TAGS = new Set([
  0,     // profile metadata
  3,     // follows
  1984,  // NIP-56 report — a claim about them, not a message to them
  9998,  // tagging: dispute
  9999,  // tagging: assertion
  10000, // mute list — its `p` tags are people you are muting
  10002, // relay list
  10040, // NIP-85 provider declaration
  30078, // app data
  39998, // tagging: addressable dispute
  39999, // tagging: tag element
]);

/** Who an event is addressed to: its `p` tags, minus the author themself. */
function addressees(signedEvent: NostrEvent): string[] {
  if (NOT_ADDRESSED_TO_P_TAGS.has(signedEvent.kind)) return [];
  const out = new Set<string>();
  for (const tag of signedEvent.tags || []) {
    if (tag[0] !== "p" && tag[0] !== "P") continue;
    const pubkey = typeof tag[1] === "string" ? tag[1].toLowerCase() : "";
    if (/^[0-9a-f]{64}$/.test(pubkey) && pubkey !== signedEvent.pubkey.toLowerCase()) out.add(pubkey);
  }
  return Array.from(out);
}

/**
 * Where a signed event goes: the author's own write relays, the READ relays of
 * everyone it names, anything the caller adds, and our defaults as a floor.
 *
 * The inbox half is the part that was missing. A reply, a report, an RSVP or a
 * vouch that only lands on the author's relays never reaches the person it is
 * about — they are reading somewhere else, which is the whole point of them
 * having published a relay list.
 *
 * The recipient lookups are best-effort on a short deadline: a publish must not
 * hang because a stranger's kind-10002 is slow, and losing the inbox half is a
 * missed notification, not a lost event.
 */
export async function publishRelaysFor(
  signedEvent: NostrEvent,
  extraRelays: string[] = [],
): Promise<string[]> {
  const [own, inboxes] = await Promise.all([
    outboxRelays(signedEvent.pubkey, PROFILE_RELAYS).catch(() => PROFILE_RELAYS),
    inboxRelays(addressees(signedEvent), []).catch(() => [] as string[]),
  ]);
  return dedupeRelays([...own, ...inboxes, ...extraRelays]);
}

/**
 * Publish a signed event to everywhere it belongs.
 *
 * `extraRelays` is genuinely extra — it is UNIONED with the routed set, never a
 * replacement for it. (This argument used to be named `relays` and was silently
 * ignored, which is why `services/tags.ts` had to hand-roll `pool.publish`.)
 */
export async function publishToRelays(
  signedEvent: NostrEvent,
  extraRelays: string[] = []
): Promise<{ success: boolean; relay?: string; error?: string; accepted?: number; total?: number }> {
  const writeRelays = await publishRelaysFor(signedEvent, extraRelays);

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
  // Pinned. The backoff below runs for seconds, which is long enough for an
  // account switch, and re-reading the Active Account per attempt would sign and
  // cache A's profile as B — the same reason `runInitialSetup` pins.
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };

  // Signed once, published up to three times. The retry is for thin propagation,
  // which is the relays' problem and not the signature's; kind 0 is replaceable,
  // so rebroadcasting the same event is idempotent. Re-signing meant a profile
  // save against an unresponsive bunker cost three approval prompts and three
  // 30-second deadlines before it gave up.
  let signed: Awaited<ReturnType<typeof signAs>>;
  try {
    signed = await signAs(account, { kind: 0, tags, content: JSON.stringify(content) });
    if (signed.kind !== 0) return { success: false, error: "Signer returned an unexpected event kind" };
  } catch (e) {
    return signingFailure(e);
  }

  let res = await publishToRelays(signed);
  for (let attempt = 0; attempt < PROFILE_PUBLISH_BACKOFF_MS.length; attempt++) {
    if ((res.accepted ?? (res.success ? 1 : 0)) >= 2) break; // broad enough
    await new Promise((r) => setTimeout(r, PROFILE_PUBLISH_BACKOFF_MS[attempt]));
    res = await publishToRelays(signed);
  }
  if (res.success) {
    // The store outranks the display cache in `useActiveAccountDisplay`, and it is
    // store-first, so without this the edit reverts on the next render and the old
    // kind-0 is written back over the cache. Reload was the only way out.
    eventStore.add(signed);
    try { cacheProfile(content as unknown as ProfileContent, account.pubkey); } catch {}
    // Pinned to the same Account, for the reason the profile publish above is:
    // this fires after the backoff, and `announceRelayListAs` would otherwise
    // re-read the Active one and stamp A's outbox list with B's key.
    void announceRelayListAs(account).catch(() => {});
  }
  // No `cancelled` here: signing already succeeded, so what's left is the relays'
  // answer. A declined unlock leaves above, through `signingFailure`.
  return { success: res.success, error: res.error };
}

/**
 * Publish a NIP-65 relay list (kind 10002) as the Active Account.
 *
 * This REPLACES whatever list the user has — kind 10002 is replaceable — so it
 * is only for a caller that means to set the list. Anything that merely wants
 * the user to be discoverable wants `announceRelayList`.
 */
export async function publishRelayList(relays: string[]): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  return publishRelayListAs(account, relays);
}

/** The same, for a caller that has already pinned which Account is publishing. */
async function publishRelayListAs(
  account: BrainstormAccount,
  relays: string[],
): Promise<PublishOutcome> {
  const tags = relays.filter(Boolean).map((r) => ["r", r]);
  try {
    const signed = await signAs(account, { kind: 10002, tags, content: "" });
    if (signed.kind !== 10002) return { success: false, error: "Signer returned an unexpected event kind" };
    const res = await publishToRelays(signed);
    // After the publish, not before: `publishToRelays` routes by the list in the
    // store, so the new list would otherwise decide where it is itself announced.
    if (res.success) eventStore.add(signed);
    return res;
  } catch (e) {
    return signingFailure(e);
  }
}

/**
 * Make sure this Account HAS a discoverable NIP-65 list — without overwriting
 * the one it already has.
 *
 * This used to sign a fresh kind-10002 carrying our five defaults every time a
 * profile was saved. Kind 10002 is replaceable, so a user who had curated their
 * relays in another client lost that list the first time they edited their bio
 * here, and every outbox-model client then routed them to our defaults instead
 * of to their own relays.
 *
 * So: if a list exists, re-broadcast that exact event (idempotent — same id,
 * same signature, no signer prompt) so it is present on the relays we read
 * from. Only a user who has never published one gets ours, and only as a
 * starting point they are free to change.
 */
async function announceRelayListAs(account: BrainstormAccount): Promise<PublishOutcome> {
  // Asked for before deciding, not just read from the store: "we have not
  // loaded it" and "it does not exist" are the same shape locally, and acting
  // on the first as if it were the second is exactly how the list got clobbered.
  const existing =
    (eventStore.getReplaceable(10002, account.pubkey) as NostrEvent | undefined) ??
    (await fetchOutboxRelayList(account.pubkey, 6000));

  if (existing) {
    const theirs = parseRelayList(existing);
    const relays = dedupeRelays([...theirs.write, ...PROFILE_RELAYS]);
    try {
      const responses = await pool.publish(relays, existing as any);
      const accepted = responses.filter((r) => r.ok).length;
      return accepted
        ? { success: true, relay: responses.find((r) => r.ok)?.from }
        : { success: false, error: "All relays failed" };
    } catch {
      return { success: false, error: "All relays failed" };
    }
  }

  return publishRelayListAs(account, PROFILE_RELAYS);
}

/** `announceRelayListAs` for the Active Account. */
export async function announceRelayList(): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  return announceRelayListAs(account);
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
  const events = await requestAll(PROFILE_RELAYS, { kinds: [1984], "#p": [targetPubkey] }, timeoutMs);
  return events.map((event) => ({
    reporterPubkey: event.pubkey,
    targetPubkey,
    // The `p` tag naming the target carries the NIP-56 report type.
    reportType: event.tags.find((tag) => tag[0] === "p" && tag[1] === targetPubkey && tag[2])?.[2] ?? "other",
    timestamp: event.created_at,
    reason: event.content || "",
  }));
}

export async function fetchReportsByPubkey(
  reporterPubkey: string,
  timeoutMs = 12000
): Promise<ReportMetadata[]> {
  const relays = await outboxRelays(reporterPubkey, PROFILE_RELAYS);
  const events = await requestAll(relays, { kinds: [1984], authors: [reporterPubkey] }, timeoutMs);
  return events.flatMap((event) =>
    event.tags
      .filter((tag) => tag[0] === "p" && tag[1])
      .map((tag) => ({
        reporterPubkey: event.pubkey,
        targetPubkey: tag[1],
        reportType: tag[2] || "other",
        timestamp: event.created_at,
        reason: event.content || "",
      })),
  );
}

export async function fetchMuteListTimestamp(
  muterPubkey: string,
  timeoutMs = 10000
): Promise<MuteMetadata | undefined> {
  try {
    const relays = await outboxRelays(muterPubkey, PROFILE_RELAYS);
    const event = await requestOne(relays, { kinds: [10000], authors: [muterPubkey] }, timeoutMs);

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
