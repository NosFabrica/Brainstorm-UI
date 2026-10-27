import { useQuery } from "@tanstack/react-query";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import { loadDictionary } from "@/services/dictionary";

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
 */
export function useDictionary(
  enabled = true,
  { anonymous = false, managers }: { anonymous?: boolean; managers?: string[] | null } = {},
) {
  const { pubkey, taPubkey, settled } = useDictionaryReader();
  const concepts = useDictionaryConcepts();
  const query = useQuery({
    queryKey: ["dictionary", pubkey, taPubkey, concepts.shown, managers ?? []],
    // Headers and copies only: a concept's items load when its row or entry shows them (useConceptItems).
    queryFn: () =>
      loadDictionary({ pubkey, taPubkey }, concepts.shown, undefined, { items: false, managers: managers ?? [] }),
    enabled: enabled && (anonymous || !!pubkey) && settled && concepts.known && managers !== null,
    staleTime: 5 * 60_000,
  });
  return { ...query, pubkey, taPubkey };
}
