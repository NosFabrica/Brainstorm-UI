/**
 * What the inbox has actually fetched and opened, relay by relay — for the
 * reader who thinks something is missing. Shown in Settings › Private messages.
 */
import { Download, Loader2, RefreshCw, RotateCcw, Square } from "lucide-react";
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
  // Why opening, and so the download, has stopped.
  const heldBy =
    state.paused &&
    {
      waiting: "your signer is waiting for you to start opening them",
      cancelled: "your signer is locked",
      unreachable: "your signer isn't answering",
      refused: "your signer declined to open them",
      failed: "your signer ran into an error opening them",
      "wrong-account": "your signer is on a different profile",
      "no-nip44": "your signer can't open private messages (no NIP-44)",
    }[state.paused];
  const more = state.history.relays.some((r) => r.state === "idle" || r.state === "loading" || r.retrying);
  return (
    <section className="flex flex-col gap-3" data-testid="dm-sync-details">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sync</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          What each inbox relay has sent this visit. Older history loads as you scroll Messages, or all at once from
          here.
        </p>
      </div>
      {/* On a phone the five columns were cut mid-word inside a sideways scroller: each
          relay is a block of its own there, and the table is for wider screens. */}
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-xs sm:hidden">
        {state.inboxRelays.map((url) => {
          const h = history.get(url);
          return (
            <li key={url} className="flex flex-col gap-1.5 px-3 py-2.5">
              <span className="break-all font-mono font-semibold text-slate-800 dark:text-slate-100">
                {relayHost(url)}
              </span>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                <dt className="text-slate-500 dark:text-slate-400">New messages</dt>
                <dd>{LIVE_LABEL[state.live[url] ?? "connecting"] ?? state.live[url]}</dd>
                <dt className="text-slate-500 dark:text-slate-400">History</dt>
                <dd title={h?.reason}>{h ? markerLabel(h) : "—"}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Received</dt>
                <dd className="tabular-nums">
                  {(state.sync.received[url] ?? 0).toLocaleString()} · {h?.pages ?? 0} pages
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
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
        {state.downloading ? (
          <Button size="sm" variant="outline" onClick={() => engine.stopDownload()} data-testid="dm-sync-stop">
            <Square className="mr-1.5 h-3.5 w-3.5" /> Stop downloading
          </Button>
        ) : more ? (
          <Button size="sm" onClick={() => engine.downloadAll()} data-testid="dm-sync-download">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download all history
          </Button>
        ) : null}
        {!state.downloading && (
          <Button size="sm" variant="outline" onClick={() => engine.refetchHistory()} data-testid="dm-sync-refetch">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Check again from the top
          </Button>
        )}
      </div>
      {state.downloading && (
        <p
          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
          data-testid="dm-sync-downloading"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-deep" />
          Downloading every relay to its first message — each page waits for the last to be opened, so it goes at your
          signer's pace. It keeps going while you use the app.
        </p>
      )}
      {state.downloading && heldBy && state.queued > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-200"
          data-testid="dm-sync-held"
        >
          <span>
            On hold: {state.queued.toLocaleString()} {state.queued === 1 ? "message" : "messages"} to open first, and{" "}
            {heldBy}.{state.pauseDetail && <> Your signer said: “{state.pauseDetail}”</>}
          </span>
          {state.paused !== "no-nip44" && (
            <Button size="sm" variant="outline" onClick={() => engine.allowDecrypt()}>
              {state.paused === "cancelled" ? "Unlock" : state.paused === "waiting" ? "Open them" : "Try again"}
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {state.setAside > 0 && "Set aside: your signer kept turning these down while it opened others. "}
        Checking again re-reads every relay from the newest message down to the first; messages already on this device
        aren't opened twice.
      </p>
    </section>
  );
}
