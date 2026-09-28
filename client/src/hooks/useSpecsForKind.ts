/**
 * The specs that define a kind, for a page that has to say what an event
 * is. Plain state, not react-query, so a hero renders anywhere (the heroes'
 * tests mount them bare).
 */
import { useEffect, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchSpecsForKind } from "@/services/search";

export function useSpecsForKind(kind: number | null): NostrEvent[] {
  const [specs, setSpecs] = useState<NostrEvent[]>([]);
  useEffect(() => {
    setSpecs([]);
    if (kind === null) return;
    let alive = true;
    void fetchSpecsForKind(kind).then((found) => {
      if (alive) setSpecs(found);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind]);
  return specs;
}
