import type { ActivePov } from "@/hooks/useActivePov";

export interface ProfileSeed {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  banner?: string;
  website?: string;
  lud16?: string;
  /**
   * @deprecated Prefer `wotRankNosfabrica` / `wotRankMywot`. Kept for
   * back-compat with older callers that only stored one value.
   */
  wotRank?: number | null;
  wotFollowers?: number | null;
  /** NosFabrica ("house") perspective rank from the search hit, 0..1. */
  wotRankNosfabrica?: number | null;
  /** Logged-in user's ("mywot") perspective rank from the search hit, 0..1. */
  wotRankMywot?: number | null;
  /**
   * Which perspective the user was viewing when they clicked the search hit.
   * Used by the Profile page to know whether it can safely show a dual-score
   * widget (it can iff at least one POV-specific rank is present).
   */
  povFromSearch?: ActivePov;
}

const seeds = new Map<string, ProfileSeed>();

function normalize(hexPubkey: string): string {
  return hexPubkey.toLowerCase();
}

export function setProfileSeed(hexPubkey: string, seed: ProfileSeed): void {
  if (!hexPubkey) return;
  seeds.set(normalize(hexPubkey), seed);
}

export function getProfileSeed(hexPubkey: string): ProfileSeed | null {
  if (!hexPubkey) return null;
  return seeds.get(normalize(hexPubkey)) ?? null;
}

export function clearProfileSeed(hexPubkey: string): void {
  if (!hexPubkey) return;
  seeds.delete(normalize(hexPubkey));
}

const STORAGE_KEY_PREFIX = "brainstorm_search_seed:";

function storageKey(hexPubkey: string): string {
  return `${STORAGE_KEY_PREFIX}${normalize(hexPubkey)}`;
}

export function setStoredSearchSeed(hexPubkey: string, seed: ProfileSeed): void {
  if (!hexPubkey) return;
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(storageKey(hexPubkey), JSON.stringify(seed));
  } catch {
    // sessionStorage may be unavailable (quota, privacy mode) — degrade silently.
  }
}

export function consumeStoredSearchSeed(hexPubkey: string): ProfileSeed | null {
  if (!hexPubkey) return null;
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  const key = storageKey(hexPubkey);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as ProfileSeed;
    if (!parsed || typeof parsed !== "object" || !parsed.pubkey) return null;
    // Defensive: only accept the stored seed if its pubkey matches the request,
    // so a stale/corrupted entry can never be hydrated under the wrong identity.
    if (normalize(parsed.pubkey) !== normalize(hexPubkey)) return null;
    return parsed;
  } catch {
    try { window.sessionStorage.removeItem(key); } catch {}
    return null;
  }
}

export function clearStoredSearchSeed(hexPubkey: string): void {
  if (!hexPubkey) return;
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(storageKey(hexPubkey));
  } catch {}
}
