export type GraphEntry = { pubkey: string; influence: number; trusted_reporters?: number } | string;

export function toPubkeys(arr: GraphEntry[] | undefined | null): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => typeof item === "string" ? item : item.pubkey);
}

export function toInfluenceMap(arr: GraphEntry[] | undefined | null): Map<string, number | null> {
  const map = new Map<string, number | null>();
  if (!Array.isArray(arr)) return map;
  for (const item of arr) {
    if (typeof item === "string") {
      map.set(item, null);
    } else {
      map.set(item.pubkey, typeof item.influence === "number" ? item.influence : null);
    }
  }
  return map;
}

export function getFlaggedPubkeys(networkData: Record<string, any>, threshold: number): Set<string> {
  const flagged = new Set<string>();
  const arrayKeys = ["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"];
  for (const key of arrayKeys) {
    const arr = networkData[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string") continue;
      if (
        typeof item.influence === "number" &&
        item.influence < threshold &&
        typeof item.trusted_reporters === "number" &&
        item.trusted_reporters >= 2
      ) {
        flagged.add(item.pubkey);
      }
    }
  }
  return flagged;
}
