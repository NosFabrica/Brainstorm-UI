import { useEffect, useState } from "react";

/** Seconds until `at`, ticking once a second; null when there is no `at`. */
export function useCountdown(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [at]);
  if (at == null) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}
