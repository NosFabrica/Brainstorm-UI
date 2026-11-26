import type { Dispatch, SetStateAction } from "react";
import type { OnboardQueue } from "./useOnboardQueue";
import { Button } from "@/components/ui/button";
import { Search, Users, ChevronDown, CheckCircle2, XCircle, FileText, Globe, Loader2, UserPlus } from "lucide-react";

/**
 * Lookup's Onboard mode: a Nostr name search, a pasted list of keys, the
 * queue, and its progress as it goes out.
 */
export function OnboardPanel({
  onboard,
  onboardSearch,
  setOnboardSearch,
  bulkPasteOpen,
  setBulkPasteOpen,
  bulkPasteInput,
  setBulkPasteInput,
}: {
  onboard: OnboardQueue;
  onboardSearch: string;
  setOnboardSearch: (text: string) => void;
  bulkPasteOpen: boolean;
  setBulkPasteOpen: Dispatch<SetStateAction<boolean>>;
  bulkPasteInput: string;
  setBulkPasteInput: (text: string) => void;
}) {
  const {
    onboardSearching,
    onboardResults,
    onboardError,
    setOnboardError,
    onboardQueue,
    setOnboardQueue,
    onboardingAll,
    onboardProgress,
    handleOnboardSearch,
    addToOnboardQueue,
    removeFromOnboardQueue,
    handleBulkPasteAdd,
    handleOnboardAll,
  } = onboard;
  return (
    <div className="space-y-3 overflow-hidden pt-1">
      <div className="flex min-w-0 gap-2">
        <input
          type="text"
          placeholder="Search by name..."
          value={onboardSearch}
          onChange={(e) => {
            setOnboardSearch(e.target.value);
            setOnboardError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !onboardSearching) handleOnboardSearch(onboardSearch);
          }}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
          data-testid="input-onboard-search"
          disabled={onboardingAll}
        />
        <Button
          size="sm"
          onClick={() => handleOnboardSearch(onboardSearch)}
          disabled={onboardSearching || !onboardSearch.trim() || onboardingAll}
          className="no-default-hover-elevate no-default-active-elevate shrink-0 gap-1.5 text-xs"
          data-testid="button-submit-onboard-search"
        >
          {onboardSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {onboardSearching ? "..." : "Search"}
        </Button>
      </div>
      <p className="-mt-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
        <Globe className="h-2.5 w-2.5 shrink-0" />
        Powered by Brainstorm WoT search
      </p>

      {onboardResults.length > 0 && !onboardingAll && (
        <div
          className="-mx-1 max-h-[180px] space-y-1 overflow-y-auto overflow-x-hidden px-1"
          data-testid="onboard-results"
        >
          {onboardResults.map((profile) => {
            const displayName = profile.displayName || profile.name || profile.npub.slice(0, 16) + "...";
            const isQueued = onboardQueue.some((p) => p.pubkey === profile.pubkey);
            return (
              <div
                key={profile.pubkey}
                className={`flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border p-2 transition-all ${isQueued ? "border-brand-accent/40 bg-brand-primary/10" : "border-slate-200 bg-white/80 hover:border-brand-accent/20 hover:bg-brand-primary/10 dark:border-slate-800 dark:bg-slate-900/80"}`}
                onClick={() => (isQueued ? removeFromOnboardQueue(profile.pubkey) : addToOnboardQueue(profile))}
                data-testid={`onboard-result-${profile.pubkey.slice(0, 8)}`}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${isQueued ? "border-brand-deep bg-brand-deep" : "border-slate-300 dark:border-slate-700"}`}
                >
                  {isQueued && <CheckCircle2 className="h-3 w-3 text-white" />}
                </div>
                {profile.picture ? (
                  <img
                    src={profile.picture}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-800"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20">
                    <Users className="h-3 w-3 text-brand-deep/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-[11px] font-semibold text-slate-900 dark:text-slate-100">{displayName}</p>
                  <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {profile.npub.slice(0, 16)}...{profile.npub.slice(-4)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!onboardingAll && (
        <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
          <button
            onClick={() => setBulkPasteOpen((prev) => !prev)}
            className="flex w-full items-center gap-1.5 text-[10px] font-semibold text-slate-500 transition-colors hover:text-brand-deep dark:text-slate-400"
            data-testid="button-toggle-bulk-paste"
          >
            <FileText className="h-3 w-3" />
            Import by npub list
            <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${bulkPasteOpen ? "rotate-180" : ""}`} />
          </button>
          {bulkPasteOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                placeholder={"Paste npubs or hex pubkeys\nOne per line or comma-separated"}
                value={bulkPasteInput}
                onChange={(e) => setBulkPasteInput(e.target.value)}
                className="h-16 w-full resize-none rounded-lg border border-slate-200 bg-white/80 px-3 py-2 font-mono text-[10px] focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                data-testid="textarea-bulk-paste"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (handleBulkPasteAdd(bulkPasteInput)) setBulkPasteInput("");
                }}
                disabled={!bulkPasteInput.trim()}
                className="no-default-hover-elevate no-default-active-elevate h-7 w-full gap-1 text-[10px]"
                data-testid="button-bulk-paste-add"
              >
                <UserPlus className="h-3 w-3" />
                Add to queue
              </Button>
            </div>
          )}
        </div>
      )}

      {onboardError && (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-500/25 dark:bg-red-500/10"
          data-testid="onboard-error"
        >
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
          <p className="text-[11px] text-red-700 dark:text-red-300">{onboardError}</p>
        </div>
      )}

      {onboardQueue.length > 0 && (
        <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800" data-testid="onboard-queue">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Onboard Queue ({onboardQueue.length})
            </span>
            {!onboardingAll && (
              <button
                onClick={() => setOnboardQueue([])}
                className="text-[10px] text-slate-400 transition-colors hover:text-red-500 dark:text-slate-500"
                data-testid="button-clear-queue"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex max-h-[100px] flex-wrap gap-1.5 overflow-y-auto overflow-x-hidden">
            {onboardQueue.map((profile) => {
              const displayName = profile.displayName || profile.name || profile.npub.slice(0, 10) + "...";
              const progressItem = onboardProgress?.results.find((r) => r.pubkey === profile.pubkey);
              return (
                <div
                  key={profile.pubkey}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] transition-all ${
                    progressItem
                      ? progressItem.success
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                      : "border-brand-accent/20 bg-brand-primary/10 text-slate-700 dark:bg-brand-primary/10 dark:text-slate-200"
                  }`}
                  data-testid={`queue-item-${profile.pubkey.slice(0, 8)}`}
                >
                  {profile.picture ? (
                    <img
                      src={profile.picture}
                      alt=""
                      className="h-4 w-4 shrink-0 rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : null}
                  <span className="max-w-[80px] truncate font-medium">{displayName}</span>
                  {progressItem ? (
                    progressItem.success ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3 w-3 shrink-0 text-red-500" />
                    )
                  ) : !onboardingAll ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromOnboardQueue(profile.pubkey);
                      }}
                      className="shrink-0 transition-colors hover:text-red-500"
                      data-testid={`button-remove-${profile.pubkey.slice(0, 8)}`}
                    >
                      <XCircle className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {onboardingAll && onboardProgress && (
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-accent to-brand-deep transition-all duration-300"
                  style={{ width: `${(onboardProgress.done / onboardProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                {onboardProgress.done} of {onboardProgress.total} processed
              </p>
            </div>
          )}

          {!onboardingAll && !onboardProgress && (
            <Button
              size="sm"
              onClick={handleOnboardAll}
              className="no-default-hover-elevate no-default-active-elevate h-8 w-full gap-1.5 text-xs"
              data-testid="button-onboard-all"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Onboard All ({onboardQueue.length})
            </Button>
          )}

          {onboardProgress && !onboardingAll && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                  {onboardProgress.results.filter((r) => r.success).length} onboarded
                  {onboardProgress.results.filter((r) => !r.success).length > 0 &&
                    `, ${onboardProgress.results.filter((r) => !r.success).length} failed`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
