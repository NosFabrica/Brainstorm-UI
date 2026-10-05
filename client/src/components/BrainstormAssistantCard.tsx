import { useCallback, useEffect, useMemo, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { getProfilePicture, type ProfileContent } from "applesauce-core/helpers/profile";
import { ArrowRight, Copy, ExternalLink, Globe, Info, Loader2, Quote, RefreshCw, Wand2 } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { apiClient } from "@/services/api";
import { fetchAssistantPointer } from "@/services/nostr";
import { activePubkey } from "@/accounts/display";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { followUser } from "@/services/socialActions";
import { ensureAssistantPublished } from "@/lib/assistantPublish";
import { FEATURES } from "@/config/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ASSISTANT_UPDATED_EVENT,
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

/**
 * A kind-0 as this card stores it. `AssistantProfile` is a storage shape — it is
 * written to localStorage for the synchronous first paint — so it is a plain
 * subset of `ProfileContent` rather than a second idea of what a profile is.
 */
function toAssistantProfile(content: ProfileContent): AssistantProfile {
  const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  return {
    name: text(content.name),
    display_name: text(content.display_name),
    about: text(content.about),
    website: text(content.website),
    picture: text(getProfilePicture(content) || content.picture),
    banner: text((content as { banner?: unknown }).banner),
    nip05: text(content.nip05),
  };
}

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

export function BrainstormAssistantCard({
  variant,
  prominence = "default",
  onDismiss,
  lastCalculated,
}: BrainstormAssistantCardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const reduceMotion = usePrefersReducedMotion();
  const [published, setPublished] = useState<PublishedState | null>(() => readPublishedAssistant());
  const [profile, setProfile] = useState<AssistantProfile | null>(() => readAssistantProfile());
  const userPubkey = useActiveAccountDisplay()?.pubkey ?? null;
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
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(ASSISTANT_UPDATED_EVENT, refresh as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ASSISTANT_UPDATED_EVENT, refresh as EventListener);
    };
  }, [userPubkey]);

  // Cross-device sync (Task #86): when this device has no local pointer for
  // the current user, query Nostr for the user's NIP-78 assistant pointer
  // event. If one exists, hydrate local state so the active card appears
  // automatically without re-publishing.
  useEffect(() => {
    if (!userPubkey || published) return;
    let cancelled = false;
    (async () => {
      const remote = await fetchAssistantPointer(userPubkey);
      if (cancelled || !remote) return;
      // Re-check local in case a publish raced us.
      if (readPublishedAssistant()) return;
      // Make sure the user hasn't changed while we were awaiting.
      if (activePubkey() !== userPubkey) return;
      let npub = remote.pubkey;
      try {
        npub = nip19.npubEncode(remote.pubkey);
      } catch {}
      const state: PublishedState = {
        pubkey: remote.pubkey,
        npub,
        eventId: remote.eventId,
        publishedAt: remote.publishedAt,
      };
      writePublishedAssistant(state);
      setPublished(state);
      // Ensure the user follows their own (already-published) assistant.
      followUser(state.pubkey).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [userPubkey, published]);

  // The assistant's kind-0, live: a later republish reaches this card without a reload.
  const { profile: assistantProfile } = useLiveProfile(published?.pubkey);

  useEffect(() => {
    if (!published?.pubkey || !assistantProfile) return;
    let cancelled = false;
    (async () => {
      try {
        const next = toAssistantProfile(assistantProfile);
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
    return () => {
      cancelled = true;
    };
  }, [published?.pubkey, published?.publishedAt, assistantProfile]);

  const publishMutation = useMutation({
    // Explicit user action: always (re)publish, and DO follow the bot (consent).
    // Side-effects (persist + NIP-78 pointer + follow) live in the shared helper.
    mutationFn: async () => ensureAssistantPublished({ follow: true, skipIfPublished: false }),
    onSuccess: ({ state, name }) => {
      setPublished(state);
      setError(null);

      const isFirst = !readFirstPublishDone();
      if (isFirst) {
        setFirstPublishDone();
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3500);
        toast({
          title: `${name} is live on Nostr!`,
          description: 'Tap "View on Nostr" to say hi to your new sidekick.',
          duration: 6000,
        });
      } else {
        toast({ title: `${name} updated`, description: "Your assistant profile was republished." });
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
    copyToClipboard(published.npub).then(
      () => toast({ title: "Copied!", description: "Assistant npub copied to clipboard." }),
      () =>
        toast({
          title: "Copy failed",
          description: "Could not copy to clipboard. Please copy manually.",
          variant: "destructive",
        }),
    );
  }, [published?.npub, toast]);

  const handleCustomize = useCallback(() => {
    if (FEATURES.agentSuite) navigate("/agentsuite");
  }, [navigate]);

  const njumpUrl = useMemo(
    () => (published?.eventId ? `https://njump.me/${published.eventId}` : null),
    [published?.eventId],
  );

  const lastCalcTs = useMemo(() => {
    if (!lastCalculated) return null;
    if (typeof lastCalculated === "number") return lastCalculated;
    const s = lastCalculated.endsWith?.("Z") ? lastCalculated : lastCalculated + "Z";
    const t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }, [lastCalculated]);

  const isFresh = lastCalcTs ? Date.now() - lastCalcTs < 24 * 60 * 60 * 1000 : false;

  const isPending = publishMutation.isPending;
  const isActive = !!published;
  const isHighlighted = prominence === "highlighted" && !isActive;

  return (
    <div
      className={
        "group relative rounded-2xl border border-brand-accent/20 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgb(var(--brand-accent)/0.07)] backdrop-blur-xl transition-all duration-500 hover:border-brand-accent/40 hover:shadow-[0_20px_40px_-12px_rgb(var(--brand-accent)/0.25)] dark:from-slate-900/95 dark:via-slate-900/80 " +
        (showCelebration ? "shadow-[0_0_30px_rgba(252,211,77,0.4)] ring-2 ring-amber-300/60" : "")
      }
      data-testid={`card-brainstorm-assistant-${variant}`}
    >
      <div
        className={
          (variant === "settings" ? "relative h-24 sm:h-32 md:h-36 " : "relative h-20 sm:h-24 ") +
          "overflow-hidden rounded-t-2xl bg-gradient-to-br from-brand-accent via-brand-accent-hover to-brand-deep"
        }
      >
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
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
              data-testid={`img-assistant-banner-${variant}`}
            />
          );
        })()}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-accent/40 via-brand-accent-hover/30 to-brand-deep/55 mix-blend-multiply" />
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.4),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.25),transparent_50%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        {variant === "dashboard" && onDismiss && !isActive && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-2 top-2 z-10 inline-flex min-h-[36px] items-center justify-center rounded-full border border-white/60 bg-white/95 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-slate-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-white/60 sm:right-3 sm:top-3"
            aria-label="Dismiss Brainstorm Assistant card"
            data-testid={`button-assistant-dismiss-${variant}`}
          >
            Maybe later
          </button>
        )}
      </div>

      <div
        className={
          (variant === "settings" ? "-mt-12 px-5 pb-6 sm:-mt-16 sm:px-7 sm:pb-7 " : "-mt-10 px-5 pb-5 sm:-mt-12 ") +
          "relative"
        }
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <div
            className={
              (variant === "settings" ? "h-20 w-20 sm:h-24 sm:w-24 " : "h-16 w-16 sm:h-20 sm:w-20 ") +
              "flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-white to-brand-primary/10 shadow-lg"
            }
            data-testid={`avatar-assistant-${variant}`}
          >
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
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                    data-testid={`img-assistant-avatar-${variant}`}
                  />
                );
              }
              return (
                <BrainLogo
                  size={variant === "settings" ? 44 : variant === "dashboard" ? 32 : 36}
                  className="text-brand-deep"
                />
              );
            })()}
          </div>
          {isActive && (
            <div className="mb-1 flex items-center gap-1.5" data-testid={`status-assistant-${variant}`}>
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (isFresh ? "animate-pulse bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")
                }
              />
              <span
                className={
                  "text-[10px] font-bold uppercase tracking-widest " +
                  (isFresh ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")
                }
              >
                {isFresh ? "Live" : "Active"}
              </span>
            </div>
          )}
        </div>

        {isHighlighted && (
          <div className="mb-1.5 inline-flex items-center gap-1.5" data-testid={`eyebrow-assistant-${variant}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-deep">
              Recommended next step
            </span>
          </div>
        )}
        <div className="mb-1 flex items-center gap-2">
          <h3
            className={
              (variant === "settings"
                ? "text-xl sm:text-2xl md:text-3xl"
                : isHighlighted
                  ? "text-lg sm:text-xl"
                  : "text-base sm:text-lg") + " font-bold tracking-tight text-slate-900 dark:text-slate-100"
            }
            style={{ fontFamily: "var(--font-display)" }}
            data-testid={`text-assistant-title-${variant}`}
          >
            Your Brainstorm Assistant
          </h3>
          <Popover open={showInfo} onOpenChange={setShowInfo}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative -m-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 dark:text-slate-500 dark:hover:text-slate-300 sm:-m-2"
                aria-label="What is the Brainstorm Assistant?"
                data-testid={`button-assistant-info-${variant}`}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
                  aria-hidden="true"
                >
                  <Info className="h-3 w-3" />
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="center"
              sideOffset={8}
              collisionPadding={12}
              className="z-50 w-72 rounded-xl border border-white/15 bg-slate-900/95 p-3 text-left text-[11px] leading-relaxed text-slate-200 shadow-2xl backdrop-blur-xl"
              data-testid={`tooltip-assistant-info-${variant}`}
            >
              <p className="mb-1.5 font-bold text-white">What is this?</p>
              <p className="mb-2">
                A small bot that publishes <span className="font-semibold text-brand-link">your scores</span> to Nostr,
                so any compatible client can read them as you.
              </p>
              <p className="mb-1 font-bold text-white">It does NOT</p>
              <p className="mb-2">touch your main Nostr identity, sign on your behalf, or post anything else.</p>
              <p className="mb-1 font-bold text-white">You stay in control</p>
              <p>
                Brainstorm holds the assistant's signing key so it can publish on your schedule. You can republish or
                remove it anytime.
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <p
          className={
            (variant === "settings" ? "text-sm sm:text-base " : "text-xs sm:text-sm ") +
            "mb-4 leading-relaxed text-slate-500 dark:text-slate-400"
          }
          data-testid={`text-assistant-tagline-${variant}`}
        >
          {isActive ? "Your sidekick is publishing your scores." : "Give your scores a voice — one click."}
        </p>

        {isActive ? (
          <div className={variant === "settings" ? "space-y-5" : "space-y-3"}>
            <div
              className={
                variant === "settings"
                  ? "space-y-3 lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-5 lg:space-y-0"
                  : "space-y-3"
              }
            >
              {(profile?.display_name || profile?.name || profile?.about || profile?.website) && (
                <div
                  className="relative overflow-hidden rounded-xl border border-brand-accent/20 bg-gradient-to-br from-white to-brand-primary/10 px-4 py-3.5 dark:from-slate-900"
                  data-testid={`profile-assistant-${variant}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-gradient-to-b from-brand-accent to-brand-deep"
                  />
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4
                          className="truncate text-sm font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-[15px]"
                          title={profile?.display_name || profile?.name}
                          data-testid={`text-assistant-display-name-${variant}`}
                        >
                          {profile?.display_name || profile?.name}
                        </h4>
                        {profile?.nip05 && (
                          <p
                            className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400"
                            data-testid={`text-assistant-nip05-${variant}`}
                          >
                            {profile.nip05}
                          </p>
                        )}
                      </div>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-accent/20 bg-brand-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-deep"
                        data-testid={`badge-assistant-bot-${variant}`}
                      >
                        <span className="h-1 w-1 rounded-full bg-brand-accent" />
                        Bot
                      </span>
                    </div>

                    {profile?.about && (
                      <div className="relative pl-4" data-testid={`text-assistant-about-${variant}`}>
                        <Quote className="absolute -left-0.5 top-0 h-3 w-3 text-brand-accent/50" aria-hidden="true" />
                        <p className="text-[12px] italic leading-relaxed text-slate-600 dark:text-slate-300">
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
                          rel="noopener"
                          className="group/site inline-flex items-center gap-1.5 rounded text-[11px] font-semibold text-brand-deep transition-colors hover:text-brand-link focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
                          data-testid={`link-assistant-website-${variant}`}
                        >
                          <Globe className="h-3 w-3" />
                          <span className="underline decoration-brand-accent/40 underline-offset-2 group-hover/site:decoration-brand-link">
                            {w.label}
                          </span>
                          <ExternalLink className="h-3 w-3 opacity-60 group-hover/site:opacity-100" />
                        </a>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div
                className="space-y-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/70"
                data-testid={`details-assistant-${variant}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Assistant npub
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyNpub}
                    className="group/copy -my-2 inline-flex items-center gap-1.5 rounded py-2 font-mono text-[11px] text-slate-700 transition-colors hover:text-brand-deep focus:outline-none focus:ring-2 focus:ring-brand-accent/40 dark:text-slate-200"
                    data-testid={`button-copy-assistant-npub-${variant}`}
                    aria-label={`Copy assistant npub ${published?.npub || ""}`}
                    title={published?.npub}
                  >
                    <span data-testid={`text-assistant-npub-${variant}`}>
                      {published?.npub.slice(0, 12)}…{published?.npub.slice(-6)}
                    </span>
                    <Copy className="h-3 w-3 opacity-50 group-hover/copy:opacity-100" />
                  </button>
                </div>
                {published?.publishedAt && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Published
                    </span>
                    <span
                      className="text-[11px] text-slate-600 dark:text-slate-300"
                      data-testid={`text-assistant-published-${variant}`}
                    >
                      {formatRelative(published.publishedAt)}
                    </span>
                  </div>
                )}
                {lastCalcTs && (
                  <div
                    className="flex items-center justify-between gap-2"
                    data-testid={`row-assistant-last-calc-${variant}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Last attestation run
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">{formatRelative(lastCalcTs)}</span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/25 dark:bg-red-500/10"
                data-testid={`alert-assistant-error-${variant}`}
              >
                <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {published?.npub && (
                <button
                  type="button"
                  onClick={() => navigate(`/p/${published.npub}`)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
                  data-testid={`button-assistant-view-profile-${variant}`}
                >
                  <BrainLogo mono size={12} className="text-white" />
                  View assistant profile
                </button>
              )}
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPending}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                data-testid={`button-assistant-republish-${variant}`}
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Republish
              </button>
              {njumpUrl && (
                <a
                  href={njumpUrl}
                  target="_blank"
                  rel="noopener"
                  className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-2 text-[11px] font-medium text-slate-500 transition-colors hover:text-brand-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-400"
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
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-brand-accent/30 bg-white px-3 py-2 text-xs font-semibold text-brand-deep transition-colors hover:bg-brand-accent/5 dark:bg-slate-900"
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
                        className="inline-flex min-h-[44px] cursor-not-allowed items-center gap-1.5 rounded-xl border border-brand-accent/20 bg-white px-3 py-2 text-xs font-semibold text-brand-deep/60 opacity-70 dark:bg-slate-900"
                        aria-disabled="true"
                        tabIndex={0}
                        data-testid={`button-assistant-customize-${variant}`}
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Customize (soon)
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="text-xs"
                      data-testid={`tooltip-assistant-customize-${variant}`}
                    >
                      Coming soon in Agent Suite
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p
              className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400"
              data-testid={`text-assistant-safety-${variant}`}
            >
              This <span className="font-semibold text-slate-700 dark:text-slate-200">does not</span> affect your main
              Nostr identity — Brainstorm publishes from a dedicated assistant key.
            </p>

            {error && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/25 dark:bg-red-500/10"
                data-testid={`alert-assistant-error-${variant}`}
              >
                <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <div
              className={
                "flex flex-col items-stretch gap-2 sm:flex-row sm:items-center " + (isHighlighted ? "pt-1" : "")
              }
            >
              {isHighlighted ? (
                <motion.div
                  className="relative flex-1 sm:flex-none"
                  initial={false}
                  animate={
                    reduceMotion
                      ? undefined
                      : {
                          boxShadow: [
                            "0 0 0px 0px rgb(var(--brand-accent)/0.00), 0 14px 30px -14px rgb(var(--brand-link)/0.45)",
                            "0 0 22px 6px rgb(var(--brand-accent)/0.28), 0 18px 36px -14px rgb(var(--brand-link)/0.55)",
                            "0 0 0px 0px rgb(var(--brand-accent)/0.00), 0 14px 30px -14px rgb(var(--brand-link)/0.45)",
                          ],
                        }
                  }
                  transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                  style={{ borderRadius: "0.75rem" }}
                  whileHover={reduceMotion ? undefined : { y: -1.5 }}
                  whileTap={reduceMotion ? undefined : { y: 0, scale: 0.985 }}
                >
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPending}
                    className="group/cta relative inline-flex min-h-[48px] w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[linear-gradient(110deg,rgb(var(--brand-primary))_0%,rgb(var(--brand-primary-hover))_40%,rgb(var(--brand-accent))_100%)] bg-[length:200%_100%] px-6 py-3 text-sm font-bold text-white transition-[filter,background-position] duration-300 hover:bg-[position:100%_0] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-60"
                    data-testid={`button-assistant-publish-${variant}`}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(120deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] transition-transform duration-700 ease-out group-hover/cta:translate-x-full motion-reduce:hidden"
                    />
                    {isPending ? (
                      <>
                        <Loader2 className="relative z-10 h-4 w-4 animate-spin" />
                        <span className="relative z-10">Publishing...</span>
                      </>
                    ) : (
                      <>
                        <BrainLogo mono size={14} className="relative z-10 text-white" />
                        <span className="relative z-10">Publish my Assistant</span>
                        <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover/cta:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </motion.div>
              ) : (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPending}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-primary/20 transition-colors hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 sm:flex-none"
                  data-testid={`button-assistant-publish-${variant}`}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <BrainLogo mono size={14} className="text-white" />
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
