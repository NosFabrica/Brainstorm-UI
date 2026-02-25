import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BrainLogo } from "@/components/BrainLogo";
import { ChevronDown, Check, Loader2, ExternalLink, AlertCircle, FileSignature, HeartHandshake, Rocket } from "lucide-react";
import { publishToRelays, getCurrentUser } from "@/services/nostr";

interface ActivateBrainstormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceKey: string;
  onActivated: () => void;
}

const NIP85_URL = "https://github.com/nostr-protocol/nips/blob/master/85.md";

type ActivateState = "idle" | "signing" | "publishing" | "success" | "cancelled" | "error";

export function ActivateBrainstormModal({ open, onOpenChange, serviceKey, onActivated }: ActivateBrainstormModalProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [activateState, setActivateState] = useState<ActivateState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => (prev === key ? null : key));
  };

  const handleActivate = async () => {
    setActivateState("signing");
    setErrorMessage("");

    if (!window.nostr) {
      setActivateState("error");
      setErrorMessage("No Nostr extension found. Please install a NIP-07 compatible extension.");
      return;
    }

    const user = getCurrentUser();
    if (!user?.pubkey) {
      setActivateState("error");
      setErrorMessage("Not logged in.");
      return;
    }

    const event = {
      kind: 10040,
      tags: [["30382:rank", serviceKey, "wss://relay.nostr.band"]],
      content: "",
      created_at: Math.floor(Date.now() / 1000),
      pubkey: user.pubkey,
    };

    let signedEvent: Record<string, unknown>;
    try {
      signedEvent = await window.nostr.signEvent(event);
    } catch (err: any) {
      setActivateState("cancelled");
      setTimeout(() => setActivateState("idle"), 3000);
      return;
    }

    setActivateState("publishing");

    const result = await publishToRelays(signedEvent);

    if (result.success) {
      localStorage.setItem("brainstorm_nip85_activated", "true");
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
          <p className="text-sm text-slate-600 leading-relaxed">
            Selecting Brainstorm as your Service Provider signs a nostr note (kind 10040)
            that tells compatible clients where to find the scores we publish on your behalf.
          </p>
          <a
            href={NIP85_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3730a3] hover:text-[#312e81] transition-colors"
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
        <p className="text-sm text-slate-600 leading-relaxed">
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
          <p className="text-sm text-slate-600 leading-relaxed">
            We will calculate trust scores for your entire nostr network, entirely from YOUR
            perspective, using standard nostr follows, mutes, and reports. This usually takes
            5–10 minutes.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            We next publish those scores as nostr notes (called Trusted Assertions) which makes
            them available for use by clients and apps throughout the nostr network.
          </p>
          <a
            href={NIP85_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3730a3] hover:text-[#312e81] transition-colors"
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
        className="sm:max-w-[560px] rounded-3xl border border-[#7c86ff]/20 bg-gradient-to-b from-white/92 via-white/88 to-indigo-50/60 backdrop-blur-xl shadow-[0_60px_140px_-70px_rgba(51,50,134,0.75)] overflow-hidden p-0"
        data-testid="dialog-activate-brainstorm"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
          <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/15 blur-[110px]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,134,255,0.14)_0%,rgba(255,255,255,0.00)_40%,rgba(51,50,134,0.12)_100%)]" />
        </div>

        <div className="relative">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />

          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-2xl bg-white/70 border border-[#7c86ff]/20 shadow-sm flex items-center justify-center text-[#333286]" data-testid="icon-activate-brainstorm">
                  <BrainLogo size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle
                    className="text-lg font-bold text-slate-900 leading-tight tracking-tight"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    data-testid="text-activate-title"
                  >
                    Select Brainstorm as your Web of Trust Service Provider
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-500 mt-1 leading-relaxed" data-testid="text-activate-subtitle">
                    Broadcast your personalized trust scores across the nostr ecosystem.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="px-6 pb-3 space-y-2" data-testid="accordion-activate-sections">
            {sections.map((section) => {
              const isExpanded = expandedSection === section.key;
              return (
                <div
                  key={section.key}
                  className="rounded-xl border border-slate-200/70 bg-white/60 backdrop-blur-sm overflow-hidden transition-all duration-200 cursor-pointer hover:bg-slate-50/60"
                  onClick={() => toggleSection(section.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSection(section.key); } }}
                  data-testid={`section-activate-${section.key}`}
                >
                  <div
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    data-testid={`button-toggle-${section.key}`}
                  >
                    <div className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#3730a3] shrink-0">
                      {section.icon}
                    </div>
                    <span className="text-sm font-semibold text-slate-800 flex-1">{section.title}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 ml-10" onClick={(e) => e.stopPropagation()} data-testid={`content-${section.key}`}>
                      {section.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-6 pb-2">
            <div className="flex items-center gap-3 px-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Supported by</span>
              <div className="flex items-center gap-2">
                <a href="https://amethyst.social/#" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-100 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors" data-testid="link-modal-amethyst">
                  Amethyst
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
                <a href="https://www.nostria.app/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-100 text-orange-700 text-xs font-semibold hover:bg-orange-100 transition-colors" data-testid="link-modal-nostria">
                  Nostria
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-2">
            <div className="border-t border-slate-200/60 pt-4">
              {activateState === "success" ? (
                <div
                  className="flex items-center justify-center gap-3 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700"
                  data-testid="status-activate-success"
                >
                  <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm font-bold">You're all set! Brainstorm is now your service provider.</span>
                </div>
              ) : activateState === "cancelled" ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700"
                    data-testid="status-activate-cancelled"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium">Signing was cancelled. You can try again whenever you're ready.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleActivate}
                    className="w-full h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white font-bold text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 flex items-center justify-center gap-2"
                    data-testid="button-activate-retry"
                  >
                    Try Again
                  </button>
                </div>
              ) : activateState === "error" ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700"
                    data-testid="status-activate-error"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium">{errorMessage || "Something went wrong. Please try again."}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleActivate}
                    className="w-full h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white font-bold text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 flex items-center justify-center gap-2"
                    data-testid="button-activate-retry"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleActivate}
                  disabled={activateState === "signing" || activateState === "publishing"}
                  className="w-full h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 flex items-center justify-center gap-2"
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
                      <BrainLogo size={16} className="text-white/80" />
                      Select Brainstorm as my Service Provider
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
