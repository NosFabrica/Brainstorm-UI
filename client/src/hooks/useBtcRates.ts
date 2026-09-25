import { useEffect, useState } from "react";
import { fetchBtcRates, type BtcRates } from "@/lib/exchangeRate";

/**
 * The one Bitcoin price a page needs to compare its listings and write a
 * second price line on each. Asked only when enabled (the Shop tab, a
 * listing's page); `lib/exchangeRate` remembers the answer for ten minutes
 * across every caller. An outage is null — the cards say nothing extra.
 */
export function useBtcRates(enabled = true): BtcRates | null {
  const [rates, setRates] = useState<BtcRates | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchBtcRates().then((r) => {
      if (alive) setRates(r);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? rates : null;
}
