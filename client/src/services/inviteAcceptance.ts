// The single seam for "who just joined and followed me back."
//
// Today this is DERIVED from the Web-of-Trust followers graph (no backend invite
// record exists): new inbound followers, since a per-user baseline, who are
// brand-new to Brainstorm and whom the sender doesn't already follow back. When a
// real backend invite record ships, swap the body of `fetchNewJoiners` for a
// precise "accepted invites" query — the hook + card never change.

import { apiClient } from "@/services/api";
import { fetchProfileMap } from "@/services/nostr";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { nip19 } from "nostr-tools";

export interface NewJoiner {
  pubkey: string;
  npub: string;
  name?: string;
  picture?: string;
}

const knownKey = (pk: string) => `brainstorm_known_followers:${pk}`;
/** QA override: home is auth-gated, so preview drives canned joiners via this key. */
const DEMO_KEY = "brainstorm_invite_demo";
const MAX_SHOWN = 8;

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? (arr.filter((x) => typeof x === "string") as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore storage failures */
  }
}

/** followed_by items are either bare pubkey strings or `{ pubkey }` objects. */
function parsePubkeys(res: unknown): string[] {
  const items = ((res as { data?: { items?: Array<string | { pubkey?: string }> } })?.data?.items ?? []);
  return items.map((e) => (typeof e === "string" ? e : e?.pubkey)).filter((p): p is string => !!p);
}

const mkDemo = (hex: string, name: string, picture: string): NewJoiner => ({
  pubkey: hex,
  npub: nip19.npubEncode(hex),
  name,
  picture,
});
const ALL_DEMO: NewJoiner[] = [
  mkDemo("1111111111111111111111111111111111111111111111111111111111111111", "Ava Chen", "https://randomuser.me/api/portraits/women/44.jpg"),
  mkDemo("2222222222222222222222222222222222222222222222222222222222222222", "Marcus Reid", "https://randomuser.me/api/portraits/men/32.jpg"),
  mkDemo("3333333333333333333333333333333333333333333333333333333333333333", "Priya Nair", "https://randomuser.me/api/portraits/women/68.jpg"),
];
/** Demo joiners minus any already acknowledged (welcomed/dismissed) — so the QA
 *  flow behaves like production: welcoming removes them and reveals the payoff. */
function demoJoiners(myPubkey: string): NewJoiner[] {
  const known = readSet(knownKey(myPubkey));
  return ALL_DEMO.filter((j) => !known.has(j.pubkey));
}

/**
 * Newcomers who just followed the sender. First call seeds the baseline silently
 * (so the existing follower base isn't reported as "new"). Returns at most
 * MAX_SHOWN, enriched with name + avatar.
 */
export async function fetchNewJoiners(myPubkey: string): Promise<NewJoiner[]> {
  if (!myPubkey) return [];
  try {
    if (localStorage.getItem(DEMO_KEY) === "true") return demoJoiners(myPubkey);
  } catch {
    /* ignore */
  }

  // 1. All current followers.
  const allRes = await apiClient.getUserConnections(myPubkey, "followed_by", { limit: 100, order: "desc" });
  const followers = parsePubkeys(allRes);

  const known = readSet(knownKey(myPubkey));
  if (known.size === 0) {
    // First run: seed baseline silently — nothing is "new" yet.
    writeSet(knownKey(myPubkey), new Set(followers));
    return [];
  }

  const fresh = followers.filter((pk) => !known.has(pk) && pk !== myPubkey);
  if (!fresh.length) return [];

  // 2. Narrow to newcomers: fresh followers NOT in the trusted/established set.
  let trusted = new Set<string>();
  try {
    const trustedRes = await apiClient.getUserConnections(myPubkey, "followed_by", {
      limit: 100,
      order: "desc",
      verified_only: true,
    });
    trusted = new Set(parsePubkeys(trustedRes));
  } catch {
    /* if the trusted call fails, fall back to all fresh followers */
  }
  const newcomers = fresh.filter((pk) => !trusted.has(pk));
  const pool = newcomers.length ? newcomers : fresh;

  // 3. Exclude anyone the sender already follows back.
  let following = new Set<string>();
  try {
    following = getFollowedPubkeys(await fetchContactList(myPubkey));
  } catch {
    /* ignore — worst case we show someone already followed; follow is a no-op */
  }
  const candidates = pool.filter((pk) => !following.has(pk)).slice(0, MAX_SHOWN);
  if (!candidates.length) return [];

  // 4. Enrich names + avatars (best-effort).
  let profs: Awaited<ReturnType<typeof fetchProfileMap>> | undefined;
  try {
    profs = await fetchProfileMap(candidates);
  } catch {
    /* names optional */
  }
  return candidates.map((pk) => ({
    pubkey: pk,
    npub: nip19.npubEncode(pk),
    name: profs?.get(pk)?.display_name || profs?.get(pk)?.name,
    picture: profs?.get(pk)?.picture,
  }));
}

/** Fold pubkeys into the baseline so they stop surfacing (welcomed or dismissed). */
export function acknowledgeJoiners(myPubkey: string, pubkeys: string[]): void {
  if (!myPubkey || !pubkeys.length) return;
  const known = readSet(knownKey(myPubkey));
  pubkeys.forEach((pk) => known.add(pk));
  writeSet(knownKey(myPubkey), known);
}
