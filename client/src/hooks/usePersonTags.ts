import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePerspective } from "@/hooks/useActivePerspective";
import { fetchPersonTagsBatch, peekPersonTags } from "@/services/personTags";
import type { ProfileTag } from "@/services/tags";

/**
 * The tags on a handful of people — the rows of a typeahead, the cards of a
 * People page — filling in as each answer lands. The service asks each
 * person once for the session; this only re-renders when an answer arrives.
 * Plain state, no query client: the search boxes render without one.
 *
 * The observer follows the surface's perspective the way every tag query
 * does: the viewer's own only when they chose it and are signed in.
 */
export function usePersonTags(
  pubkeys: readonly string[],
  { pov, viewerPubkey }: { pov: ActivePerspective; viewerPubkey?: string },
): Map<string, ProfileTag[] | undefined> {
  const observer = pov === "mywot" && viewerPubkey ? viewerPubkey : "house";
  const key = `${observer}|${pubkeys.join(",")}`;
  const [version, setVersion] = useState(0);
  const askedRef = useRef(new Set<string>());
  // What the last render handed out, so an answer that landed between that
  // render and this effect — another surface asked first — still re-renders.
  const handedOut = useRef(new Map<string, ProfileTag[] | undefined>());
  // Answers are wanted for as long as this component lives — not just until
  // the row set changes again. A subscription tied to one effect run went
  // dead when the rows grew, and the re-run skipped those people as asked.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const unique = [...new Set(pubkeys.filter(Boolean))];
    if (unique.some((pk) => handedOut.current.get(pk) === undefined && peekPersonTags(pk, observer) !== undefined)) {
      setVersion((v) => v + 1);
    }
    const wanted = unique.filter(
      (pk) => peekPersonTags(pk, observer) === undefined && !askedRef.current.has(`${observer}|${pk}`),
    );
    for (const pk of wanted) askedRef.current.add(`${observer}|${pk}`);
    for (const [pk, promise] of fetchPersonTagsBatch(wanted, observer)) {
      promise.then(
        () => {
          if (mounted.current) setVersion((v) => v + 1);
        },
        () => {
          askedRef.current.delete(`${observer}|${pk}`);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const out = useMemo(
    () => new Map(pubkeys.map((pk) => [pk, peekPersonTags(pk, observer)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, version],
  );
  handedOut.current = out;
  return out;
}
