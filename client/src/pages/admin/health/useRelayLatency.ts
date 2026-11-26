import { useCallback, useEffect, useState } from "react";
import { PROFILE_RELAYS } from "@/lib/relays";
import { PRIMARY_RELAY } from "../constants";
import type { RelayLatency } from "../types";

/**
 * WebSocket latency to each relay the console uses. The first visit to the
 * Health tab (`onHealthTab`) probes them; the answers stay for the session,
 * and Re-check probes again.
 */
export function useRelayLatency(onHealthTab: boolean) {
  const [relayLatencies, setRelayLatencies] = useState<RelayLatency[]>([]);
  const [relayCheckRunning, setRelayCheckRunning] = useState(false);

  const probeRelayLatency = useCallback(async (url: string): Promise<RelayLatency> => {
    const start = performance.now();
    return new Promise<RelayLatency>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ url, latencyMs: null, status: "disconnected", checkedAt: new Date() });
      }, 5000);
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          const latency = Math.round(performance.now() - start);
          clearTimeout(timeout);
          ws.close();
          resolve({
            url,
            latencyMs: latency,
            status: latency < 2000 ? "connected" : "degraded",
            checkedAt: new Date(),
          });
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          resolve({ url, latencyMs: null, status: "disconnected", checkedAt: new Date() });
        };
      } catch {
        clearTimeout(timeout);
        resolve({ url, latencyMs: null, status: "disconnected", checkedAt: new Date() });
      }
    });
  }, []);

  const runRelayCheck = useCallback(async () => {
    if (relayCheckRunning) return;
    setRelayCheckRunning(true);
    const relays = [PRIMARY_RELAY, ...PROFILE_RELAYS];
    const results = await Promise.all(relays.map((r) => probeRelayLatency(r)));
    setRelayLatencies(results);
    setRelayCheckRunning(false);
  }, [relayCheckRunning, probeRelayLatency]);

  useEffect(() => {
    if (onHealthTab && relayLatencies.length === 0) {
      void runRelayCheck();
    }
  }, [onHealthTab, relayLatencies.length, runRelayCheck]);

  return { relayLatencies, relayCheckRunning, runRelayCheck };
}

export type RelayLatencyState = ReturnType<typeof useRelayLatency>;
