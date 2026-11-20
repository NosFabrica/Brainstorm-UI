import { useEffect, useMemo, useState } from "react";
import { isRunnerSiteFor, OBSERVER_D, OBSERVER_SITE_KIND } from "@/lib/frontPage/observerSite";
import { onAppResume } from "@/lib/appResume";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { askRunnerSite, readObserverSite, runnerSiteReached, siteViewOf, type SiteView } from "@/services/observerSite";

/** Shown again after this long away, the site is asked again: the runner may have printed meanwhile. */
const REASK_AWAY_MS = 60_000;

const NO_SITE: SiteView = { editions: [], servers: [], exists: false, settled: true };

/**
 * The runner's site, as far as it is known:
 * - `checking`: no copy held, and the first ask is still out.
 * - `failed`: the ask settled and none of the relays it asked answered. Nothing is known,
 *   and nothing is said of the papers; asked again when the page is shown after a while.
 * - `ready`: the site (or, once a relay answered, none: `exists` false).
 */
export type RunnerSiteState = { status: "checking" } | { status: "failed" } | { status: "ready"; view: SiteView };

const CHECKING: RunnerSiteState = { status: "checking" };
const FAILED: RunnerSiteState = { status: "failed" };
const NONE: RunnerSiteState = { status: "ready", view: NO_SITE };

/**
 * The Observer site of the runner the reader's own schedule names (NIP-FB, Runner: their
 * Brainstorm Assistant prints their paper as its own site, kind 35128 by it, `d` =
 * `observer`, `["p", reader]`), live from the store (docs/adr/0005): one ask per window
 * however often the page mounts, a site landing late shows when it lands, and the index
 * fills in each edition's headline once read. Only a manifest `isRunnerSiteFor` accepts
 * counts. Null without a runner (or a reader).
 */
export function useRunnerSite(runner: string | null, reader: string | null): RunnerSiteState | null {
  const on = runner && reader ? runner : null;
  const held = useStoreReplaceable(OBSERVER_SITE_KIND, on, () => askRunnerSite(runner!, reader!), {
    identifier: OBSERVER_D,
  });
  const event = on && held.event && isRunnerSiteFor(held.event, on, reader!) ? held.event : undefined;
  // Its files are on the reader's own servers, where the runner uploads them.
  const base = useMemo(() => (event && reader ? siteViewOf(event, reader) : null), [event, reader]);

  // The index read for one manifest, tagged with it so a newer one never shows an older read.
  const [read, setRead] = useState<{ id: string; view: SiteView } | null>(null);
  useEffect(() => {
    if (!event || !reader) return;
    const controller = new AbortController();
    const id = event.id;
    readObserverSite(event, reader, { signal: controller.signal })
      .then((view) => {
        if (!controller.signal.aborted) setRead({ id, view });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [event, reader]);

  // Asked again after a while away, past the store hook's window; a re-ask that reaches a
  // relay turns a failure into an answer.
  const [, setAsked] = useState(0);
  useEffect(() => {
    if (!runner || !reader) return;
    return onAppResume((away) => {
      if (away < REASK_AWAY_MS) return;
      void askRunnerSite(runner, reader)
        .catch(() => undefined)
        .then(() => setAsked((n) => n + 1));
    });
  }, [runner, reader]);

  const view = event ? (read && read.id === event.id ? read.view : base) : null;
  const reached = !!on && held.settled && runnerSiteReached(on, reader!);
  return useMemo<RunnerSiteState | null>(() => {
    if (!on) return null;
    if (view) return { status: "ready", view };
    if (!held.settled) return CHECKING;
    return reached ? NONE : FAILED;
  }, [on, view, held.settled, reached]);
}
