import { useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useHasSession } from "@/hooks/useHasSession";
import { useSelfHistory } from "@/hooks/useSelf";
import { isFirstRunDone, needsFirstRun } from "@/lib/firstRun";

/** Where the gate never redirects from: the first run itself, and signing in. */
const STAY = ["/start", "/login"];

/**
 * The way into the first run (/start) for an account new to Brainstorm,
 * however it signed in — an extension, a key, or one made here: once its
 * session's /user/history answers that its scores were never calculated or
 * started (the same signal AutoScoreReturning trusts; `ta_pubkey` isn't one,
 * the server makes it at sign-in). It is sent once, keeping where it was
 * going as `next`. Anyone already using Brainstorm stays where they are
 * (lib/firstRun). Renders nothing; mount once at the app root.
 */
export function FirstRunGate() {
  const user = useActiveAccountDisplay();
  const pk = useHasSession() ? user?.pubkey : undefined;
  const history = useSelfHistory(pk);
  const [location, navigate] = useLocation();
  const search = useSearch();
  const decided = useRef(new Set<string>());

  useEffect(() => {
    if (!pk || decided.current.has(pk) || !history.isSuccess) return;
    if (STAY.some((p) => location === p || location.startsWith(`${p}/`))) return;
    decided.current.add(pk);
    const h = (
      history.data as
        | { data?: { last_time_calculated_graperank?: string | null; last_time_triggered_graperank?: string | null } }
        | undefined
    )?.data;
    const everCalculated = !!(h?.last_time_calculated_graperank || h?.last_time_triggered_graperank);
    if (!needsFirstRun({ done: isFirstRunDone(pk), everCalculated })) return;
    const here = search ? `${location}?${search}` : location;
    navigate(`/start?next=${encodeURIComponent(here)}`, { replace: true });
  }, [pk, history.isSuccess, history.data, location, search, navigate]);

  return null;
}
