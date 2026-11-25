import { useQuery } from "@tanstack/react-query";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import { loadDictionary, type DictionaryEntry } from "@/services/dictionary";

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
 * it shows (hooks/useDictionaryConcepts). Waits for
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
  const queryKey = ["dictionary", pubkey, taPubkey, concepts.shown, managers ?? []];
  const ask = JSON.stringify(queryKey);
  const asking = enabled && (anonymous || !!pubkey) && settled && concepts.known && managers !== null;
  const query = useQuery({
    queryKey,
    // Headers and copies only: a concept's items load when its row or entry shows them (useConceptItems).
    queryFn: async ({ queryKey: asked }) => {
      // eslint-disable-next-line no-restricted-syntax -- deferred (docs/adr/0005): the Dictionary is an aggregate resolved through concept batches, with a device placeholder; not yet on the store
      const entries = await loadDictionary({ pubkey, taPubkey }, concepts.shown, undefined, {
        items: false,
        managers: managers ?? [],
      });
      if (entries.length) remember(JSON.stringify(asked), entries);
      return entries;
    },
    placeholderData: asking ? remembered()[ask] : undefined,
    enabled: asking,
    staleTime: 5 * 60_000,
  });
  return { ...query, pubkey, taPubkey };
}
