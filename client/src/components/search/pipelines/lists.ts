/** The Lists tab: the lists that earn their place, people-packs first, same-title packs folded into one row. */
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { describeThing } from "@/lib/thing";
import { groupPeoplePacks } from "@/lib/listGroups";
import type { DisplayRow } from "./types";

/**
 * Lists must earn their place: untitled or empty ones are app
 * machine-state, not content (Benjamin's "forced and off" browse).
 * People-packs — the lists a searcher actually wants — lead.
 */
export function listRows(hits: SearchHit[]): SearchHit[] {
  const titled = (e: NostrEvent) => !!e.tags.find((t) => (t[0] === "title" || t[0] === "name") && t[1]?.trim());
  const itemCount = (e: NostrEvent) => e.tags.filter((t) => ["p", "e", "a", "r"].includes(t[0])).length;
  const isPeoplePack = (e: NostrEvent) =>
    e.tags.some((t) => t[0] === "p") && !e.tags.some((t) => ["e", "a", "r"].includes(t[0]));
  // Badges and emoji packs hold no p/e/a/r items; they stay when lib/thing can name them.
  const namedThing = (e: NostrEvent) => (e.kind === 30009 || e.kind === 30030) && describeThing(e) !== null;
  const shown = hits.filter((h) => namedThing(h.event) || (titled(h.event) && itemCount(h.event) > 0));
  return [...shown.filter((h) => isPeoplePack(h.event)), ...shown.filter((h) => !isPeoplePack(h.event))];
}

/**
 * One row per title: same-tag follow packs fold behind the most trusted
 * curator's, the union counted once. The row promises a group, so the
 * card itself opens the group in place — every list with its own count
 * and door, everyone across them — rather than one list of five
 * (Benjamin, 2026-09-09). No chip, no extra rows.
 */
export function listGroupRows(
  shown: SearchHit[],
  scoreOf: (pubkey: string) => number | null | undefined,
): DisplayRow[] {
  const folded: DisplayRow[] = [];
  for (const g of groupPeoplePacks(shown, (h) => ({
    event: h.event,
    score: h.author?.wotRank ?? scoreOf(h.event.pubkey) ?? null,
  }))) {
    folded.push({
      hit: g.primary,
      collapsedCount: 0,
      clusterId: "",
      listGroup:
        g.lists > 1
          ? {
              lists: g.lists,
              members: g.members,
              consensus: g.consensus,
              agreement: g.agreement,
              items: [g.primary, ...g.others].map((h) => ({
                event: h.event,
                author: h.author,
                score: h.author?.wotRank ?? scoreOf(h.event.pubkey) ?? null,
              })),
            }
          : undefined,
    });
  }
  return folded;
}
