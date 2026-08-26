import type { QueryClient } from "@tanstack/react-query";
import { refreshSubscription, type Subscription } from "@/services/subscription";

/**
 * The in-flight checkout poll (handoff A4), as a module-level singleton so it
 * survives the dialog closing — Lightning `pending` can take ~10 minutes, and
 * the person who closed the "waiting" dialog still deserves the flip.
 *
 * Cadence: every 2s for the first minute (people return within seconds of
 * paying), then 10s — the refresh endpoint is rate-limited, and a flat 2s for
 * ten minutes is a hammer. Stops when the tier leaves "free", when the status
 * settles somewhere terminal, or at the 10-minute cap.
 *
 * Each tick writes the fresh subscription straight into the query cache, so
 * every consumer of useSubscription flips together without a refetch.
 */
let running = false;
let stopFlag = false;

export function stopCheckoutPoll(): void {
  stopFlag = true;
}

export function startCheckoutPoll(
  qc: QueryClient,
  opts?: { checkoutWindow?: Window | null },
): void {
  if (running) return; // one poll, however many surfaces ask
  running = true;
  stopFlag = false;

  const startedAt = Date.now();
  const CAP_MS = 10 * 60_000;
  const FAST_MS = 2_000;
  const SLOW_MS = 10_000;
  const w = opts?.checkoutWindow ?? null;
  let closedKick = false;

  const done = (sub: Subscription | null) =>
    stopFlag ||
    Date.now() - startedAt > CAP_MS ||
    (sub !== null && (sub.tier !== "free" || sub.status === "canceled"));

  const tick = async (): Promise<void> => {
    let sub: Subscription | null = null;
    try {
      sub = await refreshSubscription();
      qc.setQueryData(["/user/subscription"], sub);
    } catch {
      /* transient — keep polling */
    }
    if (done(sub)) {
      running = false;
      return;
    }
    // The checkout tab closing is a free, slightly-earlier signal than focus:
    // cross-origin hides everything except `.closed`.
    if (w && w.closed && !closedKick) {
      closedKick = true;
      setTimeout(() => void tick(), 300);
      return;
    }
    const elapsed = Date.now() - startedAt;
    setTimeout(() => void tick(), elapsed < 60_000 ? FAST_MS : SLOW_MS);
  };

  void tick();
}
