import { nip19 } from "nostr-tools";
import { apiClient } from "@/services/api";
import type { ActivePov } from "@/hooks/useActivePov";

export type SearchPov = ActivePov;

export interface SearchResult {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  website?: string;
  lud16?: string;
  banner?: string;
  createdAt?: number;
  /** Effective rank for the currently-selected POV (back-compat). */
  wotRank?: number | null;
  wotFollowers?: number | null;
  /** NosFabrica ("house") perspective rank, 0..1, when the hit includes it. */
  wotRankNosfabrica?: number | null;
  /** Logged-in user's ("mywot") perspective rank, 0..1, when present. */
  wotRankMywot?: number | null;
}

export function meiliHitToSearchResult(hit: Record<string, unknown>): SearchResult | null {
  const pubkey = typeof hit.pubkey === "string" ? hit.pubkey : null;
  if (!pubkey) return null;

  let npub: string;
  if (typeof hit.npub === "string" && hit.npub) {
    npub = hit.npub as string;
  } else {
    try {
      npub = nip19.npubEncode(pubkey);
    } catch {
      return null;
    }
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const wot = (hit.wot && typeof hit.wot === "object") ? (hit.wot as Record<string, unknown>) : null;

  // Legacy Meili endpoint returns snake_case `wot_rank` / `wot_followers`
  // (overall, house POV) plus per-TA variants `wot_rank_<taPubkey8>` /
  // `wot_followers_<taPubkey8>` for the "user" (mywot) POV.
  // Per-TA POV variants use the first 8 hex chars of the trust-anchor pubkey
  // as the suffix (e.g. `wot_rank_78ed0837`). Match exactly to avoid colliding
  // with similarly-prefixed but unrelated keys.
  const TA_RANK_RE = /^wot_rank_[0-9a-f]{8}$/i;
  const TA_FOLLOWERS_RE = /^wot_followers_[0-9a-f]{8}$/i;

  // Capture each POV separately. `wot_rank` (no suffix) is the NosFabrica
  // ("house") perspective; the suffixed `wot_rank_<8-hex>` is the logged-in
  // user's perspective (mywot). We keep both so the Profile page can render
  // them side-by-side in the dual-meter widget.
  const wotRankNosfabrica: number | null =
    num(hit.wot_rank) ??
    num(hit.wotRank) ??
    num(hit.rank) ??
    (wot ? num(wot.rank) ?? num(wot.score) : null);
  let wotRankMywot: number | null = null;
  for (const key of Object.keys(hit)) {
    if (TA_RANK_RE.test(key)) {
      const v = num(hit[key]);
      if (v !== null) {
        wotRankMywot = v;
        break;
      }
    }
  }
  // Back-compat: pick a single primary rank (prefer NosFabrica, fall back to
  // mywot) so existing callers that only read `wotRank` still work.
  const wotRank: number | null = wotRankNosfabrica ?? wotRankMywot;
  let wotFollowers: number | null =
    num(hit.wot_followers) ??
    num(hit.wotFollowers) ??
    num(hit.followers) ??
    (wot ? num(wot.followers) : null);
  if (wotFollowers === null) {
    for (const key of Object.keys(hit)) {
      if (TA_FOLLOWERS_RE.test(key)) {
        const v = num(hit[key]);
        if (v !== null) {
          wotFollowers = v;
          break;
        }
      }
    }
  }

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  return {
    pubkey,
    npub,
    name: str(hit.name),
    displayName: str(hit.display_name) || str(hit.displayName),
    picture: str(hit.picture),
    about: str(hit.about),
    nip05: str(hit.nip05),
    website: str(hit.website),
    lud16: str(hit.lud16),
    banner: str(hit.banner),
    createdAt: typeof hit.created_at === "number" ? hit.created_at : undefined,
    wotRank,
    wotFollowers,
    wotRankNosfabrica,
    wotRankMywot,
  };
}

export function byTextResultToSearchResult(hit: Record<string, unknown>): SearchResult | null {
  const pubkey = typeof hit.pubkey === "string" ? hit.pubkey : null;
  if (!pubkey) return null;

  let npub: string;
  if (typeof hit.npub === "string" && hit.npub) {
    npub = hit.npub as string;
  } else {
    try {
      npub = nip19.npubEncode(pubkey);
    } catch {
      return null;
    }
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // The `/search/byText` endpoint exposes two possible rank sources:
  //   - NosFabrica ("house") perspective (ownPubkey=false): `_quality_score`
  //     (older builds: `quality_score`), 0..100.
  //   - The logged-in user's own perspective (ownPubkey=true): a dynamic
  //     per-trust-anchor key `rank_<taPubkey>` (e.g. `rank_be7bf5de...`), 0..100.
  // Capture both so the Profile page's dual-meter widget can render them, and
  // pick a single primary `wotRank` for the result card.
  const wotRankNosfabrica: number | null =
    num(hit._quality_score) ?? num(hit.quality_score);
  let wotRankMywot: number | null = null;
  for (const key of Object.keys(hit)) {
    if (/^rank_[0-9a-f]+$/i.test(key)) {
      const v = num(hit[key]);
      if (v !== null) {
        wotRankMywot = v;
        break;
      }
    }
  }
  // Prefer the user's own perspective when present, otherwise NosFabrica's.
  const wotRank: number | null = wotRankMywot ?? wotRankNosfabrica;

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  return {
    pubkey,
    npub,
    name: str(hit.name),
    displayName: str(hit.display_name) || str(hit.displayName),
    picture: str(hit.picture),
    about: str(hit.about),
    nip05: str(hit.nip05),
    website: str(hit.website),
    lud16: str(hit.lud16),
    banner: str(hit.banner),
    createdAt: typeof hit.created_at === "number" ? hit.created_at : undefined,
    wotRank,
    wotFollowers: null,
    wotRankNosfabrica,
    wotRankMywot,
  };
}

export async function searchByText(
  query: string,
  pov: SearchPov,
  _userPubkey?: string,
  maxHits?: number,
): Promise<{ results: SearchResult[]; total: number; timeMs: number }> {
  const start = performance.now();
  // Map the app-wide POV vocabulary onto the `/search/byText` `ownPubkey` flag:
  // "mywot" runs from the logged-in user's own (authenticated) perspective,
  // anything else runs from NosFabrica's perspective without authentication.
  const ownPubkey = pov === "mywot";
  const data = await apiClient.searchByText(query, true, ownPubkey, 15000, maxHits);
  const hits = data?.data?.results ?? [];
  const total = data?.data?.numResults ?? hits.length;
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const mapped = byTextResultToSearchResult(h);
    if (!mapped) continue;
    if (seen.has(mapped.pubkey)) continue;
    seen.add(mapped.pubkey);
    results.push(mapped);
  }
  return {
    results,
    total: total || results.length,
    timeMs: Math.round(performance.now() - start),
  };
}

export function getDisplayLabel(result: SearchResult): string {
  return result.displayName || result.name || result.npub.slice(0, 12) + "...";
}

export const isLikelyNpub = (value: string) =>
  /^npub1[02-9ac-hj-np-z]{20,}$/i.test(value.trim());

export const isHexPubkey = (value: string) =>
  /^[0-9a-f]{64}$/i.test(value.trim());

export const isNip05Handle = (value: string) => {
  const v = value.trim();
  if (v.includes("@")) {
    const parts = v.split("@");
    return parts.length === 2 && parts[0].length > 0 && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(parts[1]);
  }
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
};
