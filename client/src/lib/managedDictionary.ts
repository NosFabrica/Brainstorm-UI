/**
 * Settings › Dictionary's "Managed by", as data: whose Dictionary the page
 * shows — the reader's own, one of their Assistants', or all their
 * Assistants' together — which one it shows unless the URL names another, and
 * each entry resolved for that choice. Pure.
 *
 * After Tapestry's Dictionary page (ui/src/pages/dictionaries/managedDictionary.js),
 * with two changes: the reader is a choice of their own ("You"), and the
 * default is the Assistant their Treasure Map gives Concept headers to — its
 * `39998` slot, which `39998:dlist-header` fills too (lib/treasureMapCards),
 * else a bare `*` — before the Assistant Brainstorm hosts for them.
 *
 * Whose copies count is the choice alone: an Assistant's Dictionary is the
 * concepts it holds a copy of, governed by that copy. The reader's own copies
 * don't join it, and every other concept is the community's (or Brainstorm's),
 * as for anyone. "All" is the reader's Assistants only, as Tapestry's is.
 */
import { nip19 } from "nostr-tools";
import { resolveConcept } from "@/lib/conceptResolution";
import { categoryEntries } from "@/lib/treasureMapCards";
import type { DictionaryEntry } from "@/services/dictionary";

export const ME = "me";
export const ALL = "all";
export const MANAGED_BY_PARAM = "managedBy";

const HEX64 = /^[0-9a-f]{64}$/;

export interface ManagerOption {
  /** ME for the reader, else the Assistant's pubkey. */
  key: string;
  pubkey: string;
  self: boolean;
  /** The Assistant Brainstorm hosts for the reader. */
  local: boolean;
  /** Whom the Treasure Map gives Concept headers to. */
  designated: boolean;
}

/** Who the Map gives Concept headers to: the Preferred of its `39998` slot, else of a bare `*`; null when neither. */
export function designatedManager(map: { tags?: unknown } | null | undefined): string | null {
  const concepts = categoryEntries(map).concepts;
  const slot = concepts.find((e) => e.norm === "39998") ?? concepts.find((e) => e.norm === "*");
  return slot?.tags[0]?.pubkey ?? null;
}

/**
 * The choices, in the picker's order: the reader, then their Assistants as
 * given (Assistants & Duties' order: the local one first, then by name), then
 * the Map's Concepts Assistant when they haven't tagged it. "All" isn't one of
 * them: it's offered beside them when there are two Assistants or more.
 */
export function managerOptions({
  me,
  assistants,
  local,
  designated,
}: {
  me: string;
  assistants: readonly string[];
  local: string | null;
  designated: string | null;
}): ManagerOption[] {
  const others = [...new Set([...assistants, ...(designated ? [designated] : [])])].filter((pk) => pk !== me);
  return [
    { key: ME, pubkey: me, self: true, local: false, designated: designated === me },
    ...others.map((pubkey) => ({
      key: pubkey,
      pubkey,
      self: false,
      local: pubkey === local,
      designated: pubkey === designated,
    })),
  ];
}

export const assistantOptions = (options: readonly ManagerOption[]) => options.filter((o) => !o.self);

export const offersAll = (options: readonly ManagerOption[]) => assistantOptions(options).length > 1;

/** Whose Dictionary shows unless the URL says: the Map's Concepts Assistant, else the local one, else the reader's. */
export function defaultChoice(options: readonly ManagerOption[]): string {
  return (options.find((o) => o.designated) ?? options.find((o) => o.local))?.key ?? ME;
}

function pubkeyOf(value: string): string | null {
  if (HEX64.test(value.toLowerCase())) return value.toLowerCase();
  try {
    const decoded = nip19.decode(value);
    return decoded.type === "npub" ? decoded.data : null;
  } catch {
    return null;
  }
}

/**
 * The choice the URL names, against the options. `unknown` when it named
 * someone who isn't one of them, or "all" with fewer than two Assistants: the
 * default shows instead, and the page says so.
 */
export function parseManagedBy(
  value: string | null | undefined,
  options: readonly ManagerOption[],
): { choice: string; unknown: boolean } {
  const fallback = { choice: defaultChoice(options), unknown: false };
  const v = value?.trim();
  if (!v) return fallback;
  if (v === ME) return { choice: ME, unknown: false };
  if (v === ALL) return offersAll(options) ? { choice: ALL, unknown: false } : { ...fallback, unknown: true };
  const pubkey = pubkeyOf(v);
  const hit = pubkey ? options.find((o) => o.pubkey === pubkey) : undefined;
  return hit ? { choice: hit.key, unknown: false } : { ...fallback, unknown: true };
}

/** The URL's value for a choice: "me", "all", or the Assistant's npub. */
export function managedByParam(choice: string): string {
  return choice === ME || choice === ALL ? choice : nip19.npubEncode(choice);
}

export interface ManagedEntry extends DictionaryEntry {
  /** Whose copy governs, when one in this Dictionary does: the reader's pubkey or an Assistant's. */
  holder: string | null;
  /** For "All": how many of the reader's Assistants hold a copy, of how many. */
  support: { count: number; of: number } | null;
}

/**
 * Every entry as the choice sees it: in the Dictionary when the chosen
 * manager holds a copy — for "All", the first Assistant in the picker's order
 * that does — and that copy governs. An entry read without its candidates
 * stays as it was resolved.
 */
export function managedEntries(
  entries: readonly DictionaryEntry[],
  choice: string,
  options: readonly ManagerOption[],
): ManagedEntry[] {
  const me = options.find((o) => o.self)?.pubkey ?? null;
  const holders =
    choice === ME ? (me ? [me] : []) : choice === ALL ? assistantOptions(options).map((o) => o.pubkey) : [choice];
  return entries.map((entry) => {
    const c = entry.candidates;
    if (!c) return { ...entry, holder: null, support: null };
    const holding = holders.filter((pk) => c.copies[pk]);
    const copy = holding.length ? c.copies[holding[0]] : null;
    const resolved = resolveConcept({
      community: c.community,
      communityCoordinate: entry.communityCoordinate,
      personal: choice === ME ? copy : null,
      assistant: choice === ME ? null : copy,
      house: c.house,
    });
    const inDictionary = resolved?.source === "personal" || resolved?.source === "assistant";
    return {
      ...entry,
      resolved,
      inDictionary,
      holder: inDictionary ? holding[0] : null,
      support: choice === ALL ? { count: holding.length, of: holders.length } : null,
    };
  });
}
