import { pool, PROFILE_RELAYS, publishToRelays, loadOutboxRelayListFromDb } from "./nostr";
import { activeAccount, signAs, signingFailure, type PublishOutcome } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { apiClient } from "./api";
import { loadKnownFollowList, recordFollowList, knownFollowCount, countFollows } from "@/lib/followStore";
import { activeHasSession } from "@/accounts/session";

/**
 * Ingest a freshly-signed kind-3 follow list into the backend synchronously, so
 * scoring runs against the real follows instead of waiting on relay propagation.
 * Awaited by the follow flow so it completes BEFORE the caller triggers GrapeRank.
 * Policy: requires a session token; respects 429 (rate-limit — never retry to
 * avoid spamming); retries other transient errors a few times, then gives up.
 * Best-effort — failure never blocks the follow (relays remain the source of truth).
 */
async function ingestFollowList(signed: Record<string, unknown>): Promise<void> {
  if (!activeHasSession()) return; // must be logged in
  const backoffMs = [600, 1500, 3000];
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      await apiClient.submitFollowList(signed);
      return;
    } catch (e: any) {
      if (e?.status === 429) return; // intentional rate-limit — respect it, stop
      if (attempt === backoffMs.length) return; // transient: gave up after retries
      await new Promise((r) => setTimeout(r, backoffMs[attempt]));
    }
  }
}

export interface NostrEvent {
  id?: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

/** This client's identifier, stamped on every list we publish for diagnosability. */
const CLIENT_TAG = ["client", "Brainstorm"];

/** Replace any existing client tag with ours (deduped). */
function withClientTag(tags: string[][]): string[][] {
  return [...tags.filter((t) => t[0] !== "client"), CLIENT_TAG];
}

/**
 * Pick the most-authoritative contact list among the candidates: the one with the
 * MOST `p` tags (ties broken by newest `created_at`). This stops us from merging
 * onto a stale/short relay response when a longer list is known.
 */
function pickAuthoritativeBase(candidates: (NostrEvent | null | undefined)[]): NostrEvent | null {
  let best: NostrEvent | null = null;
  let bestCount = -1;
  for (const c of candidates) {
    if (!c?.tags) continue;
    const count = countFollows(c.tags);
    if (count > bestCount || (count === bestCount && best && c.created_at > best.created_at)) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

function fetchReplaceableEvent(pubkey: string, kind: number, timeoutMs = 10000): Promise<NostrEvent | null> {
  return new Promise((resolve) => {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS)

    let latest: NostrEvent | null = null;
    const timer = setTimeout(() => resolve(latest), timeoutMs);

    pool.request(writeRelays, { kinds: [kind], authors: [pubkey], limit: 5 }).subscribe({
      next: (event: any) => {
        if (!latest || event.created_at > latest.created_at) {
          latest = {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            kind: event.kind,
            tags: event.tags,
            content: event.content,
            sig: event.sig,
          };
        }
      },
      error: () => {
        clearTimeout(timer);
        resolve(latest);
      },
      complete: () => {
        clearTimeout(timer);
        resolve(latest);
      },
    });
  });
}

export async function fetchContactList(pubkey: string): Promise<NostrEvent | null> {
  return fetchReplaceableEvent(pubkey, 3);
}

export async function fetchMuteList(pubkey: string): Promise<NostrEvent | null> {
  return fetchReplaceableEvent(pubkey, 10000);
}

export function getFollowedPubkeys(contactList: NostrEvent | null): Set<string> {
  const set = new Set<string>();
  if (!contactList) return set;
  for (const tag of contactList.tags) {
    if (tag[0] === "p" && tag[1]) set.add(tag[1]);
  }
  return set;
}

export function getMutedPubkeys(muteList: NostrEvent | null): Set<string> {
  const set = new Set<string>();
  if (!muteList) return set;
  for (const tag of muteList.tags) {
    if (tag[0] === "p" && tag[1]) set.add(tag[1]);
  }
  return set;
}

/**
 * Resolve the authoritative current contact list to build a kind-3 edit on top
 * of. Picks the longest among {caller cache, fresh relay fetch, persisted known
 * snapshot}. Returns `{ base: null }` when we can't confirm a base AND the user
 * is known to follow people — the caller MUST abort rather than publish, or it
 * would wipe the list.
 */
async function resolveContactBase(
  pubkey: string,
  cached?: NostrEvent | null,
): Promise<{ base: NostrEvent | null; known: number; unsafe: boolean }> {
  const known = knownFollowCount(pubkey);
  const fresh = cached ?? (await fetchContactList(pubkey));
  const stored = loadKnownFollowList(pubkey)?.event as NostrEvent | undefined;
  const base = pickAuthoritativeBase([cached, fresh, stored]);
  // Unsafe = we have no usable base, or the best base is shorter than what we
  // know the user follows (a stale/short relay read). Either way, don't publish.
  const baseCount = base ? countFollows(base.tags) : 0;
  const unsafe = (!base && known > 0) || (known > 0 && baseCount < known);
  return { base, known, unsafe };
}

const NOT_LOGGED_IN: PublishOutcome = { success: false, error: "Not logged in" };

/** A `p` tag naming this pubkey — how every follow and mute list is indexed. */
const isPTagFor = (pubkey: string) => (tag: string[]) => tag[0] === "p" && tag[1] === pubkey;

async function publishContactList(
  account: BrainstormAccount,
  base: NostrEvent | null,
  newTags: string[][],
): Promise<PublishOutcome> {
  try {
    const signed = await signAs(account, {
      kind: 3,
      tags: withClientTag(newTags),
      content: base?.content || "",
    });
    const res = await publishToRelays(signed);
    if (res.success) {
      recordFollowList(account.pubkey, signed as any, { authoritative: true });
      // GATE: ingest the follows server-side and WAIT for it before returning, so
      // the caller's subsequent GrapeRank trigger scores fresh follows (not stale
      // relay-propagation state). Best-effort — never fails the follow.
      await ingestFollowList(signed);
    }
    return res;
  } catch (e) {
    return signingFailure(e);
  }
}

export async function followUser(targetPubkey: string, cachedContactList?: NostrEvent | null): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return NOT_LOGGED_IN;
  if (account.pubkey === targetPubkey) return { success: false, error: "Cannot follow yourself" };

  const { base, unsafe } = await resolveContactBase(account.pubkey, cachedContactList);
  if (unsafe) {
    return { success: false, error: "Couldn't load your full follow list — try again in a moment." };
  }
  if (base) recordFollowList(account.pubkey, base as any); // remember the largest seen
  const baseTags = base?.tags ?? []; // brand-new account: genuinely empty list

  if (baseTags.some(isPTagFor(targetPubkey))) return { success: true };

  const newTags = [...baseTags, ["p", targetPubkey]];
  return publishContactList(account, base, newTags);
}

export async function unfollowUser(targetPubkey: string, cachedContactList?: NostrEvent | null): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return NOT_LOGGED_IN;

  const { base, unsafe } = await resolveContactBase(account.pubkey, cachedContactList);
  if (unsafe || !base) {
    return { success: false, error: "Couldn't load your full follow list — try again in a moment." };
  }
  recordFollowList(account.pubkey, base as any);

  if (!base.tags.some(isPTagFor(targetPubkey))) return { success: true };

  const newTags = base.tags.filter((t) => !isPTagFor(targetPubkey)(t));
  return publishContactList(account, base, newTags);
}

/**
 * Follow one or more accounts in a single signed kind-3 — used by the post-signup
 * onboarding. Safe by construction: merges the given pubkeys into the
 * authoritative base (empty for a brand-new account) and never shrinks an
 * existing list.
 */
export async function followPubkeys(targetPubkeys: string[]): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return NOT_LOGGED_IN;
  const wanted = targetPubkeys.filter((pk) => /^[0-9a-f]{64}$/i.test(pk) && pk !== account.pubkey);
  if (!wanted.length) return { success: false, error: "No valid accounts to follow" };

  const { base, unsafe } = await resolveContactBase(account.pubkey);
  if (unsafe) {
    return { success: false, error: "Couldn't load your full follow list — try again in a moment." };
  }
  if (base) recordFollowList(account.pubkey, base as any);
  const baseTags = base?.tags ?? [];
  const have = new Set(baseTags.filter(t => t[0] === "p").map(t => t[1]));
  const additions = wanted.filter(pk => !have.has(pk)).map(pk => ["p", pk]);
  if (!additions.length) return { success: true };

  const newTags = [...baseTags, ...additions];
  return publishContactList(account, base, newTags);
}

/** The mute list, replaced wholesale — the kind-3 path's `publishContactList`. */
async function publishMuteList(
  account: BrainstormAccount,
  base: NostrEvent,
  newTags: string[][],
): Promise<PublishOutcome> {
  try {
    const signed = await signAs(account, {
      kind: 10000,
      tags: withClientTag(newTags),
      content: base.content || "",
    });
    return await publishToRelays(signed);
  } catch (e) {
    return signingFailure(e);
  }
}

export async function muteUser(targetPubkey: string, cachedMuteList?: NostrEvent | null): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return NOT_LOGGED_IN;
  if (account.pubkey === targetPubkey) return { success: false, error: "Cannot mute yourself" };

  const current = cachedMuteList ?? await fetchMuteList(account.pubkey);
  if (!current) return { success: false, error: "Could not fetch your mute list from relays. Please try again." };

  if (current.tags.some(isPTagFor(targetPubkey))) return { success: true };

  return publishMuteList(account, current, [...current.tags, ["p", targetPubkey]]);
}

export async function unmuteUser(targetPubkey: string, cachedMuteList?: NostrEvent | null): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return NOT_LOGGED_IN;

  const current = cachedMuteList ?? await fetchMuteList(account.pubkey);
  if (!current) return { success: false, error: "Could not fetch your mute list" };

  if (!current.tags.some(isPTagFor(targetPubkey))) return { success: true };

  return publishMuteList(account, current, current.tags.filter((t) => !isPTagFor(targetPubkey)(t)));
}

export async function reportUser(targetPubkey: string, reason: string, note?: string): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return NOT_LOGGED_IN;
  if (account.pubkey === targetPubkey) return { success: false, error: "Cannot report yourself" };

  try {
    // NIP-56: the report `reason` is the machine-readable type on the p-tag; any
    // free-text the reporter adds goes in `content`.
    const signed = await signAs(account, {
      kind: 1984,
      tags: [["p", targetPubkey, reason]],
      content: (note ?? "").trim(),
    });
    return await publishToRelays(signed);
  } catch (e) {
    return signingFailure(e);
  }
}

export interface MyReport {
  /** Most-recent report event id. */
  id: string;
  reportType: string;
  reason: string;
  timestamp: number;
  /** Every one of my kind-1984 report events on this target (all get deleted on undo). */
  eventIds: string[];
}

/**
 * Fetch the current user's own NIP-56 (kind 1984) report(s) targeting `targetPubkey`.
 * Returns the most-recent report's details plus all report event ids, or null if the
 * user hasn't reported them — drives the "you reported this" state + unreport.
 */
export async function fetchMyReport(targetPubkey: string, timeoutMs = 8000): Promise<MyReport | null> {
  const account = activeAccount();
  if (!account) return null;
  const events: any[] = [];
  const seen = new Set<string>();
  const collected = await new Promise<any[]>((resolve) => {
    const timer = setTimeout(() => resolve(events), timeoutMs);
    pool.request(PROFILE_RELAYS, { kinds: [1984], authors: [account.pubkey], "#p": [targetPubkey] }).subscribe({
      next: (ev: any) => { const id = ev?.id; if (id && !seen.has(id)) { seen.add(id); events.push(ev); } },
      error: () => { clearTimeout(timer); resolve(events); },
      complete: () => { clearTimeout(timer); resolve(events); },
    });
  });
  if (!collected.length) return null;
  collected.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const latest = collected[0];
  let reportType = "other";
  for (const tag of latest.tags || []) {
    if (tag[0] === "p" && tag[1] === targetPubkey && tag[2]) { reportType = tag[2]; break; }
  }
  return {
    id: latest.id,
    reportType,
    reason: latest.content || "",
    timestamp: latest.created_at || 0,
    eventIds: collected.map((e) => e.id).filter(Boolean),
  };
}

/**
 * "Unreport" — publish a NIP-09 (kind 5) deletion of the user's own kind-1984
 * report(s) targeting `targetPubkey`. The deletion propagates to relays; the
 * trust-score effect may lag until the backend re-ingests it (surfaced in copy).
 */
export async function unreportUser(targetPubkey: string): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return NOT_LOGGED_IN;
  const mine = await fetchMyReport(targetPubkey);
  if (!mine || !mine.eventIds.length) return { success: true }; // nothing to undo
  try {
    const signed = await signAs(account, {
      kind: 5,
      tags: [...mine.eventIds.map((id) => ["e", id]), ["k", "1984"]],
      content: "",
    });
    return await publishToRelays(signed);
  } catch (e) {
    return signingFailure(e);
  }
}
