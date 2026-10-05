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
  const newest = new Map<string, { at: number; rank: number }>();
  for (let i = 0; i < unique.length; i += CHUNK) {
    const events = await fetchEventsByFilter(
      { kinds: [30382], authors: [ref.taPubkey], "#d": unique.slice(i, i + CHUNK) },
      [ref.relay],
      TIMEOUT_MS,
    ).catch(() => []);
    for (const ev of events as { created_at: number; tags: string[][] }[]) {
      const d = ev.tags.find((t) => t[0] === "d")?.[1];
      const rank = Number(ev.tags.find((t) => t[0] === "rank")?.[1]);
      if (!d || !Number.isFinite(rank)) continue;
      const cur = newest.get(d);
      if (!cur || ev.created_at > cur.at) newest.set(d, { at: ev.created_at, rank });
    }
  }
  return { ranks: new Map([...newest].map(([pk, v]) => [pk, v.rank])), source };
}

/** In the reader's web of trust: ranked, at or above the verified line. Unranked is not in it. */
export const inWebOfTrust = (ranks: Map<string, number>, pubkey: string): boolean =>
  (ranks.get(pubkey) ?? -1) >= VERIFIED_RANK;
