/**
 * Settings › Trust › Advanced › Service Provider: whether the Account's NIP-85
 * declaration (kind 10040) names Brainstorm, with Update and Deactivate behind
 * a confirm each (useTrustAnchorActions), or the way to turn it on.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Info, Loader2, RefreshCw, X } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TrustAnchorActions } from "./useTrustAnchorActions";

export function ServiceProviderCard({
  selfLoading,
  nip85Activated,
  lastCalculated,
  taPubkey,
  hasNoFollowing,
  actions,
}: {
  selfLoading: boolean;
  nip85Activated: boolean;
  lastCalculated: string | null;
  taPubkey: string | null;
  hasNoFollowing: boolean;
  actions: TrustAnchorActions;
}) {
  const [, navigate] = useLocation();
  const [nip85ConfirmOpen, setNip85ConfirmOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const {
    republishState,
    republishError,
    republishRetry,
    handleRepublishNip85,
    retryRepublish,
    deactivateState,
    deactivateError,
    deactivateRetry,
    handleDeactivateNip85,
    retryDeactivate,
  } = actions;
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-service-provider"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <BrainLogo size={18} className="text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-sp-title"
            >
              Service Provider
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-sp-subtitle">
              NIP-85 declaration
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {selfLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ) : nip85Activated ? (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-center justify-between" data-testid="row-sp-status">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </span>
              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1"
                data-testid="badge-sp-active"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Active</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between" data-testid="row-sp-provider">
                <span className="text-xs text-slate-500 dark:text-slate-400">Provider</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Brainstorm</span>
              </div>
              <div className="flex items-center justify-between" data-testid="row-sp-event">
                <span className="text-xs text-slate-500 dark:text-slate-400">Event kind</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">10040</span>
              </div>
              {lastCalculated && (
                <div className="flex items-center justify-between" data-testid="row-sp-since">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Active since</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {new Date(lastCalculated).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between" data-testid="row-sp-supported">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Supported by</span>
                  <div className="group/info relative">
                    <button
                      type="button"
                      className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                      onClick={(e) => e.currentTarget.focus()}
                      aria-label="What are Supported Clients?"
                      data-testid="button-supported-by-info"
                    >
                      <Info className="h-2.5 w-2.5" />
                    </button>
                    <div
                      className="pointer-events-none invisible fixed left-4 right-4 top-1/2 z-[100] -translate-y-1/2 rounded-xl border border-white/15 bg-slate-900/95 p-3 text-xs leading-relaxed text-slate-200 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 group-focus-within/info:pointer-events-auto group-focus-within/info:visible group-focus-within/info:opacity-100 group-hover/info:pointer-events-auto group-hover/info:visible group-hover/info:opacity-100 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:top-auto sm:mb-2 sm:w-80 sm:translate-y-0"
                      data-testid="tooltip-supported-by"
                    >
                      These are Nostr clients that use the personalized scores Brainstorm publishes for you, via NIP-85
                      Trusted Assertions or other integrations.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href="https://amethyst.social/#"
                    target="_blank"
                    rel="noopener"
                    className="text-[11px] font-semibold text-brand-deep transition-colors hover:text-brand-accent"
                  >
                    Amethyst
                  </a>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">&middot;</span>
                  <a
                    href="https://www.nostria.app/"
                    target="_blank"
                    rel="noopener"
                    className="text-[11px] font-semibold text-orange-600 transition-colors hover:text-orange-700"
                  >
                    Nostria
                  </a>
                </div>
              </div>
            </div>

            {republishState === "error" && republishError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                data-testid="alert-sp-republish-error"
              >
                <p className="text-xs font-medium text-red-700">{republishError}</p>
                {republishRetry && (
                  <button
                    type="button"
                    onClick={() => void retryRepublish()}
                    className="mt-1 text-xs font-bold text-red-700 underline"
                    data-testid="button-sp-republish-retry"
                  >
                    Retry — sends the same signed update, no new signature
                  </button>
                )}
              </div>
            )}

            {republishState === "success" && (
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                data-testid="alert-sp-republish-success"
              >
                <p className="text-xs font-medium text-emerald-700">NIP-85 event updated successfully.</p>
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <AlertDialog open={nip85ConfirmOpen} onOpenChange={setNip85ConfirmOpen}>
                <button
                  type="button"
                  onClick={() => setNip85ConfirmOpen(true)}
                  disabled={
                    republishState === "signing" ||
                    republishState === "publishing" ||
                    republishState === "success" ||
                    !taPubkey
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:pointer-events-none disabled:opacity-50"
                  data-testid="button-sp-republish"
                >
                  {republishState === "signing" || republishState === "publishing" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {republishState === "signing" ? "Signing..." : "Publishing..."}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Update NIP-85 Event
                    </>
                  )}
                </button>
                <AlertDialogContent
                  className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                  data-testid="dialog-confirm-nip85-update"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-link">
                          Service Provider
                        </span>
                        <div className="h-px w-10 bg-brand-link/30" />
                      </div>
                      <AlertDialogTitle
                        className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        style={{ fontFamily: "var(--font-display)" }}
                        data-testid="text-confirm-nip85-title"
                      >
                        Update NIP-85 Event?
                      </AlertDialogTitle>
                      <AlertDialogDescription
                        className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                        data-testid="text-confirm-nip85-desc"
                      >
                        This will re-sign and republish your Brainstorm service provider event to Nostr relays. This is
                        useful if your previous event wasn't picked up by all relays, or if you want to refresh your
                        service provider status.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-nip85-cancel">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:bg-brand-primary-hover"
                        onClick={() => {
                          setNip85ConfirmOpen(false);
                          handleRepublishNip85();
                        }}
                        data-testid="button-confirm-nip85-continue"
                      >
                        Update
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </div>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={deactivateConfirmOpen} onOpenChange={setDeactivateConfirmOpen}>
                <button
                  type="button"
                  onClick={() => setDeactivateConfirmOpen(true)}
                  disabled={
                    deactivateState === "signing" || deactivateState === "publishing" || deactivateState === "success"
                  }
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50 dark:bg-slate-900"
                  data-testid="button-sp-deactivate"
                >
                  {deactivateState === "signing" || deactivateState === "publishing" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {deactivateState === "signing" ? "Signing..." : "Publishing..."}
                    </>
                  ) : (
                    <>
                      <X className="h-3.5 w-3.5" />
                      Deactivate
                    </>
                  )}
                </button>
                <AlertDialogContent
                  className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                  data-testid="dialog-confirm-nip85-deactivate"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-red-500">
                          Deactivate
                        </span>
                        <div className="h-px w-10 bg-red-500/30" />
                      </div>
                      <AlertDialogTitle
                        className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        style={{ fontFamily: "var(--font-display)" }}
                        data-testid="text-confirm-deactivate-title"
                      >
                        Deactivate Service Provider?
                      </AlertDialogTitle>
                      <AlertDialogDescription
                        className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                        data-testid="text-confirm-deactivate-desc"
                      >
                        This tells other Nostr apps to stop using Brainstorm as the source of your scores. Apps like
                        Amethyst and Nostria will no longer show them. Your data inside Brainstorm will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-deactivate-cancel">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700"
                        onClick={() => {
                          setDeactivateConfirmOpen(false);
                          handleDeactivateNip85();
                        }}
                        data-testid="button-confirm-deactivate-continue"
                      >
                        Deactivate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {deactivateState === "error" && deactivateError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                data-testid="alert-sp-deactivate-error"
              >
                <p className="text-xs font-medium text-red-700">{deactivateError}</p>
                {deactivateRetry && (
                  <button
                    type="button"
                    onClick={() => void retryDeactivate()}
                    className="mt-1 text-xs font-bold text-red-700 underline"
                    data-testid="button-sp-deactivate-retry"
                  >
                    Retry — sends the same signed update, no new signature
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-center justify-between" data-testid="row-sp-status-inactive">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </span>
              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-800"
                data-testid="badge-sp-inactive"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Not active
                </span>
              </div>
            </div>

            <p
              className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-sp-inactive-desc"
            >
              You haven't picked anywhere for your scores to come from. Turn Brainstorm on to share them with other
              Nostr apps.
            </p>

            {hasNoFollowing && (
              <div
                className="flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50 p-2.5"
                data-testid="banner-sp-no-follows"
              >
                <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">
                  Follow some people on Nostr first to activate this feature.
                </p>
              </div>
            )}

            <div className="mt-auto border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                disabled={hasNoFollowing}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:pointer-events-none disabled:opacity-50"
                data-testid="button-sp-go-to-dashboard"
              >
                Go to Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
