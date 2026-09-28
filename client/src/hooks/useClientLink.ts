/**
 * A component's view of a client link's resolution (services/clientLinks):
 * idle for no ref, loading while the lookup runs, done with the entity or
 * null after. A ref the session already settled is done on the first
 * render, so a re-mounted note never flashes a chip where a card was.
 */
import { useEffect, useState } from "react";
import type { ClientRef } from "@/lib/clientLinks";
import { clientLinkKey } from "@/lib/clientLinks";
import { peekClientLink, resolveClientLink, type ClientLinkEntity } from "@/services/clientLinks";

export type ClientLinkState = { status: "idle" | "loading" | "done"; entity: ClientLinkEntity | null };

const IDLE: ClientLinkState = { status: "idle", entity: null };

function initial(ref: ClientRef | null): ClientLinkState {
  if (!ref) return IDLE;
  const known = peekClientLink(ref);
  return known === undefined ? { status: "loading", entity: null } : { status: "done", entity: known };
}

export function useClientLink(ref: ClientRef | null): ClientLinkState {
  const key = ref ? clientLinkKey(ref) : null;
  // The answer is kept with the key it answers. When the ref changes, the render
  // that sees the new key must not show the old link's entity for a frame while
  // the effect catches up (the useNip05 pattern).
  const [held, setHeld] = useState<{ key: string | null; state: ClientLinkState }>(() => ({ key, state: initial(ref) }));
  useEffect(() => {
    const start = initial(ref);
    setHeld({ key, state: start });
    if (!ref || start.status === "done") return;
    let cancelled = false;
    void resolveClientLink(ref).then((entity) => {
      if (!cancelled) setHeld({ key, state: { status: "done", entity } });
    });
    return () => {
      cancelled = true;
    };
    // The ref is rebuilt per render; its key is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return held.key === key ? held.state : initial(ref);
}
