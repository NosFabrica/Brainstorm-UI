import { useState } from "react";

/** The open ticket, mirrored into `?ticket=` so a thread survives refresh and can be linked. */
export function useTicketParam(urlFor: (id: string | null) => string): [string | null, (id: string | null) => void] {
  const [id, setIdState] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get("ticket");
    } catch {
      return null;
    }
  });
  const setId = (next: string | null) => {
    setIdState(next);
    try {
      window.history.replaceState({}, "", urlFor(next));
    } catch {
      /* URL sync is a convenience, never a blocker */
    }
  };
  return [id, setId];
}
