/**
 * Who the reader's Assistants are: every profile they've tagged with one of
 * the Assistant tags (config/assistants), and the Assistant Brainstorm hosts
 * for them. Pure — hooks/useMyAssistants asks the relays and hands the events
 * here.
 *
 * Tapestry's rule (src/api/assistant/myAssistants.js, ADR my-assistants/0001),
 * read from relays here rather than from a server, so a tagging made on either
 * app counts on both:
 * - the reader's own kind-39999 taggings;
 * - which tag: the slug its `a` names, whoever authored the definition — else
 *   the slug in the publisher's `d` (`profile-tag-<slug>-<target8>-<signer8>`)
 *   when the signer segment is the reader's;
 * - the newest per (tag, profile) decides, a tie to the lower id (NIP-01);
 * - only an apply counts: `polarity` absent, unreadable or ≥ 0.5.
 * A tagging the reader deleted (NIP-09) never reaches here: the event store
 * drops it.
 */
import { ASSISTANT_TAGS, assistantTagKeyOf, type AssistantTagKey } from "@/config/assistants";

type Ev = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] };

const HEX64 = /^[0-9a-f]{64}$/i;
const TAG_ADDRESS = /^39999:[0-9a-f]{64}:(.+)$/i;
const PUBLISHER_D = /^profile-tag-(.+)-([0-9a-f]{8})-([0-9a-f]{8})$/;

export interface MyAssistantRow {
  pubkey: string;
  /** The Assistant Brainstorm hosts for the reader. */
  local: boolean;
  /** The Assistant tags the reader applies to it, in config order; none for an untagged local row. */
  tags: AssistantTagKey[];
}

const valueOf = (ev: Ev, name: string) => ev.tags.find((t) => t[0] === name)?.[1];

function slugOf(ev: Ev, viewer: string): string | null {
  const byAddress = valueOf(ev, "a")?.match(TAG_ADDRESS);
  if (byAddress) return byAddress[1];
  const byD = valueOf(ev, "d")?.match(PUBLISHER_D);
  return byD && byD[3] === viewer.slice(0, 8) ? byD[1] : null;
}

function applies(ev: Ev): boolean {
  const polarity = Number(valueOf(ev, "polarity"));
  return !Number.isFinite(polarity) || polarity >= 0.5;
}

/** NIP-01: newer wins; on a tie, the lower id. */
const beats = (a: Ev, b: Ev) => a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);

/** One row per profile, in no promised order; `local` added untagged when the reader hasn't tagged it. */
export function myAssistantRows({
  viewer,
  local,
  taggings,
}: {
  viewer: string;
  local: string | null;
  taggings: readonly Ev[];
}): MyAssistantRow[] {
  const newest = new Map<string, Ev>();
  for (const ev of taggings) {
    if (ev.kind !== 39999 || ev.pubkey !== viewer) continue;
    const key = assistantTagKeyOf(slugOf(ev, viewer));
    const target = valueOf(ev, "p");
    if (!key || !target || !HEX64.test(target)) continue;
    const pair = `${key}|${target.toLowerCase()}`;
    const held = newest.get(pair);
    if (!held || beats(ev, held)) newest.set(pair, ev);
  }
  const byTarget = new Map<string, Set<AssistantTagKey>>();
  for (const [pair, ev] of newest) {
    if (!applies(ev)) continue;
    const [key, target] = pair.split("|") as [AssistantTagKey, string];
    byTarget.set(target, (byTarget.get(target) ?? new Set()).add(key));
  }
  if (local && !byTarget.has(local)) byTarget.set(local, new Set());
  return [...byTarget].map(([pubkey, keys]) => ({
    pubkey,
    local: pubkey === local,
    tags: ASSISTANT_TAGS.filter((t) => keys.has(t.key)).map((t) => t.key),
  }));
}

/** As the tab lists them: the local row first, then by the name shown (case and accents aside), then pubkey. */
export function orderRows<T extends { pubkey: string; local: boolean }>(
  rows: readonly T[],
  nameOf: (pubkey: string) => string,
): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.local) - Number(a.local) ||
      nameOf(a.pubkey).localeCompare(nameOf(b.pubkey), undefined, { sensitivity: "base" }) ||
      (a.pubkey < b.pubkey ? -1 : a.pubkey > b.pubkey ? 1 : 0),
  );
}
