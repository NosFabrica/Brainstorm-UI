import { useMemo, useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  Image as ImageIcon,
  FileText,
  BadgeCheck,
  Globe,
  Zap,
  Copy,
  Check,
  ArrowRight,
  Wifi,
  Video as VideoIcon,
  Music as MusicIcon,
  Radio,
  Play,
} from "lucide-react";
import { decodeShareId, npubFromPubkey, nostrUriFor } from "@/lib/shareId";
import amethystLogoImg from "../assets/amethyst-logo.png";
import nostriaIconImg from "../assets/nostria-icon.png";
import { fetchProfileForShare, fetchRecentByKinds, fetchEventsByIds, fetchAddressableEvents, fetchProfileMap, PROFILE_RELAYS } from "@/services/nostr";
import { collectRefs, mentionPubkeysFromContent, type MinimalEvent } from "@/lib/noteRefs";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { ShareVideo } from "@/components/share/ShareVideo";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { copyToClipboard } from "@/lib/clipboard";
import { apiClient, hasSessionToken } from "@/services/api";
import { getVerifiedThreshold } from "@/services/trustThreshold";
import { loadPersonalization } from "@/lib/personalization";
import { ROLES } from "@/config/personalization";
import { extractImageUrls, extractVideoUrls, extractVideoPoster } from "@/lib/noteContent";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { ContentTeaserBlock } from "@/components/share/ContentTeaserBlock";
import { LinkedText } from "@/components/LinkedText";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { useShareMeta } from "@/hooks/useShareMeta";
import { BrainLogo } from "@/components/BrainLogo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC, initialsFor } from "@/lib/profileDefaults";

type ProfileContentLike = Record<string, string | undefined>;

function timeAgo(ts?: number): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 2592000)}mo`;
}

export default function SharePage() {
  const [, params] = useRoute("/p/:id");
  const rawId = params?.id || "";
  const decoded = useMemo(() => decodeShareId(rawId), [rawId]);
  const pubkey = decoded?.pubkey || "";
  const relayHints = decoded?.relays || [];
  const npub = pubkey ? safeNpub(pubkey) : "";
  const loggedIn = hasSessionToken();
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["share-profile", pubkey],
    queryFn: () => fetchProfileForShare(pubkey, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const overviewQuery = useQuery({
    queryKey: ["share-overview", pubkey],
    // Unwrap the { code, message, data } envelope → the inner overview object.
    queryFn: async () => (await apiClient.getUserOverview(pubkey))?.data ?? null,
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // House (NosFabrica / network) influence from our backend, via an
  // unauthenticated overview request (always the house POV). It's the secondary
  // "network view" for signed-in viewers; for logged-out viewers the primary
  // overview query already runs from the house POV, so this is a fallback only.
  const houseRankQuery = useQuery({
    queryKey: ["share-house-influence", pubkey],
    queryFn: () => apiClient.getHouseInfluence(pubkey),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Per-section stats give VERIFIED (web-of-trust) follower/following counts —
  // not the raw totals in the overview. Shared links show only the verified
  // numbers so the social proof reflects trusted accounts, not spam.
  const statsQuery = useQuery({
    queryKey: ["share-stats", pubkey],
    queryFn: () => apiClient.getUserStats(pubkey, { verified_threshold: getVerifiedThreshold() }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const notesQuery = useQuery({
    queryKey: ["share-notes", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [1, 6], 5, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const photosQuery = useQuery({
    queryKey: ["share-photos", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [20], 8, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const articlesQuery = useQuery({
    queryKey: ["share-articles", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [30023], 2, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const videosQuery = useQuery({
    queryKey: ["share-videos", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [21, 22], 2, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const musicQuery = useQuery({
    queryKey: ["share-music", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [31337], 3, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const liveQuery = useQuery({
    queryKey: ["share-live", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [30311], 1, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const profile = (profileQuery.data ?? {}) as ProfileContentLike;
  const displayName = profile.display_name || profile.name || (npub ? npub.slice(0, 12) + "…" : "Nostr profile");
  const overview = overviewQuery.data as { influence?: number | null; counts?: Record<string, number> } | undefined;
  // The overview score is viewer-relative: house/network POV when logged out,
  // the viewer's own web-of-trust POV when logged in. That's the primary ring.
  const score01 = typeof overview?.influence === "number" ? overview.influence : null;
  // Verified (web-of-trust) counts from the per-section stats endpoint.
  const stats = statsQuery.data?.data as
    | { followed_by?: { verified?: number }; following?: { verified?: number } }
    | undefined;
  const verifiedFollowers = typeof stats?.followed_by?.verified === "number" ? stats.followed_by.verified : null;
  const verifiedFollowing = typeof stats?.following?.verified === "number" ? stats.following.verified : null;
  // House influence (0–1) from the backend, house POV.
  const houseScore01 = useMemo(() => {
    const r = houseRankQuery.data;
    if (typeof r !== "number" || !Number.isFinite(r)) return null;
    return Math.min(1, Math.max(0, r));
  }, [houseRankQuery.data]);
  // We resolve kind-0 from relays; treat a profile the backend hasn't scored
  // (no house influence once that query settles) as "not yet indexed by
  // Brainstorm" so the UI can show the live-from-relays note.
  const foundViaRelays = !!profileQuery.data && houseRankQuery.isFetched && houseScore01 == null;
  // A shared link is public, so the badge ALWAYS shows the network (house) score
  // — the same number every recipient sees — never the viewer's personalized POV.
  // (When logged out, `score01` already equals the house score, so it's a safe
  // fallback if the dedicated house-influence query hasn't resolved.)
  const primaryScore01 = houseScore01 ?? (loggedIn ? null : score01);

  // Photos = images from kind-20 picture events (every imeta URL is a photo) +
  // images embedded in recent notes (MIME/extension-detected). Broken URLs that
  // fail to load are dropped via `brokenPhotos`.
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const photoUrls = useMemo(() => {
    const urls: string[] = [];
    for (const ev of photosQuery.data ?? []) urls.push(...extractImageUrls(ev.content, ev.tags, { allImeta: true }));
    for (const ev of notesQuery.data ?? []) urls.push(...extractImageUrls(ev.content, ev.tags));
    return Array.from(new Set(urls)).filter((u) => !brokenPhotos.has(u)).slice(0, 6);
  }, [photosQuery.data, notesQuery.data, brokenPhotos]);

  const articles = useMemo(
    () =>
      (articlesQuery.data ?? []).map((ev) => {
        const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1];
        return { id: ev.id, title: tag("title") || "Untitled", summary: tag("summary") || "", image: tag("image"), ts: ev.created_at };
      }),
    [articlesQuery.data],
  );

  const videos = useMemo(
    () =>
      (videosQuery.data ?? []).map((ev) => {
        const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1];
        return {
          id: ev.id,
          title: tag("title") || "",
          url: extractVideoUrls(ev.content, ev.tags)[0],
          poster: extractVideoPoster(ev.content, ev.tags),
          ts: ev.created_at,
        };
      }).filter((v) => v.url || v.poster),
    [videosQuery.data],
  );

  const tracks = useMemo(
    () =>
      (musicQuery.data ?? []).map((ev) => {
        const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1];
        return { id: ev.id, title: tag("title") || tag("subject") || "Track", artist: tag("creator") || tag("c"), cover: tag("image") || tag("cover"), ts: ev.created_at };
      }),
    [musicQuery.data],
  );

  const live = useMemo(() => {
    const ev = (liveQuery.data ?? [])[0];
    if (!ev) return null;
    const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1];
    return { id: ev.id, title: tag("title") || "Live stream", status: (tag("status") || "").toLowerCase(), image: tag("image"), ts: ev.created_at };
  }, [liveQuery.data]);

  // Rich-note references: collect the pubkeys + event ids the notes mention /
  // reply to / quote / repost, then resolve them in two batched relay queries so
  // the cards can show names, avatars, and embedded notes (Primal-style).
  const noteEvents = (notesQuery.data ?? []) as MinimalEvent[];
  const refs = useMemo(() => collectRefs(noteEvents), [noteEvents]);

  const refEventsQuery = useQuery({
    queryKey: ["share-ref-events", pubkey, refs.ids],
    queryFn: () => fetchEventsByIds(refs.ids, Array.from(new Set([...relayHints, ...PROFILE_RELAYS]))),
    enabled: !!pubkey && refs.ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const eventsById = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const ev of (refEventsQuery.data ?? []) as MinimalEvent[]) m.set(ev.id, ev);
    return m;
  }, [refEventsQuery.data]);

  // Addressable refs (NIP-23 articles etc.) referenced inside the notes.
  const addrEventsQuery = useQuery({
    queryKey: ["share-addr-events", pubkey, refs.addrs.map((a) => `${a.kind}:${a.pubkey}:${a.identifier}`).join(",")],
    queryFn: () => fetchAddressableEvents(refs.addrs, Array.from(new Set([...relayHints, ...PROFILE_RELAYS]))),
    enabled: !!pubkey && refs.addrs.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const addrByCoord = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    const src = addrEventsQuery.data as Map<string, MinimalEvent> | undefined;
    if (src) for (const [k, v] of src) m.set(k, v as MinimalEvent);
    return m;
  }, [addrEventsQuery.data]);

  // All pubkeys needing profiles = referenced pubkeys + authors of resolved events.
  const allRefPubkeys = useMemo(() => {
    const set = new Set<string>(refs.pubkeys);
    for (const ev of eventsById.values()) {
      set.add(ev.pubkey);
      // Resolve @names for anyone tagged inside a quoted/referenced note too.
      mentionPubkeysFromContent(ev.content).forEach((pk) => set.add(pk));
    }
    for (const ev of addrByCoord.values()) set.add(ev.pubkey);
    return Array.from(set);
  }, [refs.pubkeys, eventsById, addrByCoord]);

  const profilesQuery = useQuery({
    queryKey: ["share-ref-profiles", pubkey, allRefPubkeys],
    queryFn: () => fetchProfileMap(allRefPubkeys),
    enabled: !!pubkey && allRefPubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const noteProfiles = useMemo(
    () => (profilesQuery.data ?? new Map()) as Map<string, { name?: string; display_name?: string; picture?: string; nip05?: string }>,
    [profilesQuery.data],
  );

  // Roles ("what you do") from the user's local personalization prefs.
  const roleLabels = useMemo(() => {
    const prefs = loadPersonalization(pubkey);
    return prefs.roles.map((key) => ROLES.find((r) => r.key === key)?.label).filter(Boolean) as string[];
  }, [pubkey]);

  const canonicalUrl = typeof window !== "undefined" && npub ? `${window.location.origin}/p/${npub}` : "";

  // Remember the inviter (this profile) for logged-out visitors, so a new
  // account created later in the session auto-follows them even if the invite
  // query param is lost. Cleared on successful signup.
  useEffect(() => {
    if (!loggedIn && npub) {
      try { sessionStorage.setItem("brainstorm_pending_invite", npub); } catch {}
    }
  }, [loggedIn, npub]);

  useShareMeta(
    pubkey
      ? {
          title: `${displayName} on Brainstorm`,
          description: profile.about ? profile.about.slice(0, 160) : `${displayName}'s profile and Web-of-Trust score on Brainstorm.`,
          image: profile.picture,
          url: canonicalUrl,
        }
      : null,
  );

  const openInRef = useRef<HTMLElement>(null);
  const scrollToOpenIn = () => openInRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const copyLink = async () => {
    if (!canonicalUrl) return;
    const ok = await copyToClipboard(canonicalUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!decoded) {
    return <ShareShell><NotFoundCard rawId={rawId} /></ShareShell>;
  }

  const profileLoading = profileQuery.isLoading;
  const hasContent =
    (notesQuery.data?.length ?? 0) > 0 || photoUrls.length > 0 || articles.length > 0 ||
    videos.length > 0 || tracks.length > 0 || !!live;

  return (
    <ShareShell onShare={() => setShareOpen(true)}>
      <ShareNavProvider>
      {/* Identity hero */}
      <div className="rounded-2xl bg-white border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="share-hero">
        <div className="relative w-full h-24 sm:h-28">
          {profile.banner ? (
            <img src={profile.banner} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className={`absolute inset-0 ${DEFAULT_BANNER_CLASS}`}>
              <img src={DEFAULT_BANNER_SRC} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-br from-[#7c86ff]/30 via-[#5b63d9]/20 to-[#333286]/40 mix-blend-multiply" />
            </div>
          )}
        </div>
        <div className="px-5 sm:px-6 pb-5 -mt-10 sm:-mt-11 relative">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white shadow-lg bg-white">
            {profile.picture ? <AvatarImage src={profile.picture} alt={displayName} className="object-cover" /> : null}
            <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 font-bold text-3xl" style={{ fontFamily: "var(--font-display)" }}>
              {initialsFor(displayName)}
            </AvatarFallback>
          </Avatar>

          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="share-name">
              {displayName}
            </h1>
            {profile.nip05 && (
              <span className="inline-flex items-center gap-1 text-sm text-sky-600 font-medium">
                <BadgeCheck className="h-4 w-4" /> {profile.nip05.replace(/^_@/, "")}
              </span>
            )}
          </div>

          {roleLabels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="share-roles">
              {roleLabels.map((label) => (
                <span key={label} className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#333286]/5 border border-[#7c86ff]/30 text-xs font-semibold text-[#333286]">
                  {label}
                </span>
              ))}
            </div>
          )}

          {profile.about && (
            <p className="mt-2 text-sm text-slate-600 leading-snug line-clamp-2" data-testid="share-bio">
              <LinkedText text={profile.about} />
            </p>
          )}

          {/* Compact stats line (Facebook/Twitter-style) with a blended trust chip */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500" data-testid="share-stats">
            {primaryScore01 != null && (() => {
              const tier = tierForScore(primaryScore01);
              const pct = Math.round(primaryScore01 * 100);
              return (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: tier.color, backgroundColor: `${tier.color}14`, borderColor: `${tier.color}55` }}
                  title="Network web-of-trust score"
                  data-testid="share-trust-chip"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
                  {tier.name} · {pct}
                </span>
              );
            })()}
            {verifiedFollowers != null && <span title="Verified followers in the web of trust"><span className="font-semibold text-slate-700">{verifiedFollowers}</span> verified followers</span>}
            {verifiedFollowing != null && <span title="Verified accounts this profile follows"><span className="font-semibold text-slate-700">{verifiedFollowing}</span> verified following</span>}
          </div>

          {/* Compact meta chips */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-mono text-slate-600 transition-colors"
              data-testid="share-copy-npub"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              {npub ? npub.slice(0, 12) + "…" : ""}
            </button>
            {profile.website && (
              <a href={normalizeUrl(profile.website)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-600">
                <Globe className="h-3 w-3" /> {profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
            {profile.lud16 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#7c86ff]/30 bg-white text-[11px] font-semibold text-[#333286]">
                <Zap className="h-3 w-3" /> {profile.lud16}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold">
            <Link href={`/profile/${npub}`} className="inline-flex items-center gap-1 text-[#3730a3] hover:underline" data-testid="share-view-full">
              View full profile <ArrowRight className="h-4 w-4" />
            </Link>
            {!loggedIn && (
              <Link href={`/login?next=${encodeURIComponent(`/p/${npub}`)}`} className="inline-flex items-center gap-1 text-slate-500 hover:text-[#333286]" data-testid="share-signin-cta">
                See it through your own web of trust
              </Link>
            )}
          </div>

          {foundViaRelays && (
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400">
              <Wifi className="h-3.5 w-3.5" /> Fetched live from relays — not yet indexed by Brainstorm.
            </p>
          )}
        </div>
      </div>

      {/* Content teasers */}
      <div className="mt-5 space-y-5">
        {hasContent && (
          <p className="text-xs text-slate-400 px-1" data-testid="share-teaser-caption">
            A few highlights — open the full profile in an app to see everything.
          </p>
        )}
        {noteEvents.length > 0 && (
          <ContentTeaserBlock icon={<MessageSquare className="h-4 w-4" />} title="Latest notes" onViewAll={scrollToOpenIn} testId="share-block-notes">
            <div className="space-y-4">
              {noteEvents.map((ev) => (
                <div key={ev.id} className="pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                  <ShareNoteCard event={ev} profiles={noteProfiles} eventsById={eventsById} addrByCoord={addrByCoord} />
                </div>
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {photoUrls.length > 0 && (
          <ContentTeaserBlock icon={<ImageIcon className="h-4 w-4" />} title="Photos" onViewAll={scrollToOpenIn} testId="share-block-photos">
            <div className="grid grid-cols-3 gap-2">
              {photoUrls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  onError={() => setBrokenPhotos((prev) => (prev.has(url) ? prev : new Set(prev).add(url)))}
                  className="aspect-square w-full object-cover rounded-xl border border-slate-200"
                />
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {articles.length > 0 && (
          <ContentTeaserBlock icon={<FileText className="h-4 w-4" />} title="Articles" onViewAll={scrollToOpenIn} testId="share-block-articles">
            <div className="space-y-3">
              {(articlesQuery.data ?? []).map((ev) => (
                <EmbeddedArticleCard
                  key={ev.id}
                  event={ev as MinimalEvent}
                  author={{ name: profile.name, display_name: profile.display_name, picture: profile.picture, nip05: profile.nip05 }}
                />
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {videos.length > 0 && (
          <ContentTeaserBlock icon={<VideoIcon className="h-4 w-4" />} title="Videos" onViewAll={scrollToOpenIn} testId="share-block-videos">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {videos.map((v) => (
                v.url ? (
                  <ShareVideo key={v.id} url={v.url} poster={v.poster} title={v.title} />
                ) : v.poster ? (
                  <div key={v.id} className="rounded-xl overflow-hidden border border-slate-200 bg-black">
                    <a href={nostrUriFor(pubkey, relayHints)} className="group relative block aspect-video bg-slate-900">
                      <img src={v.poster} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-11 w-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                          <Play className="h-4 w-4 text-[#333286] ml-0.5" />
                        </div>
                      </div>
                    </a>
                    {v.title && <p className="px-3 py-2 text-xs font-semibold text-slate-700 truncate bg-white">{v.title}</p>}
                  </div>
                ) : null
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {tracks.length > 0 && (
          <ContentTeaserBlock icon={<MusicIcon className="h-4 w-4" />} title="Music" onViewAll={scrollToOpenIn} testId="share-block-music">
            <div className="space-y-2">
              {tracks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
                  {t.cover ? (
                    <img src={t.cover} alt="" loading="lazy" className="h-11 w-11 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-11 w-11 rounded-lg bg-[#333286]/10 flex items-center justify-center shrink-0"><MusicIcon className="h-5 w-5 text-[#333286]" /></div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                    {t.artist && <p className="text-xs text-slate-500 truncate">{t.artist}</p>}
                  </div>
                </div>
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {live && (live.status === "live" || live.status === "planned" || !live.status) && (
          <ContentTeaserBlock icon={<Radio className="h-4 w-4" />} title="Live" onViewAll={scrollToOpenIn} testId="share-block-live">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              {live.image && <img src={live.image} alt="" loading="lazy" className="h-14 w-14 rounded-lg object-cover shrink-0" />}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {live.status === "live" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold uppercase tracking-wide text-red-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Live
                    </span>
                  )}
                  <p className="text-sm font-semibold text-slate-900 truncate">{live.title}</p>
                </div>
                {live.status && live.status !== "live" && <p className="text-xs text-slate-500 mt-0.5 capitalize">{live.status}</p>}
              </div>
            </div>
          </ContentTeaserBlock>
        )}

        {!profileLoading && !hasContent && (
          <p className="text-center text-sm text-slate-400 py-6" data-testid="share-empty">No public content found for this profile yet.</p>
        )}
      </div>

      {/* Open in a Nostr client */}
      <section ref={openInRef} className="mt-6 rounded-2xl bg-white border border-slate-200 shadow-sm p-5" data-testid="share-open-in">
        <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase mb-3">See everything — open in an app</p>
        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={nostrUriFor(pubkey, relayHints)}
            className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 bg-white hover:border-purple-300 hover:shadow-sm text-sm font-semibold text-slate-700 transition-all"
            data-testid="open-amethyst"
          >
            <img src={amethystLogoImg} alt="" className="w-5 h-5 rounded-md" /> Amethyst
          </a>
          <a
            href={npub ? `https://nostria.app/p/${npub}` : "https://www.nostria.app/"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-sm text-sm font-semibold text-slate-700 transition-all"
            data-testid="open-nostria"
          >
            <img src={nostriaIconImg} alt="" className="w-5 h-5 rounded-md object-contain" /> Nostria
          </a>
        </div>
        <a href={nostrUriFor(pubkey, relayHints)} className="mt-2.5 block text-center text-xs text-slate-400 hover:text-[#333286]" data-testid="open-default">
          or open in your default app →
        </a>
      </section>

      {/* Learn more (Brainstorm public resources) + funnel */}
      <section className="mt-6 rounded-2xl bg-gradient-to-br from-[#333286]/[0.04] to-[#7c86ff]/[0.06] border border-[#7c86ff]/20 p-5 text-center" data-testid="share-learn-more">
        <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>New to Brainstorm?</h3>
        <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">Brainstorm scores reputation from real human connections — no algorithm. See how it works:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a href="/what-is-wot" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3.5 py-2 rounded-full bg-white border border-[#7c86ff]/30 text-xs font-semibold text-[#333286] hover:border-[#7c86ff]/60 transition-colors" data-testid="link-what-is-wot">What is a Web of Trust?</a>
          <a href="/nostr" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3.5 py-2 rounded-full bg-white border border-[#7c86ff]/30 text-xs font-semibold text-[#333286] hover:border-[#7c86ff]/60 transition-colors" data-testid="link-built-on-nostr">Built on Nostr</a>
          <a href="/about" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3.5 py-2 rounded-full bg-white border border-[#7c86ff]/30 text-xs font-semibold text-[#333286] hover:border-[#7c86ff]/60 transition-colors" data-testid="link-about">About Brainstorm</a>
        </div>
        {!loggedIn && (
          <Link href={`/login?invite=${npub}`} className="mt-4 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold transition-colors" data-testid="share-get-started">
            Create your free account <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      {/* Footer */}
      <div className="mt-6 mb-2 text-center">
        <p className="text-xs text-slate-400">
          Shared via <Link href="/" className="font-semibold text-[#333286] hover:underline">Brainstorm</Link> — trust, made visible.
        </p>
      </div>

      <ShareProfileModal open={shareOpen} onOpenChange={setShareOpen} npub={npub} displayName={displayName} picture={profile.picture} nip05={profile.nip05} canonicalUrl={canonicalUrl} />
      </ShareNavProvider>
    </ShareShell>
  );
}

function ShareShell({ children, onShare }: { children: React.ReactNode; onShare?: () => void }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" data-testid="share-brand">
            <BrainLogo size={26} className="text-indigo-500" />
            <span className="text-lg font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
          </Link>
          {onShare && (
            <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold transition-colors" data-testid="share-open-modal">
              Share
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}

function NotFoundCard({ rawId }: { rawId: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center" data-testid="share-not-found">
      <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Profile not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        "{rawId.slice(0, 24)}{rawId.length > 24 ? "…" : ""}" isn't a valid profile link. Share links look like <span className="font-mono">/p/npub1…</span>.
      </p>
      <Link href="/" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#3730a3] hover:underline">Go to Brainstorm <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

function safeNpub(pubkey: string): string {
  try { return npubFromPubkey(pubkey); } catch { return ""; }
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
