import { useCallback, useEffect, useRef, useState } from "react";
import { BOOST_DURATION_MS } from "./constants";

/**
 * For a minute after an admin triggers a run, the console polls every few
 * seconds (BOOST_INTERVAL_MS) to watch it move; `boost()` starts or restarts
 * that minute.
 */
export function useRefreshBoost() {
  const [isBoostActive, setIsBoostActive] = useState(false);
  const boostTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRefreshBoost = useCallback(() => {
    setIsBoostActive(true);
    if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current);
    boostTimeoutRef.current = setTimeout(() => setIsBoostActive(false), BOOST_DURATION_MS);
  }, []);
  useEffect(
    () => () => {
      if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current);
    },
    [],
  );
  return { isBoostActive, triggerRefreshBoost };
}
