/**
 * Keep a memo map to `max` entries, forgetting the oldest first (a Map
 * iterates in insertion order). For session memos that would otherwise grow
 * with every person, event or address a long-open tab ever showed; forgetting
 * one costs, at worst, asking it again.
 */
export function capMap<K, V>(map: Map<K, V>, max: number): void {
  if (map.size <= max) return;
  for (const key of map.keys()) {
    if (map.size <= max) break;
    map.delete(key);
  }
}

/** Drop every entry whose deadline (the value `until` reads) has passed, then cap. */
export function sweepMap<K, V>(map: Map<K, V>, until: (value: V) => number, max: number, now = Date.now()): void {
  for (const [key, value] of map) if (until(value) <= now) map.delete(key);
  capMap(map, max);
}
