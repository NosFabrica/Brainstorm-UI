import { extractErrorMessage, getFailureStage, isItemFailed, normalizeErrorKey } from "../failures";
import { parseActivityTs } from "../metrics";
import type { BrainstormRequestInstance } from "../types";

const at = (iso: string) => new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();

export type FailureGroup = { count: number; latest: BrainstormRequestInstance; pubkeys: Set<string> };

/**
 * The failed requests of the last `windowMs`, grouped by error and stage: the
 * eight most recent patterns (newest latest request first, then the most
 * frequent), and how many failed in all.
 */
export function recentFailureGroups(
  items: readonly BrainstormRequestInstance[],
  windowMs: number,
  now: number,
): { groups: FailureGroup[]; totalFailures: number } {
  const failedItems = items.filter((item) => {
    if (!isItemFailed(item)) return false;
    const t = parseActivityTs(item.updated_at);
    if (!t) return false;
    const age = now - t;
    return age >= 0 && age < windowMs;
  });
  const groups = new Map<string, FailureGroup>();
  for (const item of failedItems) {
    const key = normalizeErrorKey(extractErrorMessage(item)) + "|" + (getFailureStage(item) ?? "");
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (item.pubkey) existing.pubkeys.add(item.pubkey);
      if (at(item.updated_at) > at(existing.latest.updated_at)) existing.latest = item;
    } else {
      groups.set(key, { count: 1, latest: item, pubkeys: new Set(item.pubkey ? [item.pubkey] : []) });
    }
  }
  const sorted = Array.from(groups.values())
    .sort((a, b) => {
      const aT = at(a.latest.updated_at);
      const bT = at(b.latest.updated_at);
      if (bT !== aT) return bT - aT;
      return b.count - a.count;
    })
    .slice(0, 8);
  return { groups: sorted, totalFailures: failedItems.length };
}
