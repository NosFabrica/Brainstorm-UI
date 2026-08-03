import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BrainLogo } from "@/components/BrainLogo";
import { ChevronDown, Check, Loader2, ExternalLink, AlertCircle, FileSignature, HeartHandshake, Rocket } from "lucide-react";
import type { NostrEvent } from "applesauce-core/helpers";
import { publishToRelays, signNip85, getNip85RelayUrl, fetchTrustProviderList } from "@/services/nostr";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { markNip85Activated } from "@/lib/nip85Activation";

interface ActivateBrainstormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceKey: string;
  onActivated: () => void;
}

const NIP85_URL = "https://github.com/nostr-protocol/nips/blob/master/85.md";

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
    if (!open) { setHasOtherProvider(false); return; }
    let cancelled = false;
    (async () => {
      try {
        if (!user?.pubkey) return;
        const event = await fetchTrustProviderList(user.pubkey);
        if (cancelled || !event) return;
        const rankTag = event.tags.find((t: string[]) => t[0] === "30382:rank");
        const target = rankTag?.[1];
        if (target && serviceKey && target !== serviceKey) setHasOtherProvider(true);
      } catch { /* best-effort — fall back to the generic disclaimer */ }
    })();
    return () => { cancelled = true; };
  }, [open, serviceKey]);

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

    let nip85Relay: string;
    try {
      nip85Relay = getNip85RelayUrl();
    } catch (err: any) {
      setActivateState("error");
      setErrorMessage(err?.message || "NIP-85 relay URL is not configured.");
      return;
    }

    let signedEvent: NostrEvent;
    try {
      signedEvent = await signNip85(serviceKey, nip85Relay);
    } catch (err: any) {
      setActivateState("cancelled");
      setTimeout(() => setActivateState("idle"), 3000);
      return;
    }

    setActivateState("publishing");

    const result = await publishToRelays(signedEvent);

    if (result.success) {
      markNip85Activated(user.pubkey);
      setActivateState("success");
      setTimeout(() => {
        onActivated();
      }, 2000);
    } else {
      setActivateState("error");
      setErrorMessage(result.error || "Failed to publish to relays. Please try again.");
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

  const sections = [
    {
      key: "what",
      icon: <FileSignature className="h-4 w-4" />,
      title: "What does this mean?",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Selecting Brainstorm as your Service Provider signs a nostr note (kind 10040)
            that tells compatible clients where to find the scores we publish on your behalf.
          </p>
          <a
            href={NIP85_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:text-brand-primary transition-colors"
            data-testid="link-nip85-learn-more-what"
          >
            Learn more in NIP-85: Trusted Assertions
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ),
    },
    {
      key: "why",
      icon: <HeartHandshake className="h-4 w-4" />,
      title: "Why this matters",
      content: (
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Harness your extended and trusted nostr community to help you eliminate spam and find
          the content that best suits your interests and values. Take control over your time and
          attention. Steer clear of the information gatekeepers and the advertisers who only see
          you as their product!
        </p>
      ),
    },
    {
      key: "next",
      icon: <Rocket className="h-4 w-4" />,
      title: "What happens next",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            We will calculate trust scores for your entire nostr network, entirely from YOUR
            perspective, using standard nostr follows, mutes, and reports. This usually takes
            5–10 minutes.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            We next publish those scores as nostr notes (called Trusted Assertions) which makes
            them available for use by clients and apps throughout the nostr network.
          </p>
          <a
            href={NIP85_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:text-brand-primary transition-colors"
            data-testid="link-nip85-learn-more-next"
          >
            Learn more about NIP-85: Trusted Assertions
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[540px] max-h-[90vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden p-0"
        data-testid="dialog-activate-brainstorm"
      >
        <div className="flex flex-col max-h-[90vh]">
          <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 sm:px-7 pt-6 sm:pt-8 pb-2">
            <DialogHeader className="space-y-0 text-left">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link uppercase">Web of Trust</span>
                <div className="h-px w-10 bg-brand-link/30" />
              </div>
              <DialogTitle
                className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-[1.15] tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-activate-title"
              >
                Broadcast your scores <span className="text-brand-link">across Nostr</span>.
              </DialogTitle>
              <DialogDescription className="text-sm sm:text-[15px] text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed" data-testid="text-activate-subtitle">
                Selecting Brainstorm as your service provider signs one nostr note that tells compatible clients where to find the personalized trust scores we publish for you.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-4 sm:px-6 pb-3 space-y-2" data-testid="accordion-activate-sections">
            {sections.map((section) => {
              const isExpanded = expandedSection === section.key;
              return (
                <div
                  key={section.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden transition-colors duration-200 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                  onClick={() => toggleSection(section.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection(section.key); } }}
                  data-testid={`section-activate-${section.key}`}
                >
                  <div
                    className="w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left"
                    data-testid={`button-toggle-${section.key}`}
                  >
                    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/15 border border-brand-primary/15 dark:border-brand-primary/25 flex items-center justify-center text-brand-link shrink-0">
                      {section.icon}
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">{section.title}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                  {isExpanded && (
                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 ml-8 sm:ml-10" onClick={(e) => e.stopPropagation()} data-testid={`content-${section.key}`}>
                      {section.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-4 sm:px-6 pb-2">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Supported by</span>
              <div className="flex items-center gap-2">
                <a href="https://amethyst.social/#" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-primary/[0.06] dark:bg-brand-primary/15 border border-brand-primary/15 dark:border-brand-primary/25 text-brand-link text-xs font-semibold hover:bg-brand-primary/[0.1] dark:hover:bg-brand-primary/25 transition-colors" data-testid="link-modal-amethyst">
                  Amethyst
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
                <a href="https://www.nostria.app/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/25 text-orange-700 dark:text-orange-300 text-xs font-semibold hover:bg-orange-100 dark:hover:bg-orange-500/20 transition-colors" data-testid="link-modal-nostria">
                  Nostria
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </div>
          </div>

          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 shrink-0">
            <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3 sm:pt-4">
              {activateState === "success" ? (
                <div
                  className="flex items-center justify-center gap-2 sm:gap-3 h-11 sm:h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                  data-testid="status-activate-success"
                >
                  <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold">You're all set! Brainstorm is now your service provider.</span>
                </div>
              ) : activateState === "cancelled" ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-700 dark:text-amber-300"
                    data-testid="status-activate-cancelled"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium">Signing was cancelled. You can try again whenever you're ready.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleActivate}
                    className="w-full h-11 sm:h-12 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-brand-primary/20 transition-all duration-200 flex items-center justify-center gap-2"
                    data-testid="button-activate-retry"
                  >
                    Try Again
                  </button>
                </div>
              ) : activateState === "error" ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300"
                    data-testid="status-activate-error"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium">{errorMessage || "Something went wrong. Please try again."}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleActivate}
                    className="w-full h-11 sm:h-12 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-brand-primary/20 transition-all duration-200 flex items-center justify-center gap-2"
                    data-testid="button-activate-retry"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {activateState === "idle" && (
                    hasOtherProvider ? (
                      <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25" data-testid="text-activate-replace-warning">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-px" />
                        <p className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
                          You already have a different Web of Trust provider selected. Continuing will <strong className="font-bold">replace it</strong> with Brainstorm for your trusted assertions going forward.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 mb-3 px-1" data-testid="text-activate-disclaimer">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-px" />
                        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                          If you have an active Web of Trust service provider, proceeding will override existing trusted assertion calculations. By continuing, you confirm Brainstorm as your service provider for trusted assertions going forward.
                        </p>
                      </div>
                    )
                  )}
                  <button
                    type="button"
                    onClick={handleActivate}
                    disabled={activateState === "signing" || activateState === "publishing"}
                    className="w-full h-11 sm:h-12 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-brand-primary/20 transition-all duration-200 flex items-center justify-center gap-2"
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
