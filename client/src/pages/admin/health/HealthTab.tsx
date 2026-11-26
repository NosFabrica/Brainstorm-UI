import type { RelayLatencyState } from "./useRelayLatency";
import { Button } from "@/components/ui/button";
import { PROFILE_RELAYS } from "@/lib/relays";
import { CheckCircle2, XCircle, Wifi, WifiOff, RefreshCw, Loader2, CircleHelp } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { PRIMARY_RELAY } from "../constants";

type EndpointStatus = { isSuccess: boolean; isLoading: boolean; isError: boolean };
/** The queries whose state the API Health card reports. */
export type HealthEndpoints = { grapeRank: EndpointStatus; users: EndpointStatus; activity: EndpointStatus };

type EndpointHealth = "healthy" | "error" | "checking" | "unknown";

/**
 * What a row says about its endpoint. Healthy only once a fetch has succeeded:
 * a query that hasn't run (the Activity log only runs on its tab) is not known
 * to be up, nor down.
 */
function endpointHealth({ isSuccess, isLoading, isError }: EndpointStatus): EndpointHealth {
  if (isLoading) return "checking";
  if (isError) return "error";
  if (isSuccess) return "healthy";
  return "unknown";
}

const HEALTH_LABEL: Record<EndpointHealth, string> = {
  healthy: "Healthy",
  error: "Error",
  checking: "Checking",
  unknown: "Unknown",
};
const HEALTH_CHIP: Record<EndpointHealth, string> = {
  healthy:
    "border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400",
  error: "border border-red-200 bg-red-50 text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400",
  checking:
    "border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
  unknown:
    "border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
};

/** The System Health tab: the admin endpoints' state and each relay's latency. */
export function HealthTab({ endpoints, relays }: { endpoints: HealthEndpoints; relays: RelayLatencyState }) {
  const { relayLatencies, relayCheckRunning, runRelayCheck } = relays;
  const configuredRelays = [PRIMARY_RELAY, ...PROFILE_RELAYS];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="panel-health">
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2"
        data-testid="card-api-health"
      >
        <div className="border-b border-brand-accent/10 px-5 py-4">
          <h3
            className="text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            API Health
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Live endpoint status from active queries</p>
        </div>
        <div className="space-y-3 p-5">
          {[
            // TODO: replace with a meaningful health probe (dedicated endpoint?)
            // { name: "/user/self", ok: selfQuery.isSuccess, loading: selfQuery.isLoading, error: selfQuery.isError, description: "User profile & social graph" },
            {
              name: "/user/graperankResult",
              health: endpointHealth(endpoints.grapeRank),
              description: "GrapeRank calculation result",
            },
            {
              name: "/admin/users",
              health: endpointHealth(endpoints.users),
              description: "Platform user database",
            },
            {
              name: "/admin/activity",
              health: endpointHealth(endpoints.activity),
              description: "Platform calculation activity",
            },
          ].map((ep) => (
            <div
              key={ep.name}
              className="flex flex-col justify-between gap-1 rounded-xl border border-slate-100 bg-white/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:gap-2"
              data-testid={`health-ep-${ep.name.replace(/[/*]/g, "-")}`}
            >
              <div className="flex items-center gap-3">
                {ep.health === "checking" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400 dark:text-slate-500" />
                ) : ep.health === "healthy" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : ep.health === "error" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                ) : (
                  <CircleHelp className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                )}
                <div>
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{ep.name}</span>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{ep.description}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${HEALTH_CHIP[ep.health]}`}
              >
                {HEALTH_LABEL[ep.health]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2"
        data-testid="card-relay-status"
      >
        <div className="flex flex-col justify-between gap-3 border-b border-brand-accent/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div>
            <h3
              className="text-sm font-bold text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Relay Connectivity
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Live WebSocket latency probes</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void runRelayCheck()}
            disabled={relayCheckRunning}
            className="no-default-hover-elevate no-default-active-elevate w-full gap-1.5 text-xs sm:w-auto"
            data-testid="button-recheck-relays"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${relayCheckRunning ? "animate-spin" : ""}`} />
            {relayCheckRunning ? "Checking..." : "Re-check"}
          </Button>
        </div>
        <div className="space-y-3 p-5">
          {configuredRelays.map((relay, idx) => {
            const latencyInfo = relayLatencies.find((r) => r.url === relay);
            const relayStatus =
              latencyInfo?.status ?? (relayCheckRunning ? ("degraded" as const) : ("connected" as const));
            return (
              <div
                key={relay}
                className="flex flex-col justify-between gap-2 rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:gap-3"
                data-testid={`relay-row-${idx}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      relayStatus === "connected"
                        ? "border border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
                        : relayStatus === "degraded"
                          ? "border border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
                          : "border border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10"
                    }`}
                  >
                    {relayStatus === "disconnected" ? (
                      <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
                    ) : (
                      <Wifi
                        className={`h-4 w-4 ${relayStatus === "connected" ? "text-emerald-600" : "text-amber-600 dark:text-amber-400"}`}
                      />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {relay === PRIMARY_RELAY ? "DCoSL Relay (primary)" : "Profile Relay"}
                    </p>
                    <p className="max-w-[200px] truncate font-mono text-[11px] text-slate-400 dark:text-slate-500 sm:max-w-none">
                      {relay}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {latencyInfo?.latencyMs !== null && latencyInfo?.latencyMs !== undefined && (
                    <span
                      className={`font-mono text-[10px] font-bold tabular-nums ${
                        latencyInfo.latencyMs < 500
                          ? "text-emerald-600 dark:text-emerald-400"
                          : latencyInfo.latencyMs < 2000
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600"
                      }`}
                      data-testid={`relay-latency-${idx}`}
                    >
                      {latencyInfo.latencyMs}ms
                    </span>
                  )}
                  {relayCheckRunning && !latencyInfo && (
                    <span className="animate-pulse text-[10px] text-slate-400 dark:text-slate-500">Probing...</span>
                  )}
                  <StatusBadge status={relayStatus} />
                </div>
              </div>
            );
          })}
          {relayLatencies.length > 0 && (
            <p className="pt-2 text-[11px] text-slate-400 dark:text-slate-500">
              Last checked: {relayLatencies[0].checkedAt.toLocaleTimeString()} · Avg latency:{" "}
              {Math.round(
                relayLatencies.filter((r) => r.latencyMs !== null).reduce((s, r) => s + (r.latencyMs ?? 0), 0) /
                  Math.max(1, relayLatencies.filter((r) => r.latencyMs !== null).length),
              )}
              ms
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
