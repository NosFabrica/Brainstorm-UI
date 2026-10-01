/**
 * What the inbox has actually fetched and opened, relay by relay — for the
 * reader who thinks something is missing. Shown in Settings › Private messages.
 */
import { RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useDmEngine, useDmState } from "@/hooks/useDirectMessages";
import { markerLabel } from "./RelayMarker";
import { relayHost } from "./people";

const LIVE_LABEL: Record<string, string> = {
  synced: "live",
  connecting: "connecting",
  auth: "needs sign-in",
};

export function SyncDetails() {
  const engine = useDmEngine();
  const state = useDmState(engine);
  if (!engine || state.status !== "ready") return null;
  const history = new Map(state.history.relays.map((r) => [r.url, r]));
  return (
    <section className="flex flex-col gap-3" data-testid="dm-sync-details">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sync</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          What each inbox relay has sent this visit. Older history loads as you scroll Messages.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-semibold">Relay</th>
              <th className="px-3 py-2 font-semibold">New messages</th>
              <th className="px-3 py-2 font-semibold">History</th>
              <th className="px-3 py-2 text-right font-semibold">Received</th>
              <th className="px-3 py-2 text-right font-semibold">Pages</th>
            </tr>
          </thead>
          <tbody>
            {state.inboxRelays.map((url) => {
              const h = history.get(url);
              return (
                <tr key={url} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono">{relayHost(url)}</td>
                  <td className="px-3 py-2">{LIVE_LABEL[state.live[url] ?? "connecting"] ?? state.live[url]}</td>
                  <td className="px-3 py-2" title={h?.reason}>
                    {h ? markerLabel(h) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(state.sync.received[url] ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{h?.pages ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tone="slate">{engine.store.size.toLocaleString()} messages on this device</Chip>
        <Chip tone="slate">{state.sync.opened.toLocaleString()} opened this visit</Chip>
        {state.queued > 0 && <Chip tone="brand">{state.queued.toLocaleString()} opening</Chip>}
        {state.failed > 0 && <Chip tone="amber">{state.failed.toLocaleString()} unreadable</Chip>}
        {state.setAside > 0 && <Chip tone="amber">{state.setAside.toLocaleString()} set aside</Chip>}
      </div>
      <div className="flex flex-wrap gap-2">
        {state.setAside > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => engine.retrySetAside()}
            data-testid="dm-sync-retry-set-aside"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try the set-aside ones again
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => engine.refetchHistory()} data-testid="dm-sync-refetch">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Fetch history again
        </Button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {state.setAside > 0 && "Set aside: your signer kept declining these while it opened others. "}
        Fetching again re-reads every relay from the newest message down; messages already on this device aren't opened
        twice.
      </p>
    </section>
  );
}
