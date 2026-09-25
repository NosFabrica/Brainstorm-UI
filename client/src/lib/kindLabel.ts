/**
 * What an event is called — one registry, for every card, row, tile and page.
 *
 * Four copies used to disagree (1618 was "Issue" in one and "PR" in another)
 * and every surface said the kind its own way. The team (2026-09-24): a spec
 * from Nostr Hub has no NIP number, so the kind's word is what tells a reader
 * what they are looking at. Never "Post" for a kind we don't know — a typed
 * `kind:` finds structural events, and the number is the honest name.
 */
import { sourceAppFor } from "@/lib/sourceApp";

/** The structural minimum every caller has — a hit, a share card, a page's event. */
export type KindEvent = { kind: number; tags: string[][]; pubkey: string; id: string; content: string; created_at: number };

export function kindTypeLabel(kind: number): string {
  switch (kind) {
    case 0: return "Person";
    case 31337: return "Track";
    case 30402: return "Listing";
    case 1: case 11: return "Note";
    case 1111: return "Comment";
    case 30023: case 30024: case 30040: case 30041: return "Article";
    case 30818: return "Wiki";
    case 30817: return "Spec";
    case 20: return "Photo";
    case 21: case 22: case 34235: case 34236: return "Video";
    case 1063: return "File";
    case 1222: return "Audio";
    // "Stream", not "Live": a pill saying Live beside a tile's Replay or
    // Upcoming status would contradict itself.
    case 30311: return "Stream";
    case 30312: case 30313: return "Space";
    case 31922: case 31923: case 31924: return "Event";
    case 30617: return "Repo";
    case 32267: return "App";
    case 30063: return "Release";
    // NIP-34: a patch, a pull request, an issue.
    case 1617: return "Patch";
    case 1618: return "Pull request";
    case 1621: return "Issue";
    case 1337: return "Code";
    case 30000: return "Follow set";
    case 10003: case 10015: case 30001: case 30003: case 30015: case 30267: case 39701: return "List";
    case 10040: return "Trust designation";
    // The common NIP kinds a typed `kind:` finds, in words. The number
    // stays beside them where kinds are the subject (Everything's section).
    case 3: return "Follow list";
    case 4: return "Encrypted DM";
    case 5: return "Deletion";
    case 6: case 16: return "Repost";
    case 7: return "Reaction";
    case 8: return "Badge award";
    case 14: return "Direct message";
    case 1059: return "Gift wrap";
    case 1984: return "Report";
    case 1985: return "Label";
    case 9734: return "Zap request";
    case 9735: return "Zap receipt";
    case 10000: return "Mute list";
    case 10002: return "Relay list";
    case 10050: return "DM relays";
    case 13194: return "Wallet info";
    case 30008: return "Profile badges";
    case 30009: return "Badge";
    case 30078: return "App data";
    case 30315: return "Status";
    case 31990: return "App handler";
    default: return `Kind ${kind}`;
  }
}

/**
 * What this event calls itself, when the app that published it has a better
 * word than the kind's: a kind-30023 on zap.cooking is a "Recipe".
 */
export function kindLabel(event: KindEvent): string {
  return sourceAppFor(event)?.noun ?? kindTypeLabel(event.kind);
}

/** The kinds a spec covers — its numeric `k` tags, de-duped, in order, each with the name its author gave. */
export function specKindTags(event: { tags: string[][] }): { kind: string; label?: string }[] {
  const byKind = new Map<string, string | undefined>();
  for (const t of event.tags) {
    if (t[0] !== "k" || !/^\d+$/.test(t[1] ?? "")) continue;
    if (!byKind.has(t[1]) || (!byKind.get(t[1]) && t[2])) byKind.set(t[1], t[2] || undefined);
  }
  return [...byKind.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([kind, label]) => (label ? { kind, label } : { kind }));
}
