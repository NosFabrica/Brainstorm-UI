import { useEffect, useState } from "react";

/**
 * The time, refreshed every `intervalMs` on its boundary (each whole minute for the
 * default), so what is computed from it is computed once per tick rather than per render.
 * Paused while the page is hidden, and read again the moment it is shown, so a page left
 * in a background tab overnight doesn't wake up holding yesterday.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      stop();
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        intervalMs - (Date.now() % intervalMs),
      );
    };
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const onVisibility = () => {
      if (hidden()) return stop();
      setNow(Date.now());
      schedule();
    };
    if (!hidden()) schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
  return now;
}
