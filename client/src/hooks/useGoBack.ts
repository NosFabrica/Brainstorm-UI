import { useCallback } from "react";
import { useLocation } from "wouter";
import { historyDepth } from "@/lib/historyState";

/**
 * `goBack(fallback)` — a Back button that returns wherever the user actually
 * came from, and only falls back on a cold deep link, where going back would
 * leave the app entirely.
 */
export function useGoBack() {
  const [, navigate] = useLocation();
  return useCallback((fallback: string) => {
    if (historyDepth() > 0) window.history.back();
    else navigate(fallback);
  }, [navigate]);
}
