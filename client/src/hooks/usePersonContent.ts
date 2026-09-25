import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPersonContent, peekPersonContent } from "@/services/personContent";
import type { PersonContent } from "@/lib/personContent";

/**
 * Chips for a handful of people — the rows of a typeahead, the cards of a
 * People page — filling in as each answer lands. The service asks each
 * person once for the session; this only re-renders when an answer arrives.
 * Plain state, no query client: the search boxes render without one.
 */
export function usePersonContent(pubkeys: readonly string[]): Map<string, PersonContent | undefined> {
  const key = pubkeys.join(",");
  const [version, setVersion] = useState(0);
  // Who this component has already asked about — a re-render with the same
  // people in a new order asks nobody twice, even while an answer is out.
  const askedRef = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    const wanted = [...new Set(pubkeys.filter(Boolean))].filter((pk) => peekPersonContent(pk) === undefined && !askedRef.current.has(pk));
    for (const pk of wanted) {
      askedRef.current.add(pk);
      fetchPersonContent(pk).then(
        () => {
          if (alive) setVersion((v) => v + 1);
        },
        () => {
          // Forgotten, so a later mount may try again.
          askedRef.current.delete(pk);
        },
      );
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Map(pubkeys.map((pk) => [pk, peekPersonContent(pk)])), [key, version]);
}
