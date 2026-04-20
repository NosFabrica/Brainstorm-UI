import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Copy, ExternalLink, Info, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { apiClient } from "@/services/api";
import { FEATURES } from "@/config/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const LS_PUBKEY = "brainstorm_assistant_pubkey";
const LS_EVENT_ID = "brainstorm_assistant_event_id";
const LS_PUBLISHED_AT = "brainstorm_assistant_published_at";
const LS_FIRST_DONE = "brainstorm_assistant_first_publish_done";

interface PublishedState {
  pubkey: string;
  npub: string;
  eventId: string;
  publishedAt: number;
}

function readPublishedState(): PublishedState | null {
  try {
    const pubkey = localStorage.getItem(LS_PUBKEY);
    const eventId = localStorage.getItem(LS_EVENT_ID);
    const publishedAtStr = localStorage.getItem(LS_PUBLISHED_AT);
    if (!pubkey || !eventId || !publishedAtStr) return null;
    let npub = pubkey;
    try { npub = nip19.npubEncode(pubkey); } catch {}
    return { pubkey, npub, eventId, publishedAt: Number(publishedAtStr) || Date.now() };
  } catch {
    return null;
  }
}

function writePublishedState(s: PublishedState) {
  try {
    localStorage.setItem(LS_PUBKEY, s.pubkey);
    localStorage.setItem(LS_EVENT_ID, s.eventId);
    localStorage.setItem(LS_PUBLISHED_AT, String(s.publishedAt));
    // Same-tab notification — `storage` events only fire across tabs.
    window.dispatchEvent(new CustomEvent("brainstorm-assistant-updated"));
  } catch {}
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export interface BrainstormAssistantCardProps {
  variant: "dashboard" | "settings";
  onDismiss?: () => void;
  lastCalculated?: string | number | null;
}

export function BrainstormAssistantCard({ variant, onDismiss, lastCalculated }: BrainstormAssistantCardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [published, setPublished] = useState<PublishedState | null>(() => readPublishedState());
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_PUBKEY || e.key === LS_EVENT_ID || e.key === LS_PUBLISHED_AT) {
        setPublished(readPublishedState());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const publishMutation = useMutation({
    mutationFn: async () => apiClient.publishDefaultAssistantProfile(),
    onSuccess: (resp) => {
      // Backend may return the payload either at the top level or wrapped under `data`.
      const top = resp || {};
      const wrapped = resp?.data || {};
      const pubkey = top.assistant_pubkey || wrapped.assistant_pubkey;
      const eventId = top.event_id || wrapped.event_id;
      const assistantName = (top.name || wrapped.name || "Your Brainstorm Assistant").toString();
      if (!pubkey || !eventId) {
        setError("The assistant was published, but no identity was returned. Please try again.");
        return;
      }
      const state: PublishedState = {
        pubkey,
        npub: (() => { try { return nip19.npubEncode(pubkey); } catch { return pubkey; } })(),
        eventId,
        publishedAt: Date.now(),
      };
      writePublishedState(state);
      setPublished(state);
      setError(null);

      const isFirst = !localStorage.getItem(LS_FIRST_DONE);
      if (isFirst) {
        try { localStorage.setItem(LS_FIRST_DONE, String(Date.now())); } catch {}
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3500);
        toast({
          title: `🎉 ${assistantName} is live on Nostr!`,
          description: "Tap \"View on Nostr\" to say hi to your new sidekick.",
          duration: 6000,
        });
      } else {
        toast({ title: `${assistantName} updated`, description: "Your assistant profile was republished." });
      }
    },
    onError: (err: Error) => {
      setError(err?.message || "Could not publish your assistant. Please try again.");
    },
  });

  const handlePublish = useCallback(() => {
    setError(null);
    publishMutation.mutate();
  }, [publishMutation]);

  const handleCopyNpub = useCallback(() => {
    if (!published?.npub) return;
    navigator.clipboard.writeText(published.npub).then(
      () => toast({ title: "Copied!", description: "Assistant npub copied to clipboard." }),
      () => toast({ title: "Copy failed", description: "Could not copy to clipboard. Please copy manually.", variant: "destructive" }),
    );
  }, [published?.npub, toast]);

  const handleCustomize = useCallback(() => {
    if (FEATURES.agentSuite) navigate("/agentsuite");
  }, [navigate]);

  const njumpUrl = useMemo(() => published?.eventId ? `https://njump.me/${published.eventId}` : null, [published?.eventId]);

  const lastCalcTs = useMemo(() => {
    if (!lastCalculated) return null;
    if (typeof lastCalculated === "number") return lastCalculated;
    const s = lastCalculated.endsWith?.("Z") ? lastCalculated : lastCalculated + "Z";
    const t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }, [lastCalculated]);

  const isFresh = lastCalcTs ? (Date.now() - lastCalcTs) < 24 * 60 * 60 * 1000 : false;

  const isPending = publishMutation.isPending;
  const isActive = !!published;

  return (
    <div
      className={
        "rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 transition-all duration-500 relative " +
        (showCelebration ? "ring-2 ring-amber-300/60 shadow-[0_0_30px_rgba(252,211,77,0.4)]" : "")
      }
      data-testid={`card-brainstorm-assistant-${variant}`}
    >
      <div className="relative h-20 sm:h-24 bg-gradient-to-br from-[#7c86ff] via-[#5b63d9] to-[#333286] overflow-hidden">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.4),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.25),transparent_50%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        {variant === "dashboard" && onDismiss && !isActive && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-1 right-1 sm:top-2 sm:right-2 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 text-[11px] font-semibold tracking-wide text-white/80 hover:text-white transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Dismiss Brainstorm Assistant card"
            data-testid={`button-assistant-dismiss-${variant}`}
          >
            Maybe later
          </button>
        )}
      </div>

      <div className="px-5 pb-5 -mt-10 sm:-mt-12 relative">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-br from-white to-indigo-50 border-4 border-white shadow-lg flex items-center justify-center shrink-0" data-testid={`avatar-assistant-${variant}`}>
            <BrainLogo size={variant === "dashboard" ? 32 : 36} className="text-[#333286]" />
          </div>
          {isActive && (
            <div className="flex items-center gap-1.5 mb-1" data-testid={`status-assistant-${variant}`}>
              <span className={"h-1.5 w-1.5 rounded-full " + (isFresh ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
              <span className={"text-[10px] font-bold uppercase tracking-widest " + (isFresh ? "text-emerald-700" : "text-slate-500")}>
                {isFresh ? "Live" : "Active"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid={`text-assistant-title-${variant}`}>
            Your Brainstorm Assistant
          </h3>
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            onBlur={() => setTimeout(() => setShowInfo(false), 200)}
            className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] -m-3 sm:-m-2 rounded-full text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/40"
            aria-label="What is the Brainstorm Assistant?"
            aria-expanded={showInfo}
            aria-controls={`assistant-info-popover-${variant}`}
            data-testid={`button-assistant-info-${variant}`}
          >
            <span className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center" aria-hidden="true">
              <Info className="h-3 w-3" />
            </span>
            {showInfo && (
              <div
                id={`assistant-info-popover-${variant}`}
                role="tooltip"
                className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-2 w-72 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-left text-[11px] leading-relaxed text-slate-200 cursor-default"
                data-testid={`tooltip-assistant-info-${variant}`}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="font-bold text-white mb-1.5">What is this?</p>
                <p className="mb-2">A small bot that publishes <span className="font-semibold text-indigo-200">your trust scores</span> to Nostr, so any compatible client can read them as you.</p>
                <p className="font-bold text-white mb-1">It does NOT</p>
                <p className="mb-2">touch your main Nostr identity, sign on your behalf, or post anything else.</p>
                <p className="font-bold text-white mb-1">You stay in control</p>
                <p>Brainstorm holds the assistant's signing key so it can publish on your schedule. You can republish or remove it anytime.</p>
              </div>
            )}
          </button>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-3" data-testid={`text-assistant-tagline-${variant}`}>
          {isActive ? "Your sidekick is publishing your trust scores to Nostr." : "Give your trust scores a voice on Nostr — one click."}
        </p>

        {isActive ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur-sm px-3 py-2.5 space-y-2" data-testid={`details-assistant-${variant}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assistant npub</span>
                <button
                  type="button"
                  onClick={handleCopyNpub}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-700 hover:text-[#333286] transition-colors group/copy py-2 -my-2 rounded focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/40"
                  data-testid={`button-copy-assistant-npub-${variant}`}
                  aria-label={`Copy assistant npub ${published?.npub || ""}`}
                  title={published?.npub}
                >
                  <span data-testid={`text-assistant-npub-${variant}`}>{published?.npub.slice(0, 12)}…{published?.npub.slice(-6)}</span>
                  <Copy className="h-3 w-3 opacity-50 group-hover/copy:opacity-100" />
                </button>
              </div>
              {published?.publishedAt && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Published</span>
                  <span className="text-[11px] text-slate-600" data-testid={`text-assistant-published-${variant}`}>{formatRelative(published.publishedAt)}</span>
                </div>
              )}
              {lastCalcTs && (
                <div className="flex items-center justify-between gap-2" data-testid={`row-assistant-last-calc-${variant}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last attestation run</span>
                  <span className="text-[11px] text-slate-600">{formatRelative(lastCalcTs)}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid={`alert-assistant-error-${variant}`}>
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {njumpUrl && (
                <a
                  href={njumpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-xs font-semibold transition-colors min-h-[44px]"
                  data-testid={`link-assistant-view-event-${variant}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View on Nostr
                </a>
              )}
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[44px]"
                data-testid={`button-assistant-republish-${variant}`}
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Republish
              </button>
              {FEATURES.agentSuite ? (
                <button
                  type="button"
                  onClick={handleCustomize}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#7c86ff]/30 bg-white text-[#333286] text-xs font-semibold transition-colors hover:bg-[#7c86ff]/5 min-h-[44px]"
                  data-testid={`button-assistant-customize-${variant}`}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Customize
                </button>
              ) : (
                <TooltipProvider delayDuration={150}>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#7c86ff]/20 bg-white text-[#333286]/60 text-xs font-semibold opacity-70 cursor-not-allowed min-h-[44px]"
                        aria-disabled="true"
                        tabIndex={0}
                        data-testid={`button-assistant-customize-${variant}`}
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Customize (soon)
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs" data-testid={`tooltip-assistant-customize-${variant}`}>
                      Coming soon in Agent Suite
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5" data-testid={`text-assistant-safety-${variant}`}>
              <Sparkles className="h-3 w-3 text-[#7c86ff] mt-0.5 shrink-0" />
              <span>This <span className="font-semibold text-slate-700">does not</span> affect your main Nostr identity — Brainstorm publishes from a dedicated assistant key.</span>
            </p>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid={`alert-assistant-error-${variant}`}>
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPending}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[44px] shadow-lg shadow-[#3730a3]/20"
                data-testid={`button-assistant-publish-${variant}`}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <BrainLogo size={14} className="text-white/90" />
                    Publish my Assistant
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
