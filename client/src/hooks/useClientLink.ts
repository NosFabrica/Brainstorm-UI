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
  const [state, setState] = useState<ClientLinkState>(() => initial(ref));
  const key = ref ? clientLinkKey(ref) : null;
  useEffect(() => {
    const start = initial(ref);
    setState(start);
    if (!ref || start.status === "done") return;
    let cancelled = false;
    void resolveClientLink(ref).then((entity) => {
      if (!cancelled) setState({ status: "done", entity });
    });
    return () => {
      cancelled = true;
    };
    // The ref is rebuilt per render; its key is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
