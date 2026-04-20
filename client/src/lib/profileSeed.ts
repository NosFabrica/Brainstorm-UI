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
  wotRank?: number | null;
  wotFollowers?: number | null;
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
