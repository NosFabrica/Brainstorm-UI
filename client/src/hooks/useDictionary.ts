import { useEffect, useMemo } from "react";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { useDictionaryEntries } from "@/hooks/useDictionaryEntries";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import type { DictionaryEntry } from "@/services/dictionary";

/** The Dictionaries this device last read, by what was asked, so the next visit has one at once. */
const REMEMBERED = "dictionary-entries:v1";
/** How many asks it keeps: a reader, their Assistant and managers make few. */
const KEPT = 8;

let held: Record<string, DictionaryEntry[]> | undefined;

function remembered(): Record<string, DictionaryEntry[]> {
  if (held) return held;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REMEMBERED) || "null");
    held =
      value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, DictionaryEntry[]>) : {};
  } catch {
    held = {};
  }
  return held;
}

function remember(ask: string, entries: DictionaryEntry[]): void {
  const kept = Object.entries(remembered()).filter(([k]) => k !== ask);
  held = Object.fromEntries([...kept.slice(-(KEPT - 1)), [ask, entries]]);
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify(held));
  } catch {
    /* private window, full quota — remembering is a convenience */
  }
}

/** Test seam: forget the remembered Dictionaries, as a fresh device would. */
export function __forgetDictionaries(): void {
  held = undefined;
  try {
    localStorage.removeItem(REMEMBERED);
  } catch {
    /* nothing to forget */
  }
}

/**
 * The Active Account's Dictionary (services/dictionary), over the concepts
 * it shows (hooks/useDictionaryConcepts), from the EventStore while the
 * relays are asked (hooks/useDictionaryEntries, docs/adr/0005). Waits for
 * `/user/history` to say who their Assistant is — reading without it would
 * show "not in your Dictionary" for a concept their Assistant did add, then
 * flip. With no Session the history never comes, so it reads with the
 * account alone.
 *
 * `enabled: false` reads nothing — for a surface only some readers get.
 * `anonymous` reads the lists with no account too — search, which anyone uses,
 * signed in or not; a reader with no account sees Brainstorm's definitions
 * (ADR 0004). Without it, no account means nothing read: the Dictionary page
 * is an account's own.
 *
 * `managers` also reads these authors' copies (services/dictionary
 * `candidates`), for the Dictionary's "Managed by"; null waits until they're
 * known, so the page reads once rather than again as they arrive.
 *
 * The lists change rarely, so what this device last read for the same ask
 * stands in while it is read again: All's list tabs, which wait on the
 * Dictionary, don't wait on the relays for it (~2 s on a fresh visit).
 */
export function useDictionary(
  enabled = true,
  { anonymous = false, managers }: { anonymous?: boolean; managers?: string[] | null } = {},
) {
  const { pubkey, taPubkey, settled } = useDictionaryReader();
  const concepts = useDictionaryConcepts();
  const ask = JSON.stringify(["dictionary", pubkey, taPubkey, concepts.shown, managers ?? []]);
  const asking = enabled && (anonymous || !!pubkey) && settled && concepts.known && managers !== null;
  const reader = useMemo(() => ({ pubkey, taPubkey }), [pubkey, taPubkey]);
  // Headers and copies only: a concept's items load when its row or entry shows them (useConceptItems).
  const read = useDictionaryEntries(reader, concepts.shown, { enabled: asking, managers: managers ?? undefined });
  // A read that found nothing (every relay failed) is not the Dictionary: it isn't remembered.
  useEffect(() => {
    if (asking && read.settled && read.entries?.some((e) => e.resolved)) remember(ask, read.entries);
  }, [asking, ask, read.settled, read.entries]);
  const data = asking ? (read.settled ? read.entries : (remembered()[ask] ?? read.entries)) : undefined;
  return { data, isPending: data === undefined, isError: false, pubkey, taPubkey };
}
