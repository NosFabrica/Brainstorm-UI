import { useEffect, useMemo, useState } from "react";
import { OBSERVER_D, OBSERVER_SITE_KIND } from "@/lib/frontPage/observerSite";
import { onAppResume } from "@/lib/appResume";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import {
  askObserverSite,
  observerSiteReached,
  readObserverSite,
  siteViewOf,
  type SiteView,
} from "@/services/observerSite";

/** Shown again after this long away, the site is asked again: another device may have printed meanwhile. */
const REASK_AWAY_MS = 60_000;

const NO_SITE: SiteView = { editions: [], servers: [], exists: false };

/**
 * The reader's Observer site, live from the store (docs/adr/0005): the copy this device
 * kept draws the day tabs on the first render, a newer one replaces it as a relay sends
 * it, and the site's `editions.json` fills in each edition's headline and counts once it
 * is read (from this device when it has it). `null` while nothing is known: no copy
 * held, and no relay has answered yet — "no papers" is never said of a silence.
 */
export function useObserverSite(pubkey: string | null): SiteView | null {
  const held = useStoreReplaceable(OBSERVER_SITE_KIND, pubkey, () => askObserverSite(pubkey!), {
    identifier: OBSERVER_D,
  });
  const event = held.event && held.event.pubkey === pubkey ? held.event : undefined;
  const base = useMemo(() => (event && pubkey ? siteViewOf(event, pubkey) : null), [event, pubkey]);

  // The index read for one manifest, tagged with it so a newer one never shows an older read.
  const [read, setRead] = useState<{ id: string; view: SiteView } | null>(null);
  useEffect(() => {
    if (!event || !pubkey) return;
    const controller = new AbortController();
    const id = event.id;
    readObserverSite(event, pubkey, { signal: controller.signal })
      .then((view) => {
        if (!controller.signal.aborted) setRead({ id, view });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [event, pubkey]);

  // Asked again after a while away, past the store hook's window.
  useEffect(() => {
    if (!pubkey) return;
    return onAppResume((away) => {
      if (away >= REASK_AWAY_MS) void askObserverSite(pubkey).catch(() => undefined);
    });
  }, [pubkey]);

  if (event) return read && read.id === event.id ? read.view : base;
  return held.settled && pubkey && observerSiteReached(pubkey) ? NO_SITE : null;
}
