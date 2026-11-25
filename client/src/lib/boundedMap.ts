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

/** `capMap` for a Set: the oldest-added first. */
export function capSet<K>(set: Set<K>, max: number): void {
  if (set.size <= max) return;
  for (const key of set) {
    if (set.size <= max) break;
    set.delete(key);
  }
}

/**
 * A session memo held as two maps — the promise per key, and the answer once
 * it lands — kept to `max` answers, oldest answered first, out of both. A key
 * still waiting is never dropped: its promise may have a resolver queued
 * behind it, and a second promise for it would leave the first unresolved.
 */
export function capSettledMemo<K>(pending: Map<K, unknown>, settled: Map<K, unknown>, max: number): void {
  if (settled.size <= max && pending.size <= max) return;
  for (const key of settled.keys()) {
    if (settled.size <= max && pending.size <= max) break;
    settled.delete(key);
    pending.delete(key);
  }
}
