export type GraphEntry = { pubkey: string; influence: number } | string;

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
