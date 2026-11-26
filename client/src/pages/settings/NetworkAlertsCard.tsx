import { useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { useIgnoreSyncState } from "@/hooks/useIgnoreSyncState";
import { hasUnsyncedIgnores, ignoredAlertMap } from "@/lib/networkAlertsIgnored";

// Settings' door to the whole Network Alerts surface, not just one slice of it.
// It opens /alerts, which has three tabs, so labelling it "Ignored accounts"
// described a third of where it goes. The subtitle names all three so this
// reads as a map — which also gives extended reach a findable trail now that
// it's off the dashboard entirely.
//
// Only the ignored count is shown, because it's the only free one: it's a
// localStorage read, whereas follows/extended need the ~10s /networkAlerts
// call, and firing that from Settings to fill in a subtitle would make the
// page slow for numbers nobody came here for. It's also the one people
// actually arrive hunting for. Counting the raw persisted list (the Ignored
// TAB counts what's currently hidden, which differs once something escalates)
// — hence "on your ignore list" rather than repeating the tab's wording.
// The "saved to your account" half of this subtitle was an unconditional
// claim. When the NIP-78 write can't happen it's simply untrue, and this card
// is exactly where someone checks what they've ignored — so it has to say
// which of the two is actually the case.
// Also consult the persisted flag: this page can be loaded cold, where the
// in-memory state has reset to "ok" but the list still never left the device.
export function useNetworkAlertsSummary(pubkey: string) {
  const ignoredListCount = useMemo(() => (pubkey ? ignoredAlertMap(pubkey).size : 0), [pubkey]);
  const ignoreSync = useIgnoreSyncState();
  const ignoresUnsynced = ignoreSync === "local-only" || (pubkey ? hasUnsyncedIgnores(pubkey) : false);
  const savedWhere = ignoresUnsynced ? "saved on this device only" : "saved to your account";
  return { ignoredListCount, savedWhere };
}

export function NetworkAlertsCard({ ignoredListCount, savedWhere }: { ignoredListCount: number; savedWhere: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate("/alerts")}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-accent/15 bg-white/70 px-5 py-4 text-left transition-all hover:border-brand-accent/30 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900/70"
      data-testid="button-network-alerts"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <ShieldAlert className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0">
          <h2
            className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Network Alerts
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-network-alerts-summary">
            {ignoredListCount === 0
              ? "Accounts people you trust have reported — the people you follow, your wider network, and anything you've ignored."
              : `Accounts people you trust have reported — the people you follow, your wider network, and ${ignoredListCount} you've ignored, ${savedWhere}.`}
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
    </button>
  );
}
