import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BrainLogo } from "@/components/BrainLogo";
import { ChevronDown, Check, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { checkExistingTrustProvider, publishBrainstormTrustAnchor } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { nip85ExplainerSections } from "@/components/nip85Explainer";

interface ActivateBrainstormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceKey: string;
  onActivated: () => void;
}

type ActivateState = "idle" | "signing" | "publishing" | "success" | "cancelled" | "error";

export function ActivateBrainstormModal({ open, onOpenChange, serviceKey, onActivated }: ActivateBrainstormModalProps) {
  const user = useActiveAccountDisplay();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [activateState, setActivateState] = useState<ActivateState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  // When the modal opens, check whether the user already declared a DIFFERENT
  // WoT provider (a kind-10040 whose rank target isn't Brainstorm's). If so, we
  // warn that continuing replaces it — informed consent, not a silent overwrite.
  const [hasOtherProvider, setHasOtherProvider] = useState(false);

  useEffect(() => {
    // Cleared on every run, not only on close. Now that the Account is a
    // dependency, a switch re-runs the fetch — and leaving the previous answer
    // standing would show B "this replaces your existing provider" for a provider
    // that is A's.
    setHasOtherProvider(false);
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!user?.pubkey) return;
      // "unknown"/"none" fall back to the generic disclaimer — best-effort.
      const status = await checkExistingTrustProvider(user.pubkey, serviceKey);
      if (!cancelled && status === "other") setHasOtherProvider(true);
    })();
    return () => {
      cancelled = true;
    };
    // `user` is stream-backed and null for the first renders, so the effect bails
    // early. Without it in the deps it never re-runs, `hasOtherProvider` stays
    // false, and the "this replaces your existing provider" warning is skipped
    // before overwriting kind-10040 — the one thing this check is here to catch.
  }, [open, serviceKey, user?.pubkey]);

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => (prev === key ? null : key));
  };

  const handleActivate = async () => {
    setActivateState("signing");
    setErrorMessage("");

    if (!user?.pubkey) {
      setActivateState("error");
      setErrorMessage("Not logged in.");
      return;
    }

    // Signing with an empty service key would publish a 10040 pointing at
    // nothing. The dashboard disables its buttons until ta_pubkey exists, but
    // never rely on callers for that.
    if (!serviceKey) {
      setActivateState("error");
      setErrorMessage("Your account is still being prepared — please try again in a few minutes.");
      return;
    }

    const result = await publishBrainstormTrustAnchor(user.pubkey, serviceKey, setActivateState);

    if (result.status === "success") {
      setActivateState("success");
      setTimeout(() => {
        onActivated();
      }, 2000);
    } else if (result.status === "cancelled") {
      // A declined unlock never shows as an error; an extension refusal keeps the
      // "cancelled" note it always had.
      if (result.unlockDeclined) {
        setActivateState("idle");
        return;
      }
      setActivateState("cancelled");
      setTimeout(() => setActivateState("idle"), 3000);
    } else {
      setActivateState("error");
      setErrorMessage(result.message);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (activateState === "signing" || activateState === "publishing") return;
    if (!nextOpen) {
      setActivateState("idle");
      setErrorMessage("");
      setExpandedSection(null);
    }
    onOpenChange(nextOpen);
  };

  const sections = nip85ExplainerSections;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-w-[540px]"
        data-testid="dialog-activate-brainstorm"
      >
        <div className="flex max-h-[90vh] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-5 pb-2 pt-6 sm:px-7 sm:pt-8">
              <DialogHeader className="space-y-0 text-left">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-link">
                    Your network
                  </span>
                  <div className="h-px w-10 bg-brand-link/30" />
                </div>
                <DialogTitle
                  className="text-xl font-bold leading-[1.15] tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-activate-title"
                >
                  Broadcast your scores <span className="text-brand-link">across Nostr</span>.
                </DialogTitle>
                <DialogDescription
                  className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-[15px]"
                  data-testid="text-activate-subtitle"
                >
                  Selecting Brainstorm as your service provider signs one nostr note that tells compatible clients where
                  to find the personalized scores we publish for you.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="space-y-2 px-4 pb-3 sm:px-6" data-testid="accordion-activate-sections">
              {sections.map((section) => {
                const isExpanded = expandedSection === section.key;
                return (
                  <div
                    key={section.key}
                    className="cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 transition-colors duration-200 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800/70"
                    onClick={() => toggleSection(section.key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSection(section.key);
                      }
                    }}
                    data-testid={`section-activate-${section.key}`}
                  >
                    <div
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left sm:gap-3 sm:px-4 sm:py-3"
                      data-testid={`button-toggle-${section.key}`}
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-brand-primary/15 bg-brand-primary/10 text-brand-link dark:border-brand-primary/25 dark:bg-brand-primary/15 sm:h-7 sm:w-7">
                        {section.icon}
                      </div>
                      <span className="flex-1 text-xs font-semibold text-slate-800 dark:text-slate-200 sm:text-sm">
                        {section.title}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500 ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                    {isExpanded && (
                      <div
                        className="ml-8 px-3 pb-3 pt-0 sm:ml-10 sm:px-4 sm:pb-4"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`content-${section.key}`}
                      >
                        {section.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-4 pb-2 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 px-1 sm:gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Supported by
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href="https://amethyst.social/#"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/15 bg-brand-primary/[0.06] px-2.5 py-1 text-xs font-semibold text-brand-link transition-colors hover:bg-brand-primary/[0.1] dark:border-brand-primary/25 dark:bg-brand-primary/15 dark:hover:bg-brand-primary/25"
                    data-testid="link-modal-amethyst"
                  >
                    Amethyst
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  <a
                    href="https://www.nostria.app/"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20"
                    data-testid="link-modal-nostria"
                  >
                    Nostria
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
            <div className="border-t border-slate-200/60 pt-3 dark:border-slate-800 sm:pt-4">
              {activateState === "success" ? (
                <div
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300 sm:h-12 sm:gap-3"
                  data-testid="status-activate-success"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 sm:h-6 sm:w-6">
                    <Check className="h-3 w-3 text-white sm:h-3.5 sm:w-3.5" />
                  </div>
                  <span className="text-xs font-bold sm:text-sm">
                    You're all set! Brainstorm is now your service provider.
                  </span>
                </div>
              ) : activateState === "cancelled" ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300 sm:px-4 sm:py-2.5"
                    data-testid="status-activate-cancelled"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium">
                      Signing was cancelled. You can try again whenever you're ready.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleActivate}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary text-xs font-bold tracking-wide text-white shadow-lg shadow-brand-primary/20 transition-all duration-200 hover:bg-brand-primary-hover sm:h-12 sm:text-sm"
                    data-testid="button-activate-retry"
                  >
                    Try Again
                  </button>
                </div>
              ) : activateState === "error" ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 sm:px-4 sm:py-2.5"
                    data-testid="status-activate-error"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium">
                      {errorMessage || "Something went wrong. Please try again."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleActivate}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary text-xs font-bold tracking-wide text-white shadow-lg shadow-brand-primary/20 transition-all duration-200 hover:bg-brand-primary-hover sm:h-12 sm:text-sm"
                    data-testid="button-activate-retry"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {activateState === "idle" &&
                    (hasOtherProvider ? (
                      <div
                        className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/25 dark:bg-amber-500/10"
                        data-testid="text-activate-replace-warning"
                      >
                        <AlertCircle className="mt-px h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
                          Another provider is already publishing your scores. Continuing will{" "}
                          <strong className="font-bold">replace it</strong> with Brainstorm for your trusted assertions
                          going forward.
                        </p>
                      </div>
                    ) : (
                      <div className="mb-3 flex items-start gap-2 px-1" data-testid="text-activate-disclaimer">
                        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                          If another provider is already publishing your scores, proceeding will override those
                          calculations. By continuing, you confirm Brainstorm as your service provider for trusted
                          assertions going forward.
                        </p>
                      </div>
                    ))}
                  <button
                    type="button"
                    onClick={handleActivate}
                    disabled={activateState === "signing" || activateState === "publishing"}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary text-xs font-bold tracking-wide text-white shadow-lg shadow-brand-primary/20 transition-all duration-200 hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70 sm:h-12 sm:text-sm"
                    data-testid="button-activate-confirm"
                  >
                    {activateState === "signing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Waiting for signature...
                      </>
                    ) : activateState === "publishing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Publishing to relays...
                      </>
                    ) : (
                      <>
                        <BrainLogo mono size={16} className="text-white" />
                        Select Brainstorm as my Service Provider
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
