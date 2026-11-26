/**
 * Whose list items count: an item shows when its author is in the reader's
 * web of trust — ranked at or above the verified line from the active
 * Perspective (the team, 2026-10-01: "every item in the current PoV's WoT").
 *
 * Ranks are NIP-85 kind-30382 `rank` assertions, read where the observer's
 * own kind-10040 says their scorer publishes (services/trustSource) — the
 * same chain tags use, so a list and a tag agree on who counts. An observer
 * with no 10040 (never activated) falls back to the house, never to
 * "everyone": a missing declaration is not a reason to trust strangers.
 *
 * The line is the verified line, `DEFAULT_VERIFIED_LINE` (influence 0.02),
 * on the 30382 0–100 scale: rank 2. Tags count asserters from rank 1
 * (tagging.config.json `minRank`); a list item is shown to the reader, so it
 * takes the line the rest of the app calls verified.
 */
import type { NostrEvent } from "nostr-tools";
import { fetchEventsByFilter } from "@/services/nostr";
import { resolveHouseObserver, resolveTrustSource, type TrustSourceRef } from "@/services/trustSource";
import { DEFAULT_VERIFIED_LINE } from "@/services/trustThreshold";

export const VERIFIED_RANK = Math.round(DEFAULT_VERIFIED_LINE * 100);

/** "house" for the Brainstorm Perspective, else the observer's own pubkey. */
export type RankObserver = "house" | string;

export interface AuthorRanks {
  /** Rank 0–100 per author the scorer has assessed; unassessed authors are absent. */
  ranks: Map<string, number>;
  /** Whose scorer answered: the observer's own, the house's (a fallback), or nobody's. */
  source: "observer" | "house" | null;
}

const CHUNK = 100;
const TIMEOUT_MS = 8000;

async function sourceFor(
  observer: RankObserver,
): Promise<{ ref: TrustSourceRef; source: "observer" | "house" } | null> {
  const house = async () => {
    const pk = await resolveHouseObserver();
    const ref = pk ? await resolveTrustSource(pk) : null;
    return ref ? { ref, source: "house" as const } : null;
  };
  if (observer === "house") return house();
  const own = await resolveTrustSource(observer);
  return own ? { ref: own, source: "observer" } : house();
}

export async function fetchAuthorRanks(pubkeys: string[], observer: RankObserver): Promise<AuthorRanks> {
  const unique = [...new Set(pubkeys.filter(Boolean))];
  const resolved = await sourceFor(observer);
  if (!resolved) return { ranks: new Map(), source: null };
  const { ref, source } = resolved;
  return { ranks: authorRanksFrom(await readAuthorRanks(ref, unique), ref.taPubkey, unique), source };
}

/** The scorer's kind 30382s about these people, from its own relay, CHUNK at a time. */
export async function readAuthorRanks(ref: TrustSourceRef, pubkeys: string[]): Promise<NostrEvent[]> {
  const unique = [...new Set(pubkeys.filter(Boolean))];
  const out: NostrEvent[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const events = await fetchEventsByFilter(
      { kinds: [30382], authors: [ref.taPubkey], "#d": unique.slice(i, i + CHUNK) },
      [ref.relay],
      TIMEOUT_MS,
    ).catch(() => [] as NostrEvent[]);
    out.push(...events);
  }
  return out;
}

/**
 * Each asked person's rank, from the scorer's kind 30382s: its own assertion
 * about someone asked, or nothing — the pool drops what a relay wasn't asked
 * for, and this says so where it matters. The newest per person wins.
 */
export function authorRanksFrom(
  events: { kind: number; pubkey: string; created_at: number; tags: string[][] }[],
  taPubkey: string,
  pubkeys: readonly string[],
): Map<string, number> {
  const asked = new Set(pubkeys);
  const newest = new Map<string, { at: number; rank: number }>();
  for (const ev of events) {
    if (ev.kind !== 30382 || ev.pubkey !== taPubkey) continue;
    const d = ev.tags.find((t) => t[0] === "d")?.[1];
    const rank = Number(ev.tags.find((t) => t[0] === "rank")?.[1]);
    if (!d || !asked.has(d) || !Number.isFinite(rank)) continue;
    const cur = newest.get(d);
    if (!cur || ev.created_at > cur.at) newest.set(d, { at: ev.created_at, rank });
  }
  return new Map([...newest].map(([pk, v]) => [pk, v.rank]));
}

/** In the reader's web of trust: ranked, at or above the verified line. Unranked is not in it. */
export const inWebOfTrust = (ranks: Map<string, number>, pubkey: string): boolean =>
  (ranks.get(pubkey) ?? -1) >= VERIFIED_RANK;
