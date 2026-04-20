import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Copy, ExternalLink, Globe, Info, Loader2, Quote, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { apiClient } from "@/services/api";
import { fetchProfile } from "@/services/nostr";
import { FEATURES } from "@/config/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ASSISTANT_UPDATED_EVENT,
  USER_CHANGED_EVENT,
  readAssistantProfile,
  writeAssistantProfile,
  readPublishedAssistant,
  writePublishedAssistant,
  readFirstPublishDone,
  setFirstPublishDone,
  readPictureSet,
  setPictureSet,
  type AssistantProfile,
  type PublishedAssistantState as PublishedState,
} from "@/lib/assistantStorage";

const DEFAULT_ASSISTANT_PICTURE_PATH = "/assistant-default.webp";
const DEFAULT_ASSISTANT_BANNER_PATH = "/assistant-banner.webp";
function getDefaultAssistantPictureUrl(): string {
  if (typeof window === "undefined") return DEFAULT_ASSISTANT_PICTURE_PATH;
  return `${window.location.origin}${DEFAULT_ASSISTANT_PICTURE_PATH}`;
}
function getDefaultAssistantBannerUrl(): string {
  if (typeof window === "undefined") return DEFAULT_ASSISTANT_BANNER_PATH;
  return `${window.location.origin}${DEFAULT_ASSISTANT_BANNER_PATH}`;
}

function normalizeWebsite(url: string): { href: string; label: string } | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let label = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (label.length > 40) label = label.slice(0, 37) + "…";
  return { href, label };
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
  prominence?: "default" | "highlighted";
  onDismiss?: () => void;
  lastCalculated?: string | number | null;
}

export function BrainstormAssistantCard({ variant, prominence = "default", onDismiss, lastCalculated }: BrainstormAssistantCardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [published, setPublished] = useState<PublishedState | null>(() => readPublishedAssistant());
  const [profile, setProfile] = useState<AssistantProfile | null>(() => readAssistantProfile());
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPublished(readPublishedAssistant());
      setProfile(readAssistantProfile());
    };
    // Cross-tab key changes still arrive via the legacy `storage` listener,
    // and the per-user keys we now use share the same `brainstorm_assistant:`
    // prefix so we just refresh on any matching update.
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("brainstorm_assistant:")) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ASSISTANT_UPDATED_EVENT, refresh as EventListener);
    window.addEventListener(USER_CHANGED_EVENT, refresh as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ASSISTANT_UPDATED_EVENT, refresh as EventListener);
      window.removeEventListener(USER_CHANGED_EVENT, refresh as EventListener);
    };
  }, []);

  // Hydrate the assistant's kind-0 profile from relays so we can render
  // display name, about, and website elegantly in the active state.
  useEffect(() => {
    if (!published?.pubkey) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchProfile(published.pubkey);
        if (!p || cancelled) return;
        const next: AssistantProfile = {
          name: typeof (p as any).name === "string" ? (p as any).name : undefined,
          display_name: typeof (p as any).display_name === "string" ? (p as any).display_name : undefined,
          about: typeof (p as any).about === "string" ? (p as any).about : undefined,
          website: typeof (p as any).website === "string" ? (p as any).website : undefined,
          picture: typeof (p as any).picture === "string" ? (p as any).picture : undefined,
          banner: typeof (p as any).banner === "string" ? (p as any).banner : undefined,
          nip05: typeof (p as any).nip05 === "string" ? (p as any).nip05 : undefined,
        };
        setProfile(next);
        writeAssistantProfile(next);

        // If the assistant has no picture or banner set, publish a profile
        // update once with the Brainstorm-branded defaults so other Nostr
        // clients see a consistent identity. Best-effort: silently swallow
        // failures and keep the local fallback rendering.
        const alreadyTried = readPictureSet(published.pubkey);
        const needsPicture = !next.picture;
        const needsBanner = !next.banner;
        if ((needsPicture || needsBanner) && !alreadyTried) {
          setPictureSet(published.pubkey);
          const defaultPicture = needsPicture ? getDefaultAssistantPictureUrl() : next.picture;
          const defaultBanner = needsBanner ? getDefaultAssistantBannerUrl() : next.banner;
          try {
            await apiClient.publishBrainstormAssistantProfile({
              name: next.name,
              about: next.about,
              website: next.website,
              nip05: next.nip05,
              picture: defaultPicture,
              banner: defaultBanner,
            });
            if (cancelled) return;
            const merged: AssistantProfile = { ...next, picture: defaultPicture, banner: defaultBanner };
            setProfile(merged);
            writeAssistantProfile(merged);
          } catch {
            // Network/404/etc — keep local fallback rendering only.
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [published?.pubkey, published?.publishedAt]);

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
      writePublishedAssistant(state);
      setPublished(state);
      setError(null);

      const isFirst = !readFirstPublishDone();
      if (isFirst) {
        setFirstPublishDone();
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3500);
        toast({
          title: `${assistantName} is live on Nostr!`,
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
  const isHighlighted = prominence === "highlighted" && !isActive;

  return (
    <div
      className={
        "rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 transition-all duration-500 relative " +
        (showCelebration ? "ring-2 ring-amber-300/60 shadow-[0_0_30px_rgba(252,211,77,0.4)]" : "")
      }
      data-testid={`card-brainstorm-assistant-${variant}`}
    >
      <div className={(variant === "settings" ? "relative h-24 sm:h-32 md:h-36 " : "relative h-20 sm:h-24 ") + "bg-gradient-to-br from-[#7c86ff] via-[#5b63d9] to-[#333286] overflow-hidden rounded-t-2xl"}>
        {(() => {
          const bannerSrc = profile?.banner || getDefaultAssistantBannerUrl();
          if (!bannerSrc) return null;
          return (
            <img
              src={bannerSrc}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              data-testid={`img-assistant-banner-${variant}`}
            />
          );
        })()}
        <div className="absolute inset-0 bg-gradient-to-br from-[#7c86ff]/40 via-[#5b63d9]/30 to-[#333286]/55 mix-blend-multiply pointer-events-none" />
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.4),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.25),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        {variant === "dashboard" && onDismiss && !isActive && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 inline-flex items-center justify-center min-h-[36px] px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-slate-700 hover:text-slate-900 bg-white/95 hover:bg-white border border-white/60 shadow-md rounded-full backdrop-blur-sm transition-colors focus:outline-none focus:ring-2 focus:ring-white/60"
            aria-label="Dismiss Brainstorm Assistant card"
            data-testid={`button-assistant-dismiss-${variant}`}
          >
            Maybe later
          </button>
        )}
      </div>

      <div className={(variant === "settings" ? "px-5 sm:px-7 pb-6 sm:pb-7 -mt-12 sm:-mt-16 " : "px-5 pb-5 -mt-10 sm:-mt-12 ") + "relative"}>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className={(variant === "settings" ? "h-20 w-20 sm:h-24 sm:w-24 " : "h-16 w-16 sm:h-20 sm:w-20 ") + "rounded-full bg-gradient-to-br from-white to-indigo-50 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center shrink-0"} data-testid={`avatar-assistant-${variant}`}>
            {(() => {
              const pic = profile?.picture || getDefaultAssistantPictureUrl();
              if (pic) {
                return (
                  <img
                    src={pic}
                    alt="Brainstorm Assistant avatar"
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    data-testid={`img-assistant-avatar-${variant}`}
                  />
                );
              }
              return <BrainLogo size={variant === "settings" ? 44 : variant === "dashboard" ? 32 : 36} className="text-[#333286]" />;
            })()}
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

        {isHighlighted && (
          <div className="inline-flex items-center gap-1.5 mb-1.5" data-testid={`eyebrow-assistant-${variant}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#7c86ff]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#333286]">Recommended next step</span>
          </div>
        )}
        <div className="flex items-center gap-2 mb-1">
          <h3 className={(variant === "settings" ? "text-xl sm:text-2xl md:text-3xl" : isHighlighted ? "text-lg sm:text-xl" : "text-base sm:text-lg") + " font-bold text-slate-900 tracking-tight"} style={{ fontFamily: "var(--font-display)" }} data-testid={`text-assistant-title-${variant}`}>
            Your Brainstorm Assistant
          </h3>
          <Popover open={showInfo} onOpenChange={setShowInfo}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] -m-3 sm:-m-2 rounded-full text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/40"
                aria-label="What is the Brainstorm Assistant?"
                data-testid={`button-assistant-info-${variant}`}
              >
                <span className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center" aria-hidden="true">
                  <Info className="h-3 w-3" />
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="center"
              sideOffset={8}
              collisionPadding={12}
              className="w-72 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-left text-[11px] leading-relaxed text-slate-200 z-50"
              data-testid={`tooltip-assistant-info-${variant}`}
            >
              <p className="font-bold text-white mb-1.5">What is this?</p>
              <p className="mb-2">A small bot that publishes <span className="font-semibold text-indigo-200">your trust scores</span> to Nostr, so any compatible client can read them as you.</p>
              <p className="font-bold text-white mb-1">It does NOT</p>
              <p className="mb-2">touch your main Nostr identity, sign on your behalf, or post anything else.</p>
              <p className="font-bold text-white mb-1">You stay in control</p>
              <p>Brainstorm holds the assistant's signing key so it can publish on your schedule. You can republish or remove it anytime.</p>
            </PopoverContent>
          </Popover>
        </div>
        <p className={(variant === "settings" ? "text-sm sm:text-base " : "text-xs sm:text-sm ") + "text-slate-500 leading-relaxed mb-4"} data-testid={`text-assistant-tagline-${variant}`}>
          {isActive ? "Your sidekick is publishing your trust scores to Nostr." : "Give your trust scores a voice on Nostr — one click."}
        </p>

        {isActive ? (
          <div className={(variant === "settings" ? "space-y-5" : "space-y-3")}>
            <div className={variant === "settings" ? "lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-5 space-y-3 lg:space-y-0" : "space-y-3"}>
            {(profile?.display_name || profile?.name || profile?.about || profile?.website) && (
              <div
                className="relative rounded-xl border border-[#7c86ff]/20 bg-gradient-to-br from-white to-indigo-50/40 px-4 py-3.5 overflow-hidden"
                data-testid={`profile-assistant-${variant}`}
              >
                <span aria-hidden="true" className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-gradient-to-b from-[#7c86ff] to-[#333286]" />
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4
                        className="text-sm sm:text-[15px] font-bold text-slate-900 tracking-tight leading-tight truncate"
                        title={profile?.display_name || profile?.name}
                        data-testid={`text-assistant-display-name-${variant}`}
                      >
                        {profile?.display_name || profile?.name}
                      </h4>
                      {profile?.nip05 && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5" data-testid={`text-assistant-nip05-${variant}`}>
                          {profile.nip05}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#7c86ff]/10 border border-[#7c86ff]/20 text-[9px] font-bold uppercase tracking-widest text-[#333286]" data-testid={`badge-assistant-bot-${variant}`}>
                      <span className="h-1 w-1 rounded-full bg-[#7c86ff]" />
                      Bot
                    </span>
                  </div>

                  {profile?.about && (
                    <div className="relative pl-4" data-testid={`text-assistant-about-${variant}`}>
                      <Quote className="absolute -left-0.5 top-0 h-3 w-3 text-[#7c86ff]/50" aria-hidden="true" />
                      <p className="text-[12px] leading-relaxed text-slate-600 italic">
                        {profile.about}
                      </p>
                    </div>
                  )}

                  {(() => {
                    const w = profile?.website ? normalizeWebsite(profile.website) : null;
                    if (!w) return null;
                    return (
                      <a
                        href={w.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#333286] hover:text-[#3730a3] transition-colors group/site focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/40 rounded"
                        data-testid={`link-assistant-website-${variant}`}
                      >
                        <Globe className="h-3 w-3" />
                        <span className="underline decoration-[#7c86ff]/40 underline-offset-2 group-hover/site:decoration-[#3730a3]">{w.label}</span>
                        <ExternalLink className="h-3 w-3 opacity-60 group-hover/site:opacity-100" />
                      </a>
                    );
                  })()}
                </div>
              </div>
            )}

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
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid={`alert-assistant-error-${variant}`}>
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {published?.npub && (
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${published.npub}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-xs font-semibold transition-colors min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c86ff]/50"
                  data-testid={`button-assistant-view-profile-${variant}`}
                >
                  <BrainLogo size={12} className="text-white/95" />
                  View assistant profile
                </button>
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
              {njumpUrl && (
                <a
                  href={njumpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#333286] transition-colors py-2 px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c86ff]/40 rounded"
                  data-testid={`link-assistant-view-event-${variant}`}
                  title="Open the published event on njump"
                >
                  <ExternalLink className="h-3 w-3" />
                  View on Nostr
                </a>
              )}
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
            <p className="text-[11px] text-slate-500 leading-relaxed" data-testid={`text-assistant-safety-${variant}`}>
              This <span className="font-semibold text-slate-700">does not</span> affect your main Nostr identity — Brainstorm publishes from a dedicated assistant key.
            </p>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid={`alert-assistant-error-${variant}`}>
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className={"flex flex-col sm:flex-row items-stretch sm:items-center gap-2 " + (isHighlighted ? "pt-1" : "") }>
              {isHighlighted ? (
                <motion.div
                  className="relative flex-1 sm:flex-none"
                  initial={false}
                  animate={reduceMotion ? undefined : {
                    boxShadow: [
                      "0 0 0px 0px rgba(124,134,255,0.00), 0 14px 30px -14px rgba(55,48,163,0.45)",
                      "0 0 22px 6px rgba(124,134,255,0.28), 0 18px 36px -14px rgba(55,48,163,0.55)",
                      "0 0 0px 0px rgba(124,134,255,0.00), 0 14px 30px -14px rgba(55,48,163,0.45)",
                    ],
                  }}
                  transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                  style={{ borderRadius: "0.75rem" }}
                  whileHover={reduceMotion ? undefined : { y: -1.5 }}
                  whileTap={reduceMotion ? undefined : { y: 0, scale: 0.985 }}
                >
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPending}
                    className="group/cta relative w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-bold transition-[filter,background-position] duration-300 disabled:opacity-60 disabled:pointer-events-none min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c86ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white overflow-hidden bg-[length:200%_100%] bg-[linear-gradient(110deg,#3730a3_0%,#5b63d9_45%,#7c86ff_75%,#5b63d9_100%)] hover:bg-[position:100%_0] hover:brightness-110"
                    data-testid={`button-assistant-publish-${variant}`}
                  >
                    {!reduceMotion && (
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full group-hover/cta:translate-x-full transition-transform duration-700 ease-out bg-[linear-gradient(120deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)]" />
                    )}
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin relative z-10" />
                        <span className="relative z-10">Publishing...</span>
                      </>
                    ) : (
                      <>
                        <BrainLogo size={14} className="text-white/95 relative z-10" />
                        <span className="relative z-10">Publish my Assistant</span>
                        <ArrowRight className="h-4 w-4 relative z-10 transition-transform duration-300 group-hover/cta:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </motion.div>
              ) : (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPending}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[44px] shadow-lg shadow-[#3730a3]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c86ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
