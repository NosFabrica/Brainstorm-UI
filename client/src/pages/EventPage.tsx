import { useMemo, useEffect, useState } from "react";
import { useRoute, useSearch, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { ArrowLeft, BadgeCheck, Smartphone, Loader2, MessageSquare, ArrowRight, Share2, Check, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { fetchEventsByIds, fetchAddressableEvents, fetchProfile, fetchProfileMap, getCurrentUser, hasPersistentKey, PROFILE_RELAYS } from "@/services/nostr";
import { apiClient, hasSessionToken } from "@/services/api";
import { collectRefs, addrCoord, type MinimalEvent } from "@/lib/noteRefs";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { NoteContent } from "@/components/share/NoteContent";
import { EventThread } from "@/components/share/EventThread";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { useLightbox } from "@/components/share/Lightbox";
import { OpenInApp } from "@/components/share/OpenInApp";
import { MoreFromAuthor } from "@/components/share/MoreFromAuthor";
import { npubFromPubkey, nostrUriForEvent } from "@/lib/shareId";
import { initialsFor } from "@/lib/profileDefaults";
import { useShareMeta } from "@/hooks/useShareMeta";
import { BrainLogo } from "@/components/BrainLogo";

type ProfileLite = { display_name?: string; name?: string; picture?: string; nip05?: string };
type EventPointer = { id: string; relays?: string[]; author?: string };

function decodeEventId(raw: string): EventPointer | null {
  const s = raw.replace(/^nostr:/, "");
  try {
    const d = nip19.decode(s);
    if (d.type === "note") return { id: d.data as string };
    if (d.type === "nevent") {
      const e = d.data as { id: string; relays?: string[]; author?: string };
      return { id: e.id, relays: e.relays, author: e.author };
    }
  } catch {
    /* fall through */
  }
  if (/^[0-9a-f]{64}$/i.test(s)) return { id: s.toLowerCase() };
  return null;
}

function ago(ts?: number): string {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const NOTE_KINDS = new Set([1, 6, 16]);
const IMG_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const VID_RE = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/**
 * Media URLs for picture/video events (NIP-68 kind-20 etc.): pull the `url`
 * field from `imeta` tags, plus any plain `url` tags, falling back to image/video
 * URLs found in the content text.
 */
function eventMediaUrls(ev: MinimalEvent): string[] {
  const urls: string[] = [];
  for (const t of ev.tags || []) {
    if (t[0] === "imeta") {
      for (const part of t.slice(1)) {
        const m = /^url\s+(\S+)/.exec(part);
        if (m) urls.push(m[1]);
      }
    } else if (t[0] === "url" && t[1]) {
      urls.push(t[1]);
    }
  }
  if (urls.length === 0) {
    for (const m of (ev.content || "").matchAll(/https?:\/\/\S+/gi)) {
      if (IMG_RE.test(m[0]) || VID_RE.test(m[0])) urls.push(m[0]);
    }
  }
  return Array.from(new Set(urls));
}

/**
 * On-site event/note landing page (`/e/:nevent`) — Brainstorm's njump replacement
 * for notes. Resolves an `nevent`/`note` to the event, renders it with our rich
 * note card (mentions, quotes, embedded articles), shows the author's Web-of-Trust
 * tier (our differentiator), and funnels anonymous readers into signup.
 */
export default function EventPage() {
  const [, params] = useRoute("/e/:id");
  const raw = (params?.id || "").replace(/^nostr:/, "");
  const ptr = useMemo(() => decodeEventId(raw), [raw]);
  const relayHints = ptr?.relays || [];
  const loggedIn = hasSessionToken();
  const fromSearch = new URLSearchParams(useSearch()).get("fromSearch") === "1";
  const [, navigate] = useLocation();

  const eventQuery = useQuery({
    queryKey: ["event", ptr?.id],
    queryFn: async () => {
      if (!ptr) return null;
      const evs = await fetchEventsByIds([ptr.id], Array.from(new Set([...relayHints, ...PROFILE_RELAYS])));
      return (evs[0] as MinimalEvent) ?? null;
    },
    enabled: !!ptr?.id,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const note = eventQuery.data as MinimalEvent | null | undefined;
  const authorPk = note?.pubkey || ptr?.author || "";
  const isArticle = note?.kind === 30023;
  const mediaUrls = useMemo(() => (note && !NOTE_KINDS.has(note.kind) ? eventMediaUrls(note) : []), [note]);

  // Long-form events belong on the article reader — hand off to /a.
  useEffect(() => {
    if (!note || !isArticle) return;
    try {
      const d = note.tags.find((t) => t[0] === "d")?.[1] || "";
      const naddr = nip19.naddrEncode({ identifier: d, pubkey: note.pubkey, kind: note.kind, relays: relayHints.slice(0, 4) });
      navigate(`/a/${naddr}`, { replace: true });
    } catch {
      /* ignore */
    }
  }, [note, isArticle, relayHints, navigate]);

  const profileQuery = useQuery({
    queryKey: ["event-author", authorPk],
    queryFn: async () => (authorPk ? (await fetchProfile(authorPk)) ?? null : null),
    enabled: !!authorPk,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const trustQuery = useQuery({
    queryKey: ["event-author-trust", authorPk],
    queryFn: () => (authorPk ? apiClient.getHouseInfluence(authorPk) : null),
    enabled: !!authorPk,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // References inside the note (quoted notes, articles, mentions) so the rich
  // card can embed them — same two batched queries the share page uses.
  const refs = useMemo(() => (note ? collectRefs([note]) : { pubkeys: [], ids: [], addrs: [] }), [note]);
  const refEventsQuery = useQuery({
    queryKey: ["event-refs", ptr?.id, refs.ids],
    queryFn: () => fetchEventsByIds(refs.ids, Array.from(new Set([...relayHints, ...PROFILE_RELAYS]))),
    enabled: refs.ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const addrEventsQuery = useQuery({
    queryKey: ["event-addrs", ptr?.id, refs.addrs.map(addrCoord)],
    queryFn: () => fetchAddressableEvents(refs.addrs, Array.from(new Set([...relayHints, ...PROFILE_RELAYS]))),
    enabled: refs.addrs.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const eventsById = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const ev of (refEventsQuery.data ?? []) as MinimalEvent[]) m.set(ev.id, ev);
    return m;
  }, [refEventsQuery.data]);
  const addrByCoord = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    const src = addrEventsQuery.data as Map<string, MinimalEvent> | undefined;
    if (src) for (const [k, v] of src) m.set(k, v as MinimalEvent);
    return m;
  }, [addrEventsQuery.data]);

  const allRefPubkeys = useMemo(() => {
    const set = new Set<string>(refs.pubkeys);
    for (const ev of eventsById.values()) set.add(ev.pubkey);
    for (const ev of addrByCoord.values()) set.add(ev.pubkey);
    return Array.from(set);
  }, [refs.pubkeys, eventsById, addrByCoord]);
  const refProfilesQuery = useQuery({
    queryKey: ["event-ref-profiles", ptr?.id, allRefPubkeys],
    queryFn: () => fetchProfileMap(allRefPubkeys),
    enabled: allRefPubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const profiles = useMemo(() => {
    const m = new Map<string, ProfileLite>(refProfilesQuery.data ?? new Map());
    if (authorPk && profileQuery.data) m.set(authorPk, profileQuery.data as ProfileLite);
    return m;
  }, [refProfilesQuery.data, authorPk, profileQuery.data]);

  const profile = (profileQuery.data ?? {}) as ProfileLite;
  const authorName = profile.display_name || profile.name || (authorPk ? npubFromPubkey(authorPk).slice(0, 12) + "…" : "Someone");
  const authorNpub = authorPk ? (() => { try { return npubFromPubkey(authorPk); } catch { return ""; } })() : "";
  const score01 = typeof trustQuery.data === "number" ? trustQuery.data : null;
  const tier = score01 != null ? tierForScore(score01) : null;
  const firstName = authorName.split(" ")[0];

  const snippet = (note?.content || "").replace(/\s+/g, " ").trim().slice(0, 160);
  useShareMeta(
    note
      ? {
          title: `${authorName} on Brainstorm`,
          description: snippet || `A note by ${authorName}.`,
          image: profile.picture,
          url: typeof window !== "undefined" ? window.location.href : "",
        }
      : null,
  );

  const openInApp = nostrUriForEvent(ptr?.id || "", relayHints, authorPk || undefined);

  const [copied, setCopied] = useState(false);
  // When the thread's anon signup gate is showing, suppress the page's own
  // (now-duplicate) "Who can you trust online?" funnel.
  const [threadGated, setThreadGated] = useState(false);
  const onShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try { await navigator.share({ title: `${authorName} on Brainstorm`, url }); return; } catch { /* fall through to copy */ }
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  // Sign up from here → come back to this exact event afterward.
  const here = typeof window !== "undefined" ? window.location.pathname : "";
  const funnelLoginHref = `/login?${[authorNpub ? `invite=${authorNpub}` : "", here ? `next=${encodeURIComponent(here)}` : ""].filter(Boolean).join("&")}`;

  const openLightbox = useLightbox();
  // Image-only subset of the event's media — the lightbox carousels through these.
  const galleryImages = mediaUrls.filter((u) => !VID_RE.test(u));

  // New in-app accounts that landed here (e.g. via the thread gate) haven't saved
  // a backup yet — surface a slim, dismissible safety + discovery nudge.
  const me = getCurrentUser();
  const [setupDismissed, setSetupDismissed] = useState(false);
  const showSetupNudge = (() => {
    try {
      return hasPersistentKey() && !!me?.pubkey && localStorage.getItem(`brainstorm_backup_done:${me.pubkey}`) !== "true" && !setupDismissed;
    } catch {
      return false;
    }
  })();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Top bar — pristine for shared-link visitors, "Back to search" for in-app searchers. */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-4 sm:px-6 h-14">
          {fromSearch ? (
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3730a3] hover:underline" data-testid="event-back-to-search">
              <ArrowLeft className="h-4 w-4" /> Back to search
            </Link>
          ) : (
            <Link href="/" className="flex items-center gap-2" data-testid="event-brand">
              <BrainLogo size={26} className="text-indigo-500" />
              <span className="text-lg font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
            </Link>
          )}
          <div className="flex items-center gap-3">
            {authorNpub && (
              <Link href={`/p/${authorNpub}`} className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#333286]">
                View profile <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold transition-colors"
              data-testid="event-share"
            >
              {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Share2 className="h-4 w-4" /> Share</>}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        {!ptr ? (
          <div className="text-center py-20">
            <MessageSquare className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="mt-3 text-slate-600 font-medium">That note link isn't valid.</p>
            <Link href="/" className="mt-3 inline-block text-sm font-semibold text-[#3730a3] hover:underline">Go to Brainstorm →</Link>
          </div>
        ) : eventQuery.isLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !note ? (
          <div className="text-center py-20">
            <MessageSquare className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="mt-3 text-slate-600 font-medium">We couldn't find this note on the relays.</p>
            {openInApp && (
              <a href={openInApp} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] px-4 py-2 text-sm font-semibold text-white">
                <Smartphone className="h-4 w-4" /> Try opening in an app
              </a>
            )}
          </div>
        ) : (
          <ShareNavProvider>
            {/* New-account safety + discovery nudge (in-app accounts, not backed up). */}
            {showSetupNudge && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5" data-testid="event-setup-nudge">
                <div className="min-w-0 flex-1 text-[13px] leading-snug">
                  <span className="font-semibold text-slate-900">You're in.</span>{" "}
                  <Link href="/settings?tab=profile&focus=backup" className="font-semibold text-[#3730a3] hover:underline">Save a backup</Link>
                  <span className="text-slate-600"> so you never lose this account · </span>
                  <Link href="/" className="font-semibold text-[#3730a3] hover:underline">Explore Brainstorm →</Link>
                </div>
                <button type="button" onClick={() => setSetupDismissed(true)} aria-label="Dismiss" className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-amber-100 transition-colors" data-testid="event-setup-dismiss">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {/* Author header */}
            <div className="flex items-center gap-3 mb-4">
              <Link href={authorNpub ? `/p/${authorNpub}` : "#"} className="flex items-center gap-2.5 min-w-0 hover:opacity-80">
                <Avatar className="h-11 w-11 rounded-full bg-white border border-slate-200">
                  {profile.picture ? <AvatarImage src={profile.picture} alt={authorName} className="object-cover" /> : null}
                  <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">{initialsFor(authorName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900 truncate">{authorName}</span>
                    {profile.nip05 && <BadgeCheck className="h-4 w-4 text-sky-500 shrink-0" />}
                  </div>
                  <span className="text-xs text-slate-400">{ago(note.created_at)}</span>
                </div>
              </Link>
              {tier && (
                <span
                  className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: tier.color, backgroundColor: `${tier.color}14`, borderColor: `${tier.color}55` }}
                  title="Author's network Web-of-Trust score"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
                  {tier.name} · {Math.round((score01 ?? 0) * 100)}
                </span>
              )}
            </div>

            {/* The event — notes via the rich card; media kinds render their media. */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm" data-testid="event-note">
              {NOTE_KINDS.has(note.kind) ? (
                <ShareNoteCard event={note} profiles={profiles} eventsById={eventsById} addrByCoord={addrByCoord} forceExpanded />
              ) : (
                <div data-testid="event-media">
                  {mediaUrls.map((u, i) =>
                    VID_RE.test(u) ? (
                      <video key={i} src={u} controls preload="metadata" className="mb-2 w-full rounded-xl border border-slate-200 max-h-[36rem]" />
                    ) : (
                      <img
                        key={i}
                        src={u}
                        alt=""
                        loading="lazy"
                        onClick={() => openLightbox(galleryImages, Math.max(0, galleryImages.indexOf(u)))}
                        className="mb-2 w-full rounded-xl border border-slate-200 object-contain max-h-[36rem] cursor-zoom-in"
                      />
                    ),
                  )}
                  {note.content?.trim() && (
                    <div className="mt-1">
                      <NoteContent content={note.content} profiles={profiles} linkCard />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reply thread — teaser-gated for anon, trust-filterable for members. */}
            <EventThread eventId={note.id} authorNpub={authorNpub} relayHints={relayHints} onGateChange={setThreadGated} />

            {/* More from this author — keep readers inside Brainstorm. */}
            {authorPk && <MoreFromAuthor pubkey={authorPk} authorName={authorName} author={profile} relayHints={relayHints} excludeId={note.id} excludeContent={note.content} />}

            {/* Anonymous signup funnel — same WoT hook as the profile page. Hidden
                when the thread's own signup gate is already showing (no duplicate). */}
            {!threadGated && (
            <div className="mt-6 rounded-2xl border border-[#7c86ff]/25 bg-gradient-to-br from-[#333286]/[0.04] to-[#7c86ff]/[0.06] p-5 text-center" data-testid="event-funnel">
              <p className="text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Who can you trust online?</p>
              <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
                Brainstorm scores reputation from real human connections — no algorithm. See <span className="font-bold text-slate-900">{firstName}</span> and everyone else through your own Web of Trust.
              </p>
              <Link
                href={loggedIn ? (authorNpub ? `/p/${authorNpub}?pov=mywot` : "/") : funnelLoginHref}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                data-testid="event-cta"
              >
                {loggedIn ? "See it through your Web of Trust" : "Create your free account"} <ArrowRight className="h-4 w-4" />
              </Link>
              {!loggedIn && <p className="mt-2 text-[11px] text-slate-400">Free, takes a minute — no email required</p>}
              {!loggedIn && (
                <p className="mt-2 text-xs text-slate-500">
                  Already part of the network? <Link href={funnelLoginHref} className="font-semibold text-[#3730a3] hover:underline" data-testid="event-funnel-signin">Sign in →</Link>
                </p>
              )}
            </div>
            )}

            {/* Secondary escape hatch — open in a Nostr client to reply/zap. */}
            {openInApp && (
              <OpenInApp entity={{ kind: "event", bech32: raw, uri: openInApp }} className="mt-6" />
            )}

            <div className="mt-8 text-center">
              <p className="text-xs text-slate-400">
                Shared via <Link href="/" className="font-semibold text-[#333286] hover:underline">Brainstorm</Link> — trust, made visible.
              </p>
            </div>
          </ShareNavProvider>
        )}
      </main>
    </div>
  );
}
