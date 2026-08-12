import { useMemo, useState, useEffect, useRef } from "react";
import { useRoute, useSearch, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Image as ImageIcon,
  FileText,
  BadgeCheck,
  Globe,
  ArrowRight,
  Wifi,
  Video as VideoIcon,
  Headphones,
  Radio,
  Play,
  AlertTriangle,
  ShieldCheck,
  CalendarDays,
  Copy,
  Check,
  SlidersHorizontal,
  UserPlus,
  FileQuestion,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { decodeShareId, npubFromPubkey, nostrUriFor, eventPath } from "@/lib/shareId";
import { copyToClipboard } from "@/lib/clipboard";
import { useActiveAccount } from "applesauce-react/hooks";
import { fetchProfileForShare, fetchRecentByKinds, fetchLiveStreams, fetchEventsByIds, fetchAddressableEvents, fetchProfileMap, fetchExternalIdentities, fetchOutboxRelayList, fetchProfilePrefs, publishProfilePrefs, PROFILE_RELAYS } from "@/services/nostr";
import { parseIdentities } from "@/lib/externalIdentity";
import { ExternalIdentities } from "@/components/share/ExternalIdentities";
import { FollowedByRow } from "@/components/share/FollowedByRow";
import { nip19 } from "nostr-tools";
import { collectRefs, mentionPubkeysFromContent, type MinimalEvent } from "@/lib/noteRefs";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { audioUrlFromEvent, setPlaylist } from "@/lib/audioPlayer";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { TopicChips } from "@/components/share/TopicChips";
import { ShareBio } from "@/components/share/ShareBio";
import liveDefault from "@/assets/live-default.webp";
import { PinIcon } from "@/components/PinIcon";
import { parseCalendarEvent, relativeEventTime } from "@/lib/calendarEvent";
import { EventRow } from "@/components/share/EventRow";
import { OpenInApp } from "@/components/share/OpenInApp";
import { apiClient } from "@/services/api";
import { parseProfilePrefs, loadProfilePrefsDraft, saveProfilePrefsDraft, clearProfilePrefsDraft } from "@/lib/personalization";
import { ROLES, SECTION_KEYS, EMPTY_PROFILE_PREFS, type SectionKey, type ProfilePrefs } from "@/config/personalization";
import { ProfileCustomizer } from "@/components/share/ProfileCustomizer";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DegreeChip } from "@/components/DegreeChip";
import { useRelationshipBadges } from "@/hooks/useRelationshipBadges";
import { ProfileActions, OwnerActions } from "@/components/share/ProfileActions";
import { Stat, StatLensToggle, type StatLens } from "@/components/share/StatToggle";
import { NegativeSignalStats } from "@/components/share/NegativeSignalStats";
import { useScorePov, TrustScoreModal } from "@/components/score/TrustScorePov";
import { VerificationCoin } from "@/components/score/VerificationCoin";
import { extractImageUrls, extractVideoUrls, extractVideoPoster } from "@/lib/noteContent";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { isFlaggedByReporters } from "@/lib/trustFlags";
import { FlashIcon } from "@/components/FlashIcon";
import { ZapModal } from "@/components/ZapModal";
import { ContentTeaserBlock } from "@/components/share/ContentTeaserBlock";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { useShareMeta } from "@/hooks/useShareMeta";
import { BrainLogo } from "@/components/BrainLogo";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC } from "@/lib/profileDefaults";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useHasSession } from "@/hooks/useHasSession";

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
  const loggedIn = useHasSession();
  const [shareOpen, setShareOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);
  const [npubCopied, setNpubCopied] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  // One shared lens for the whole stats block: verified (trust-filtered) vs all
  // (raw). Defaults to verified — Brainstorm's bot-free view is the headline.
  const [statLens, setStatLens] = useState<StatLens>("verified");

  const profileQuery = useQuery({
    queryKey: ["share-profile", pubkey],
    queryFn: () => fetchProfileForShare(pubkey, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // NIP-39 external identity claims (GitHub, X, Telegram, …) from the kind-0 `i`
  // tags — shown as clickable links in the hero (not as "verified").
  const identitiesQuery = useQuery({
    queryKey: ["share-identities", pubkey],
    queryFn: () => fetchExternalIdentities(pubkey, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const identities = useMemo(() => parseIdentities(identitiesQuery.data ?? []), [identitiesQuery.data]);

  // User-owned personalization (NIP-78): what the profile owner has chosen to
  // hide / reorder / emphasize. Opt-out — everything shows until they hide it.
  const prefsQuery = useQuery({
    queryKey: ["share-prefs", pubkey],
    queryFn: () => fetchProfilePrefs(pubkey),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const publishedPrefs = useMemo(() => parseProfilePrefs(prefsQuery.data ?? {}), [prefsQuery.data]);

  // Owner-only inline editing — while editing, the page previews the DRAFT live.
  const currentUser = useActiveAccountDisplay();
  // Owner = the Account that signs IS this profile — which is also what makes
  // publishing prefs possible, so there is nothing else to check.
  const isOwner = useActiveAccount()?.pubkey === pubkey;
  // Read-only relationship state (follow/mute/report/follows-you) for a logged-in
  // viewer — drives the at-a-glance badges next to the actions (which now live
  // here on /p; /profile is the tucked-away advanced view).
  const rel = useRelationshipBadges(pubkey);
  const { pov: scorePov } = useScorePov();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfilePrefs>(EMPTY_PROFILE_PREFS);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const prefs = editing ? draft : publishedPrefs;

  const startCustomize = () => {
    setPrefsError(null);
    setDraft(loadProfilePrefsDraft(pubkey) ?? publishedPrefs);
    setEditing(true);
  };
  // Live preview updates immediately (setDraft); the localStorage backup write is
  // debounced so rapid drags/toggles don't hit disk every tick (kills the jank).
  const draftSaveTimer = useRef<number>();
  const updateDraft = (next: ProfilePrefs) => {
    setDraft(next);
    window.clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = window.setTimeout(() => saveProfilePrefsDraft(pubkey, next), 300);
  };
  const cancelCustomize = () => { window.clearTimeout(draftSaveTimer.current); clearProfilePrefsDraft(pubkey); setEditing(false); setPrefsError(null); };
  const saveCustomize = async () => {
    setSavingPrefs(true);
    setPrefsError(null);
    const res = await publishProfilePrefs(draft);
    setSavingPrefs(false);
    if (res.cancelled) return;
    if (res.success) {
      clearProfilePrefsDraft(pubkey);
      setEditing(false);
      queryClient.setQueryData(["share-prefs", pubkey], draft); // reflect immediately
      queryClient.invalidateQueries({ queryKey: ["share-prefs", pubkey] });
    } else {
      setPrefsError(res.error || "Couldn't save");
    }
  };

  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const isHidden = (key: string) => hiddenSet.has(key);
  // Section display order: owner's order first, then any remaining defaults.
  const orderedSections = useMemo(() => {
    const valid = prefs.order.filter((k): k is SectionKey => (SECTION_KEYS as readonly string[]).includes(k));
    const rest = SECTION_KEYS.filter((k) => !valid.includes(k));
    return [...valid, ...rest] as SectionKey[];
  }, [prefs.order]);
  const orderClass = (key: SectionKey) => `order-${orderedSections.indexOf(key) + 1}`;

  // "Followed by" — the top WoT-ranked (most-trusted) accounts that follow this
  // profile, for the social-proof avatar row under the stats. House POV so it's
  // stable for every viewer.
  const followedByQuery = useQuery({
    queryKey: ["share-followedby", pubkey],
    queryFn: async () => {
      const res = await apiClient.getUserConnections(pubkey, "followed_by", {
        limit: 8,
        order: "desc",
        verified_only: true,
        house: true,
      });
      const items = (res?.data?.items ?? []) as Array<string | { pubkey?: string }>;
      return items.map((e) => (typeof e === "string" ? e : e?.pubkey)).filter((p): p is string => !!p);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  // Owner can hand-pick the "Followed by" faces; otherwise auto top-trusted.
  const effectiveFollowerPubkeys = useMemo(
    () => (prefs.pinnedFollowers.length > 0 ? prefs.pinnedFollowers : (followedByQuery.data ?? [])),
    [prefs.pinnedFollowers, followedByQuery.data],
  );
  const followedByProfilesQuery = useQuery({
    queryKey: ["share-followedby-profiles", effectiveFollowerPubkeys.join(",")],
    queryFn: () => fetchProfileMap(effectiveFollowerPubkeys),
    enabled: effectiveFollowerPubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const topFollowers = useMemo(() => {
    const profs = followedByProfilesQuery.data;
    return effectiveFollowerPubkeys.map((pk) => ({
      pubkey: pk,
      name: profs?.get(pk)?.display_name || profs?.get(pk)?.name,
      picture: profs?.get(pk)?.picture,
    }));
  }, [effectiveFollowerPubkeys, followedByProfilesQuery.data]);

  // A wider follower list (resolved) for the owner's "Followed by" picker — only
  // fetched while the Customize panel is open.
  const followerCandidatesQuery = useQuery({
    queryKey: ["share-follower-candidates", pubkey],
    queryFn: async () => {
      const res = await apiClient.getUserConnections(pubkey, "followed_by", {
        limit: 40, order: "desc", house: true,
      });
      const items = (res?.data?.items ?? []) as Array<string | { pubkey?: string }>;
      return items.map((e) => (typeof e === "string" ? e : e?.pubkey)).filter((p): p is string => !!p);
    },
    enabled: !!pubkey && editing,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const candidateProfilesQuery = useQuery({
    queryKey: ["share-candidate-profiles", (followerCandidatesQuery.data ?? []).join(",")],
    queryFn: () => fetchProfileMap(followerCandidatesQuery.data ?? []),
    enabled: (followerCandidatesQuery.data?.length ?? 0) > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const followerCandidates = useMemo(() => {
    const profs = candidateProfilesQuery.data;
    return (followerCandidatesQuery.data ?? []).map((pk) => ({
      pubkey: pk,
      name: profs?.get(pk)?.display_name || profs?.get(pk)?.name,
      picture: profs?.get(pk)?.picture,
    }));
  }, [followerCandidatesQuery.data, candidateProfilesQuery.data]);

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

  // Per-section stats: total/verified counts per relationship. A shared link is
  // public, so we always read the HOUSE (network) POV — the same numbers and the
  // same "flagged" verdict every viewer sees, never the logged-in viewer's
  // personalized perspective.
  const statsQuery = useQuery({
    queryKey: ["share-stats", pubkey],
    queryFn: () => apiClient.getUserStats(pubkey, { house: true }),
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
    queryFn: () => fetchRecentByKinds(pubkey, [20], 12, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const articlesQuery = useQuery({
    queryKey: ["share-articles", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [30023], 5, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // A wider net of recent notes used ONLY to harvest images for the photo grid,
  // so it can fill 3/6/9 even when the latest 5 notes happen to be text-only.
  const photoNotesQuery = useQuery({
    queryKey: ["share-photo-notes", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [1], 40, { relayHints }),
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
    queryFn: () => fetchLiveStreams(pubkey, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // NIP-38 user status (kind 30315): a "general" line ("what I'm up to") and an
  // optional "music" now-playing line. Shown in the hero under the name.
  const statusQuery = useQuery({
    queryKey: ["share-status", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [30315], 4, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Featured = the first pin from the NIP-51 pin list (kind 10001), resolved.
  const pinsQuery = useQuery({
    queryKey: ["share-pins", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [10001], 1, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const pinnedId = (pinsQuery.data?.[0]?.tags.find((t) => t[0] === "e")?.[1]) as string | undefined;
  const pinnedQuery = useQuery({
    queryKey: ["share-pinned", pinnedId],
    queryFn: () => fetchEventsByIds([pinnedId as string], relayHints),
    enabled: !!pinnedId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Calendar events (NIP-52, kind 31922 date / 31923 time).
  const eventsQuery = useQuery({
    queryKey: ["share-events", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [31922, 31923], 8, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // NIP-65 (kind 10002) relay list → "Active on N relays" presence signal.
  const relaysQuery = useQuery({
    queryKey: ["share-relays", pubkey],
    queryFn: async () => {
      const ev = await fetchOutboxRelayList(pubkey);
      if (!ev) return 0;
      const set = new Set<string>();
      for (const t of ev.tags || []) if (t[0] === "r" && typeof t[1] === "string") set.add(t[1].replace(/\/$/, "").toLowerCase());
      return set.size;
    },
    enabled: !!pubkey,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const relayCount = relaysQuery.data ?? 0;

  const profile = (profileQuery.data ?? {}) as ProfileContentLike;
  const displayName = profile.display_name || profile.name || (npub ? npub.slice(0, 12) + "…" : "Nostr profile");

  // "On Nostr since [year]" — a truthful LOWER BOUND from the oldest event we
  // already fetched (their old articles/events/notes). Only shown when that's
  // genuinely old (>6 months), so it never mislabels a fresh fetch as recent.
  const memberSinceYear = useMemo(() => {
    const arrays = [notesQuery.data, photosQuery.data, articlesQuery.data, photoNotesQuery.data, videosQuery.data, musicQuery.data, statusQuery.data, eventsQuery.data, liveQuery.data];
    let oldest = Infinity;
    for (const arr of arrays) for (const ev of (arr ?? []) as { created_at?: number }[]) {
      const c = ev?.created_at;
      if (typeof c === "number" && c > 0 && c < oldest) oldest = c;
    }
    if (!Number.isFinite(oldest)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (oldest > nowSec - 60 * 60 * 24 * 182) return null; // < ~6 months old → not meaningful
    return new Date(oldest * 1000).getFullYear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesQuery.data, photosQuery.data, articlesQuery.data, photoNotesQuery.data, videosQuery.data, musicQuery.data, statusQuery.data, eventsQuery.data, liveQuery.data]);
  const overview = overviewQuery.data as { influence?: number | null; counts?: Record<string, number> } | undefined;
  // The overview score is viewer-relative: house/network POV when logged out,
  // the viewer's own web-of-trust POV when logged in. That's the primary ring.
  const score01 = typeof overview?.influence === "number" ? overview.influence : null;
  // Counts from the per-section stats endpoint (house POV). Followers/muters/
  // reporters use the VERIFIED (web-of-trust) count; "following" uses the raw
  // total (per CEO: total following is more meaningful than verified following).
  const stats = statsQuery.data?.data as
    | {
        followed_by?: { verified?: number; total?: number };
        following?: { total?: number; verified?: number };
        muted_by?: { verified?: number; total?: number };
        reported_by?: { verified?: number; total?: number };
      }
    | undefined;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // Each stat carries BOTH the web-of-trust-filtered (`verified`) and raw
  // (`total`, includes bots) count in one response — the StatToggle flips between
  // them client-side. No extra request.
  const verifiedFollowers = num(stats?.followed_by?.verified);
  const allFollowers = num(stats?.followed_by?.total);
  const followingTotal = num(stats?.following?.total);
  const verifiedFollowing = num(stats?.following?.verified);
  // The muter/reporter counts themselves render in <NegativeSignalStats>; the
  // reporter count is read here too, for the flag banner.
  const verifiedReporters = num(stats?.reported_by?.verified);
  const allReporters = num(stats?.reported_by?.total);
  // Flagged = reported by more than 5 verified accounts, +1 forgiven per 750
  // verified followers (house POV → same verdict for every viewer).
  const isFlagged = isFlaggedByReporters(verifiedReporters ?? 0, verifiedFollowers ?? 0);
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
  const photos = useMemo(() => {
    const out: { url: string; id: string; pubkey: string }[] = [];
    const seen = new Set<string>();
    const add = (ev: { id: string; pubkey: string; content: string; tags: string[][] }, urls: string[]) => {
      for (const u of urls) {
        if (seen.has(u) || brokenPhotos.has(u)) continue;
        seen.add(u);
        out.push({ url: u, id: ev.id, pubkey: ev.pubkey });
      }
    };
    for (const ev of photosQuery.data ?? []) add(ev, extractImageUrls(ev.content, ev.tags, { allImeta: true }));
    for (const ev of photoNotesQuery.data ?? []) add(ev, extractImageUrls(ev.content, ev.tags));
    for (const ev of notesQuery.data ?? []) add(ev, extractImageUrls(ev.content, ev.tags));
    return out.slice(0, 9);
  }, [photosQuery.data, photoNotesQuery.data, notesQuery.data, brokenPhotos]);

  // Align the photo grid to full rows of 3 (3/6/9) so it never looks ragged;
  // fall back to whatever exists when there are fewer than 3.
  const gridPhotos = useMemo(
    () => (photos.length >= 3 ? photos.slice(0, Math.floor(photos.length / 3) * 3) : photos),
    [photos],
  );

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
        const genres = ev.tags.filter((t) => t[0] === "t").map((t) => t[1]).filter((g) => g && g.toLowerCase() !== "music");
        const genre = genres[0] ? genres[0].charAt(0).toUpperCase() + genres[0].slice(1) : undefined;
        return { id: ev.id, title: tag("title") || tag("subject") || "Track", artist: tag("artist") || tag("creator") || tag("c"), cover: tag("image") || tag("cover"), audio: audioUrlFromEvent(ev), genre, ts: ev.created_at };
      }),
    [musicQuery.data],
  );

  // Register the ordered, playable tracks so the shared player auto-advances.
  useEffect(() => {
    setPlaylist(tracks.filter((t) => t.audio).map((t) => ({ id: t.id, src: t.audio as string })));
  }, [tracks]);

  // NIP-53 live streams (kind 30311) → live now + upcoming only (no replays).
  const liveStreams = useMemo(() => {
    const evs = (liveQuery.data ?? []) as MinimalEvent[];
    const nowSec = Math.floor(Date.now() / 1000);
    const parsed = evs.map((ev) => {
      const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1];
      const starts = Number(tag("starts")) || 0;
      let watchUrl: string | undefined;
      try { watchUrl = `https://zap.stream/${nip19.naddrEncode({ kind: 30311, pubkey: ev.pubkey, identifier: tag("d") || "", relays: [] })}`; } catch { /* skip */ }
      return {
        id: ev.id,
        authorPubkey: ev.pubkey,
        title: tag("title") || tag("summary") || "Live stream",
        image: tag("image"),
        status: (tag("status") || "").toLowerCase(),
        starts,
        watchUrl,
        // Forward-looking label only when the start is actually in the future.
        timing: starts && starts >= nowSec ? `Starts ${relativeEventTime(starts).toLowerCase()}` : "Planned",
      };
    }).filter((s) => s.status !== "ended"); // recordings/replays aren't reliable — show live + upcoming
    const liveNow = parsed.filter((s) => s.status === "live");
    const upcoming = parsed.filter((s) => s.status !== "live").sort((a, b) => a.starts - b.starts).slice(0, 2);
    return { liveNow, upcoming, has: liveNow.length + upcoming.length > 0 };
  }, [liveQuery.data]);

  // NIP-38 status: latest non-expired "general" line + optional "music" now-playing.
  const status = useMemo(() => {
    const evs = (statusQuery.data ?? []) as MinimalEvent[];
    const nowSec = Math.floor(Date.now() / 1000);
    const pick = (d: string) => {
      const matches = evs
        .filter((e) => (e.tags.find((t) => t[0] === "d")?.[1] || "general") === d)
        .filter((e) => { const exp = Number(e.tags.find((t) => t[0] === "expiration")?.[1]) || 0; return !exp || exp > nowSec; })
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const text = matches[0]?.content?.trim();
      return text || null;
    };
    return { general: pick("general"), music: pick("music") };
  }, [statusQuery.data]);

  // "Posts about" — top hashtags across the notes + articles we already fetched.
  const topics = useMemo(() => {
    // Drop URL fragments / junk that leak in as `t` tags ("www.", ".com", bare
    // TLDs) so the row reads as real interests. Keep word-ish tags only.
    const VALID = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u;
    const JUNK = new Set(["www", "com", "net", "org", "http", "https", "html", "co", "io"]);
    const counts = new Map<string, number>();
    const add = (evs: MinimalEvent[]) => {
      for (const ev of evs) for (const t of ev.tags) {
        if (t[0] === "t" && t[1]) {
          const tag = t[1].toLowerCase().replace(/^#/, "").trim();
          if (tag && tag.length >= 2 && tag.length <= 22 && VALID.test(tag) && !JUNK.has(tag)) {
            counts.set(tag, (counts.get(tag) || 0) + 1);
          }
        }
      }
    };
    add((notesQuery.data ?? []) as MinimalEvent[]);
    add((articlesQuery.data ?? []) as MinimalEvent[]);
    // Top 6 by frequency — capped so the row stays a single line (TopicChips also
    // clips any overflow, so it never wraps to a second line on mobile).
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
  }, [notesQuery.data, articlesQuery.data]);

  const featured = ((pinnedQuery.data ?? [])[0] ?? null) as MinimalEvent | null;

  // NIP-52 calendar events → upcoming (soonest-first) + a small past group.
  const calendarEvents = useMemo(() => {
    const evs = (eventsQuery.data ?? []) as MinimalEvent[];
    const nowSec = Math.floor(Date.now() / 1000);
    const parsed = evs.map((ev) => {
      const e = parseCalendarEvent(ev);
      return { id: ev.id, title: e.title, start: e.startSec, location: e.location, image: e.image };
    }).filter((e) => e.start > 0);
    const upcoming = parsed.filter((e) => e.start >= nowSec).sort((a, b) => a.start - b.start).slice(0, 3);
    const past = parsed.filter((e) => e.start < nowSec).sort((a, b) => b.start - a.start).slice(0, 2);
    return { upcoming, past };
  }, [eventsQuery.data]);

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
    // Resolve any real nostr: @mentions embedded in the bio so they render as names.
    mentionPubkeysFromContent(profile.about || "").forEach((pk) => set.add(pk));
    return Array.from(set);
  }, [refs.pubkeys, eventsById, addrByCoord, profile.about]);

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
    return prefs.roles.map((key) => ROLES.find((r) => r.key === key)?.label).filter(Boolean) as string[];
  }, [prefs.roles]);

  const canonicalUrl = typeof window !== "undefined" && npub ? `${window.location.origin}/p/${npub}` : "";

  // NOTE on the invite model: clicking a "Join" CTA below carries `?invite=<npub>`,
  // so a new account created from this profile auto-follows its owner (new user →
  // owner) — the new user starts connected with a trust anchor. We deliberately do
  // NOT notify the owner ("someone just joined — welcome them back?"): that prompt
  // was the scam lever (it pressured the owner to follow BACK a stranger, forming a
  // trust edge that carries the owner's weight). The auto-follow alone is inert — a
  // brand-new account following you carries ~zero weight and gains nothing unless
  // you follow back. The owner-facing notification stays off (WelcomeBackCard is
  // unmounted) until a backend invite-record can gate a genuine reciprocal prompt.
  // We also don't blanket-store this profile as a "pending invite" on mere view —
  // the auto-follow is CTA-only, so it's an intentional act, not a drive-by tag.

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

  if (!decoded) {
    return <ShareShell><NotFoundCard rawId={rawId} /></ShareShell>;
  }

  const profileLoading = profileQuery.isLoading;
  const hasContent =
    (notesQuery.data?.length ?? 0) > 0 || photos.length > 0 || articles.length > 0 ||
    videos.length > 0 || tracks.length > 0 || liveStreams.has || !!featured || calendarEvents.upcoming.length > 0 || calendarEvents.past.length > 0;

  // Keys (sections + hero details) the owner currently has NO content for — the
  // customizer greys these out so a toggle never misleadingly reads as "on".
  const emptyKeys = new Set<string>();
  if (!featured) emptyKeys.add("featured");
  if (!liveStreams.has) emptyKeys.add("live");
  if (calendarEvents.upcoming.length === 0 && calendarEvents.past.length === 0) emptyKeys.add("events");
  if (articles.length === 0) emptyKeys.add("articles");
  if (tracks.length === 0) emptyKeys.add("audio");
  if (videos.length === 0) emptyKeys.add("videos");
  if (gridPhotos.length === 0) emptyKeys.add("photos");
  if (noteEvents.length === 0) emptyKeys.add("notes");
  if (!profile.about) emptyKeys.add("bio");
  if (topics.length === 0) emptyKeys.add("topics");
  if (topFollowers.length === 0) emptyKeys.add("followedBy");
  if (!memberSinceYear && relayCount === 0) emptyKeys.add("tenure");
  if (identities.length === 0) emptyKeys.add("identities");
  if (!status.general && !status.music) emptyKeys.add("status");

  // The Web-of-Trust card — rendered twice (mobile inline / desktop sidebar).
  // Logged OUT: the network/house score leads (the same number every recipient
  // sees — the shareable artifact). Logged IN with a personal POV: LEAD with
  // "To you" (the meter + verdict reflect the score that's relevant to the
  // viewer, so an account they trust never shows an empty network bar), and
  // "Brainstorm" becomes the reference row. The secondary shows only if it
  // differs from the primary after rounding.
  // Which POV leads follows the sitewide score-POV toggle (personalized vs
  // global) — the personalized number only leads when the viewer chose it.
  // The Verification Score coin reflects the ACTIVE point of view (the sitewide
  // toggle): personalized → the viewer's own score; global → the network (house)
  // score. Logged-out visitors are always global. Null → unrated coin ("—").
  const coinScore01 = scorePov === "personalized" ? score01 : houseScore01 ?? score01;
  // Contact as compact clickable icons — website, lightning address, external
  // identities. Lives top-right with the actions (and has a mobile fallback row),
  // never as verbose text at the bottom.
  const hasContactIcons = !!(profile.website || profile.lud16 || (identities.length > 0 && !isHidden("identities")));
  const contactIcons = hasContactIcons ? (
    <>
      {profile.website && (
        <a
          href={normalizeUrl(profile.website)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-primary"
          title={profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          aria-label="Website"
          data-testid="share-website"
        >
          <Globe className="h-4 w-4" />
        </a>
      )}
      {profile.lud16 && (
        <button
          type="button"
          onClick={() => setZapOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#F7931A] transition-colors hover:bg-[#F7931A]/10 hover:text-[#e07f12]"
          title={`Lightning — ${profile.lud16}`}
          aria-label="Lightning address"
          data-testid="share-lightning"
        >
          <FlashIcon className="h-4 w-4" />
        </button>
      )}
      {identities.length > 0 && !isHidden("identities") && (
        <span className="inline-flex items-center gap-2.5" data-testid="share-identities">
          <ExternalIdentities identities={identities} />
        </span>
      )}
    </>
  ) : null;

  // The action pieces, kept separate so we can place them differently per
  // breakpoint: a "Follows you" chip, the contact icons, and the Follow/⋯ (or
  // the owner's ⋯). On desktop all three sit together top-right with the avatar.
  // On mobile the contact icons move up to the top-right slot under the banner
  // (filling the dead space across from the avatar) while the Follow/⋯ actions
  // drop to their own full-width row so the primary button can stretch.
  const followsYouChip = loggedIn && rel.enabled && !isOwner && !rel.loading && rel.followsYou ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400" data-testid="share-follows-you">
      <UserPlus className="h-3 w-3" /> Follows you
    </span>
  ) : null;
  const followButtons = loggedIn ? (isOwner ? (
    <OwnerActions npub={npub} />
  ) : (
    <ProfileActions
      key={`${rel.isFollowing}-${rel.isMuted}-${!!rel.report}`}
      targetPubkey={pubkey}
      npub={npub}
      initialFollowing={rel.isFollowing}
      initialMuted={rel.isMuted}
      alreadyReported={!!rel.report}
    />
  )) : null;
  const hasFollowActions = !!followButtons;
  const hasActions = loggedIn || hasContactIcons;

  // Desktop: chip + icons + Follow/⋯ together, top-right with the avatar.
  const topRightActions = hasActions ? (
    <div className="hidden sm:flex items-center gap-2 shrink-0" data-testid="share-actions-topright">
      {followsYouChip}
      {contactIcons}
      {followButtons}
    </div>
  ) : null;
  // Mobile: just the contact icons, top-right across from the avatar.
  const mobileTopIcons = hasContactIcons ? (
    <div className="flex sm:hidden items-center gap-1 shrink-0" data-testid="share-icons-mobile">
      {contactIcons}
    </div>
  ) : null;
  // Mobile: the Follow/⋯ actions (+ follows-you chip) in their own row so the
  // primary button can fill the width.
  const mobileFollowRow = hasFollowActions ? (
    <div className="mt-3 flex items-center gap-2 sm:hidden" data-testid="share-actions-mobile">
      {followsYouChip}
      {followButtons}
    </div>
  ) : null;

  return (
    <ShareShell onShare={() => setShareOpen(true)}>
      <ShareNavProvider>
      {/* Identity hero */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" data-testid="share-hero">
        <div className="relative w-full h-24 sm:h-28">
          {profile.banner ? (
            <img src={profile.banner} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className={`absolute inset-0 ${DEFAULT_BANNER_CLASS}`}>
              <img src={DEFAULT_BANNER_SRC} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/30 via-brand-accent-hover/20 to-brand-deep/40 mix-blend-multiply" />
            </div>
          )}
        </div>
        <div className="px-5 sm:px-6 pb-5 -mt-10 sm:-mt-11 relative">
          {/* key by pubkey so the Avatar remounts per profile — otherwise Radix
              keeps a stale "image loaded" status when navigating from a pictured
              profile to a pictureless one, hiding the fallback. */}
          <div className="flex items-end justify-between gap-3">
            <div className="relative inline-block">
              <Avatar key={pubkey} className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white shadow-lg bg-white dark:bg-slate-900">
                {profile.picture ? <AvatarImage src={profile.picture} alt={displayName} className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden rounded-full">
                  <DefaultAvatarImg flagged={isFlagged} />
                </AvatarFallback>
              </Avatar>
              {/* Verification Score — the label-less coin, active-POV, bottom-right of
                  the avatar. Tap opens the shared explainer/compare modal. */}
              <VerificationCoin
                score01={coinScore01}
                pov={scorePov}
                size={32}
                onClick={() => setScoreModalOpen(true)}
                className="absolute -bottom-1 -right-1"
              />
            </div>
            {/* Desktop: chip + icons + Follow/⋯. Mobile: just the contact icons
                here (top-right under the banner); Follow/⋯ render in a row below. */}
            {topRightActions}
            {mobileTopIcons}
          </div>

          <div className="mt-2.5 md:flex md:gap-6 md:items-start">
            <div className="md:flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="share-name">
              {displayName}
            </h1>
            {profile.nip05 && (
              <span className="inline-flex items-center gap-1 text-sm text-brand-link font-medium">
                <BadgeCheck className="h-4 w-4" /> {profile.nip05.replace(/^_@/, "")}
              </span>
            )}
          </div>
          {/* NIP-38 status — a live "now" line under the name (general + now-playing). */}
          {!isHidden("status") && status.general && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-snug" data-testid="share-status">{status.general}</p>}
          {!isHidden("status") && status.music && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" data-testid="share-status-music">♪ {status.music}</p>}
          {/* npub — subtle + copyable so logged-out visitors can verify identity. */}
          {npub && (
            <div className="flex items-center gap-1.5 mt-1" data-testid="share-npub">
              <code className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[170px] sm:max-w-[300px]">{npub}</code>
              <button
                type="button"
                onClick={async () => { if (await copyToClipboard(npub)) { setNpubCopied(true); setTimeout(() => setNpubCopied(false), 1500); } }}
                className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-brand-primary transition-colors shrink-0"
                title="Copy npub"
                data-testid="share-copy-npub"
              >
                {npubCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          )}

          {/* Mobile: the Follow/⋯ actions in their own row under the identity so
              the primary button can fill the width. Contact icons live top-right
              (above), not here. */}
          {mobileFollowRow}

          {/* Tags — the team's WoT-ranked attribute chips (Verified human, Founder,
              …) will render here, colored in the personalized view / greyscale in
              global, with a "+N → see all". Deferred until tag data ships; for now
              the owner-set role chips below stand in. */}
          {roleLabels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="share-roles">
              {roleLabels.map((label) => (
                <span key={label} className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-deep/5 border border-brand-accent/30 text-xs font-semibold text-brand-deep">
                  {label}
                </span>
              ))}
            </div>
          )}

          {!isHidden("bio") && profile.about && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-snug line-clamp-2" data-testid="share-bio">
              <ShareBio text={profile.about} profiles={noteProfiles} />
            </p>
          )}

          {/* "Posts about" — top hashtags as a skills-style chip row. */}
          {!isHidden("topics") && <TopicChips topics={topics} />}

          {/* Prominent, factual flag — when reported beyond the follower-scaled
              threshold (house POV → same verdict for every viewer). */}
          {isFlagged && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5" data-testid="share-flag-banner">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs leading-relaxed">
                <span className="font-bold text-red-700">Flagged by the network</span>
                <span className="text-red-700/90"> — reported by {verifiedReporters} verified {verifiedReporters === 1 ? "account" : "accounts"} in the Web of Trust.</span>{" "}
                <Link href={`/p/${rawId}/reporters`} className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800" data-testid="share-flag-reporters">See who</Link>
                <span className="text-red-700/60"> · </span>
                {/* TODO(phase2): point at /what-are-degrees once the explainer exists */}
                <Link href="/what-is-wot" className="font-medium text-red-700/80 underline underline-offset-2 hover:text-red-800">Why am I seeing this?</Link>
              </div>
            </div>
          )}

          {/* Stats — one shared Verified/All lens for the whole block (tap the
              toggle to reveal how many bots the web of trust filters out). Each
              count links to its full list. */}
          <div className="mt-2.5 space-y-1.5" data-testid="share-stats">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                {(followingTotal != null || verifiedFollowing != null) && (
                  <Stat
                    verified={verifiedFollowing}
                    all={followingTotal}
                    verifiedLabel="Verified Following"
                    allLabel="Following"
                    href={`/p/${rawId}/following`}
                    lens={statLens}
                    testId="share-stat-following"
                  />
                )}
                {(verifiedFollowers != null || allFollowers != null) && (
                  <Stat
                    verified={verifiedFollowers}
                    all={allFollowers}
                    verifiedLabel="Verified Followers"
                    allLabel="All Followers"
                    href={`/p/${rawId}/followers`}
                    lens={statLens}
                    testId="share-stat-followers"
                  />
                )}
                {/* Degree (LinkedIn-style 1st/2nd/3rd) — a "good" metric, so it sits
                    on line 1. Signed-in + scored viewers only (needs my pubkey as the
                    path origin); hidden on your own profile. */}
                {loggedIn && currentUser?.pubkey && pubkey && currentUser.pubkey !== pubkey &&
                  localStorage.getItem("brainstorm_calc_completed") === "true" && (
                    <DegreeChip fromPubkey={currentUser.pubkey} toPubkey={pubkey} rawId={rawId} />
                  )}
              </div>
              <NegativeSignalStats
                stats={stats}
                rawId={rawId}
                lens={statLens}
                isFlagged={isFlagged}
              />
            </div>
            {(verifiedFollowers != null || allFollowers != null) && (
              <StatLensToggle value={statLens} onChange={setStatLens} />
            )}
          </div>
          {/* end stats */}

          {/* Social proof — most-trusted accounts who follow them (LinkedIn/FB style),
              inline under the stats so it reads as a "who vouches for them" line
              rather than floating in a side rail. */}
          {!isHidden("followedBy") && (
            <div className="mt-3">
              <FollowedByRow people={topFollowers} total={verifiedFollowers} href={`/p/${rawId}/followers`} />
            </div>
          )}

          {/* Tenure / presence — Google-knowledge-panel "at a glance" line. */}
          {!isHidden("tenure") && (memberSinceYear || relayCount > 0) && (
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500" data-testid="share-tenure">
              {memberSinceYear && <>On Nostr since {memberSinceYear}</>}
              {memberSinceYear && relayCount > 0 && " · "}
              {relayCount > 0 && <>Active on {relayCount} relay{relayCount === 1 ? "" : "s"}</>}
            </p>
          )}


          {/* Logged-out → the Join conversion panel (leads with the personal
              connection). Logged-in relationship actions live under the WoT card
              (loggedInActions), not here. */}
          {!loggedIn && (
            <div className="mt-4 w-full rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.05] to-brand-accent/[0.08] p-4 sm:p-5 shadow-sm" data-testid="share-invite-panel">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {/* Personal connection + value */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {profile.picture && (
                    <img src={profile.picture} alt="" className="hidden sm:block h-12 w-12 rounded-full object-cover ring-2 ring-white shadow shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono font-bold tracking-[0.2em] text-brand-link dark:text-brand-link uppercase">Join Brainstorm</div>
                    <h3 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                      Connect with {displayName}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Real humans, not bots — join the web of trust you own and you're instantly connected to {displayName}.
                    </p>
                  </div>
                </div>
                {/* CTA — right on desktop, full-width below on mobile */}
                <div className="shrink-0 sm:text-right">
                  <Link
                    href={`/login?invite=${npub}&next=${encodeURIComponent(`/p/${npub}`)}`}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap"
                    data-testid="share-wot-cta"
                  >
                    Join free <ArrowRight className="h-4 w-4" />
                  </Link>
                  <div className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center sm:text-right">Free · no email · a minute</div>
                </div>
              </div>
            </div>
          )}

          {foundViaRelays && (
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <Wifi className="h-3.5 w-3.5" /> Fetched live from relays — not yet indexed by Brainstorm.
            </p>
          )}
            </div>
          </div>
        </div>
      </div>

      {/* Content teasers */}
      <div className="mt-5 flex flex-col gap-5">
        {hasContent && (
          <p className="text-xs text-slate-400 dark:text-slate-500 px-1" data-testid="share-teaser-caption">
            A few highlights — open the full profile in an app to see everything.
          </p>
        )}
        {/* Featured — the person's pinned post/article, up top. */}
        {featured && !isHidden("featured") && (
          <ContentTeaserBlock icon={<PinIcon className="h-4 w-4" />} title="Featured" testId="share-block-featured" className={orderClass("featured")}>
            {featured.kind === 30023 ? (
              <EmbeddedArticleCard event={featured} author={{ name: profile.name, display_name: profile.display_name, picture: profile.picture, nip05: profile.nip05 }} />
            ) : (
              <ShareNoteCard event={featured} profiles={noteProfiles} eventsById={eventsById} addrByCoord={addrByCoord} href={eventPath(featured, relayHints)} forceExpanded />
            )}
          </ContentTeaserBlock>
        )}
        {/* Events — upcoming leads; a small, muted "Past events" group below. */}
        {(calendarEvents.upcoming.length > 0 || calendarEvents.past.length > 0) && !isHidden("events") && (
          <ContentTeaserBlock icon={<CalendarDays className="h-4 w-4" />} title={calendarEvents.upcoming.length > 0 ? "Upcoming events" : "Past events"} onViewAll={scrollToOpenIn} testId="share-block-events" className={orderClass("events")}>
            <div className="space-y-2">
              {calendarEvents.upcoming.map((ev) => (
                <EventRow key={ev.id} event={ev} href={eventPath({ id: ev.id, pubkey }, relayHints)} />
              ))}
              {calendarEvents.upcoming.length > 0 && calendarEvents.past.length > 0 && (
                <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500" data-testid="share-events-past-label">Past events</p>
              )}
              {calendarEvents.past.map((ev) => (
                <EventRow key={ev.id} event={ev} past href={eventPath({ id: ev.id, pubkey }, relayHints)} />
              ))}
            </div>
          </ContentTeaserBlock>
        )}
        {articles.length > 0 && !isHidden("articles") && (
          <ContentTeaserBlock icon={<FileText className="h-4 w-4" />} title="Articles" onViewAll={scrollToOpenIn} testId="share-block-articles" className={orderClass("articles")}>
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

        {noteEvents.length > 0 && !isHidden("notes") && (
          <ContentTeaserBlock icon={<MessageSquare className="h-4 w-4" />} title="Latest notes" onViewAll={scrollToOpenIn} testId="share-block-notes" className={orderClass("notes")}>
            <div className="space-y-4">
              {noteEvents.map((ev) => (
                <div key={ev.id} className="pb-4 border-b border-slate-100 dark:border-slate-800/60 last:border-0 last:pb-0">
                  <ShareNoteCard event={ev} profiles={noteProfiles} eventsById={eventsById} addrByCoord={addrByCoord} href={eventPath(ev, relayHints)} />
                </div>
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {gridPhotos.length > 0 && !isHidden("photos") && (
          <ContentTeaserBlock icon={<ImageIcon className="h-4 w-4" />} title="Photos" onViewAll={scrollToOpenIn} testId="share-block-photos" className={orderClass("photos")}>
            <div className="grid grid-cols-3 gap-2">
              {gridPhotos.map((photo) => (
                <Link
                  key={photo.url}
                  href={eventPath({ id: photo.id, pubkey: photo.pubkey }, relayHints)}
                  className="group relative block aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
                  data-testid="share-photo-tile"
                >
                  <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    onError={() => setBrokenPhotos((prev) => (prev.has(photo.url) ? prev : new Set(prev).add(photo.url)))}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  />
                </Link>
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {videos.length > 0 && !isHidden("videos") && (
          <ContentTeaserBlock icon={<VideoIcon className="h-4 w-4" />} title="Videos" onViewAll={scrollToOpenIn} testId="share-block-videos" className={orderClass("videos")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {videos.map((v) => (
                <div key={v.id} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
                  <Link
                    href={eventPath({ id: v.id, pubkey }, relayHints)}
                    className="group relative block aspect-video bg-slate-900"
                    data-testid="share-video-tile"
                  >
                    {v.poster ? (
                      <img src={v.poster} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                    ) : v.url ? (
                      <video src={`${v.url}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                    ) : null}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                      <span className="h-12 w-12 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-lg transition-all group-hover:scale-105">
                        <Play className="h-5 w-5 text-brand-deep ml-0.5" />
                      </span>
                    </div>
                  </Link>
                  {v.title && <p className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate bg-white dark:bg-slate-900">{v.title}</p>}
                </div>
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {tracks.length > 0 && !isHidden("audio") && (
          <ContentTeaserBlock icon={<Headphones className="h-4 w-4" />} title="Audio" onViewAll={scrollToOpenIn} testId="share-block-music" className={orderClass("audio")}>
            <div className="space-y-2">
              {tracks.map((t) => (
                <EmbeddedTrackCard
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  artist={t.artist}
                  cover={t.cover}
                  audio={t.audio}
                  genre={t.genre}
                  href={eventPath({ id: t.id, pubkey }, relayHints)}
                  onZap={profile.lud16 ? () => setZapOpen(true) : undefined}
                />
              ))}
            </div>
          </ContentTeaserBlock>
        )}

        {/* Live — live now + upcoming streams (NIP-53). Click opens the viewer. */}
        {liveStreams.has && !isHidden("live") && (
          <ContentTeaserBlock icon={<Radio className="h-4 w-4" />} title={liveStreams.liveNow.length > 0 ? "Live now" : "Upcoming live"} onViewAll={scrollToOpenIn} testId="share-block-live" className={orderClass("live")}>
            <div className="space-y-2">
              {[...liveStreams.liveNow, ...liveStreams.upcoming].map((s) => {
                const isLive = s.status === "live";
                const body = (
                  <>
                    <img
                      src={s.image || liveDefault}
                      alt=""
                      loading="lazy"
                      onError={(e) => { if (!e.currentTarget.src.includes("live-default")) e.currentTarget.src = liveDefault; }}
                      className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isLive && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
                          </span>
                        )}
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{s.title}</p>
                      </div>
                      <p className={`mt-0.5 truncate text-xs ${isLive ? "font-semibold text-red-600" : "text-slate-500 dark:text-slate-400"}`}>{isLive ? "Watch live →" : s.timing}</p>
                    </div>
                  </>
                );
                return (
                  <Link key={s.id} href={eventPath({ id: s.id, pubkey: s.authorPubkey }, ["wss://relay.zap.stream", "wss://relay.nostr.band"])} className={`flex items-center gap-3 rounded-xl border bg-white dark:bg-slate-900 p-3 transition-colors hover:border-slate-300 dark:hover:border-slate-700 ${isLive ? "border-red-200" : "border-slate-200 dark:border-slate-800"}`} data-testid="share-live-row">{body}</Link>
                );
              })}
            </div>
          </ContentTeaserBlock>
        )}

        {!profileLoading && !hasContent && (
          <EmptyState
            icon={FileQuestion}
            title="Nothing public yet"
            description="This profile hasn't shared any public posts, media, or details we can show here."
          />
        )}
      </div>

      {/* Open in a Nostr client (shared component, consistent with /e and /a) */}
      <section ref={openInRef} className="mt-6">
        <OpenInApp entity={{ kind: "profile", bech32: npub, uri: nostrUriFor(pubkey, relayHints) }} />
      </section>

      {/* Learn more (Brainstorm public resources) + funnel */}
      <section className="mt-6 rounded-2xl bg-gradient-to-br from-brand-deep/[0.04] to-brand-accent/[0.06] border border-brand-accent/20 p-5 text-center" data-testid="share-learn-more">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>New to Brainstorm?</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">Brainstorm scores reputation from real human connections — no algorithm. See how it works:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a href="/what-is-wot" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3.5 py-2 rounded-full bg-white dark:bg-slate-900 border border-brand-accent/30 text-xs font-semibold text-brand-deep hover:border-brand-accent/60 transition-colors" data-testid="link-what-is-wot">What is a Web of Trust?</a>
          <a href="/about" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3.5 py-2 rounded-full bg-white dark:bg-slate-900 border border-brand-accent/30 text-xs font-semibold text-brand-deep hover:border-brand-accent/60 transition-colors" data-testid="link-about">About Brainstorm</a>
        </div>
        {!loggedIn && (
          <Link href={`/login?invite=${npub}`} className="mt-4 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold transition-colors" data-testid="share-get-started">
            Create your free account <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      {/* Footer */}
      <div className="mt-6 mb-2 text-center">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Shared via <Link href="/" className="font-semibold text-brand-deep hover:underline">Brainstorm</Link> — trust, made visible.
        </p>
      </div>

      {/* Sticky mobile Join bar — a persistent CTA as a logged-out visitor scrolls. */}
      {!loggedIn && (
        <>
          <div className="h-20 sm:hidden" aria-hidden />
          <div className="fixed bottom-[var(--bs-bottom-chrome,0px)] inset-x-0 z-40 sm:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(0,0,0,0.06)]" data-testid="share-invite-sticky">
            <Link
              href={`/login?invite=${npub}&next=${encodeURIComponent(`/p/${npub}`)}`}
              className="w-full inline-flex items-center justify-center gap-1.5 h-12 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold shadow-sm transition-colors"
              data-testid="share-wot-cta-sticky"
            >
              Join free — connect with {displayName.split(" ")[0] || displayName} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}

      <TrustScoreModal
        open={scoreModalOpen}
        onOpenChange={setScoreModalOpen}
        scores={{ personalized: score01, global: houseScore01 }}
      />
      <ShareProfileModal open={shareOpen} onOpenChange={setShareOpen} npub={npub} displayName={displayName} picture={profile.picture} nip05={profile.nip05} canonicalUrl={canonicalUrl} score01={houseScore01} onOwnPage />
      {profile.lud16 && (
        <ZapModal open={zapOpen} onOpenChange={setZapOpen} recipientPubkey={pubkey} lud16={profile.lud16} displayName={displayName} picture={profile.picture} />
      )}

      {/* Owner-only inline personalization (NIP-78). */}
      {isOwner && !editing && (
        <button
          type="button"
          onClick={startCustomize}
          className="fixed bottom-[calc(1rem+var(--bs-bottom-chrome,0px))] right-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-brand-primary-hover"
          data-testid="customize-open"
        >
          <SlidersHorizontal className="h-4 w-4" /> Customize
        </button>
      )}
      {isOwner && (
        <ProfileCustomizer open={editing} draft={draft} onChange={updateDraft} onSave={saveCustomize} onCancel={cancelCustomize} saving={savingPrefs} error={prefsError} followerCandidates={followerCandidates} emptyKeys={emptyKeys} />
      )}
      </ShareNavProvider>
    </ShareShell>
  );
}

function ShareShell({ children, onShare }: { children: React.ReactNode; onShare?: () => void }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      <PublicPageHeader
        maxWidthClass="max-w-4xl"
        actions={onShare ? (
          <button type="button" onClick={onShare} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold transition-colors" data-testid="share-open-modal">
            Share
          </button>
        ) : undefined}
      />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}

function NotFoundCard({ rawId }: { rawId: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center" data-testid="share-not-found">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>Profile not found</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        "{rawId.slice(0, 24)}{rawId.length > 24 ? "…" : ""}" isn't a valid profile link. Share links look like <span className="font-mono">/p/npub1…</span>.
      </p>
      <Link href="/" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-link hover:underline">Go to Brainstorm <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

function safeNpub(pubkey: string): string {
  try { return npubFromPubkey(pubkey); } catch { return ""; }
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
