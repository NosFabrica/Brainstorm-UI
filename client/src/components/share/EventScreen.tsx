import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { naddrForEvent } from "@/lib/articleLinks";
import { isBlankEvent } from "@/lib/blankEvent";
import { DeletedStub } from "@/components/share/DeletedStub";
import { Smartphone, Loader2, MessageSquare, ArrowRight, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VerificationCoin, useTierRing, TierWordChip , useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { fetchEventsByIds, fetchAddressableEvents } from "@/services/nostr";
import { eventStore } from "@/lib/eventStore";
import { useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useLiveProfile, useLiveProfiles } from "@/hooks/useLiveProfile";
import { MAX_REF_HINTS, capHints, mergeNewest } from "@/hooks/useNoteRefs";
import { PROFILE_RELAYS } from "@/lib/relays";
import { NoteTagChips } from "@/components/share/NoteTagChips";
import { useBackupNeed } from "@/hooks/useBackupNeed";
import { apiClient } from "@/services/api";
import { collectRefs, addrCoord, replyRefs, type MinimalEvent } from "@/lib/noteRefs";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { NoteContent } from "@/components/share/NoteContent";
import { AppHero } from "@/components/share/AppHero";
import { FileHero } from "@/components/share/FileHero";
import { isMediaFile } from "@/lib/fileMetadata";
import { RepoHero } from "@/components/share/RepoHero";
import { GitItemHero } from "@/components/share/GitItemHero";
import { isGitItem } from "@/lib/gitStatus";
import { FollowSetHero } from "@/components/share/FollowSetHero";
import { DesignationHero } from "@/components/share/DesignationHero";
import { StructuralHero } from "@/components/share/StructuralHero";
import { TechnicalStrip } from "@/components/share/TechnicalStrip";
import { DListHero } from "@/components/share/DListHero";
import { dlistOfEvent } from "@/lib/dlists";
import { contentShape } from "@/lib/contentShape";
import { AudioHero } from "@/components/share/AudioHero";
import { ListingHero } from "@/components/share/ListingHero";
import { ListingRelated } from "@/components/share/ListingRelated";
import { EventHero } from "@/components/share/EventHero";
import { VideoHero } from "@/components/share/VideoHero";
import { LiveHero } from "@/components/share/LiveHero";
import { EventThread } from "@/components/share/EventThread";
import { ThreadAncestors } from "@/components/share/ThreadAncestors";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { useLightbox } from "@/components/share/Lightbox";
import { EntityMenu } from "@/components/share/EntityMenu";
import { originClientOf } from "@/lib/openInApp";
import { ShareButton } from "@/components/share/ShareButton";
import { MoreFromAuthor } from "@/components/share/MoreFromAuthor";
import { neventFor, npubFromPubkey, nostrUriForEvent, READER_KINDS } from "@/lib/shareId";
import { ArticleScreen, type ArticleEvent } from "@/components/share/ArticleScreen";
import { initialsFor } from "@/lib/profileDefaults";
import { useShareMeta } from "@/hooks/useShareMeta";
import { BrainLogo } from "@/components/BrainLogo";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { useHasSession } from "@/hooks/useHasSession";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import { Nip05Check } from "@/components/Nip05Check";


type ProfileLite = { display_name?: string; name?: string; picture?: string; nip05?: string };
export type EventPointer = { id: string; relays?: string[]; author?: string };

/** Addressable kinds (30000–39999) are commented on by coordinate, not id —
 *  a listing's questions tag `30402:<seller>:<d>`, never the event id. */
function addressCoordOf(ev: { kind: number; pubkey: string; tags: string[][] }): string | undefined {
  if (ev.kind < 30000 || ev.kind >= 40000) return undefined;
  const d = ev.tags.find((t) => t[0] === "d")?.[1];
  return d === undefined ? undefined : `${ev.kind}:${ev.pubkey}:${d}`;
}

export function decodeEventId(raw: string): EventPointer | null {
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
/** NIP-71 videos: normal / short, and their addressable twins (Divine ships 34236). */
const VIDEO_EVENT_KINDS = new Set([21, 22, 34235, 34236]);
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
/**
 * An event's page, however it was named. A `note`/`nevent` hands over a
 * pointer (this exact event, by id); an `naddr` hands over the event it
 * resolved from the address (the latest version). What renders is decided by the event's kind: articles,
 * wiki pages and specs read on the article layout, everything else here.
 */
export function EventScreen({ ptr: given, event }: { ptr?: EventPointer | null; event?: MinimalEvent }) {
  const ptr: EventPointer | null = event ? { id: event.id, author: event.pubkey, relays: given?.relays } : given ?? null;
  const relayHints = ptr?.relays || [];
  const eventQuery = useQuery({
    queryKey: ["event", ptr?.id],
    queryFn: async () => {
      if (!ptr) return null;
      const evs = await fetchEventsByIds([ptr.id], Array.from(new Set([...relayHints, ...PROFILE_RELAYS])));
      return (evs[0] as MinimalEvent) ?? null;
    },
    enabled: !!ptr?.id && !event,
    // An event by id never changes, so a held copy is the answer: no spinner,
    // and no relay asked for what the store already has.
    initialData: () => (ptr?.id ? ((eventStore.getEvent(ptr.id) as MinimalEvent | undefined) ?? undefined) : undefined),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const note = (event ?? eventQuery.data) as MinimalEvent | null | undefined;

  // Deleted by overwriting (lib/blankEvent): the address still resolves, to a
  // husk. Say what happened rather than render an article called "[Deleted]".
  if (note && isBlankEvent(note)) return <DeletedEvent />;
  // The kind decides, before any of the event layout's own queries run.
  if (note && READER_KINDS.has(note.kind)) {
    const d = note.tags.find((t) => t[0] === "d")?.[1] ?? "";
    // An address that won't encode: the event layout still shows it.
    const naddr = naddrForEvent(note, relayHints);
    if (naddr) return <ArticleScreen ev={note as ArticleEvent} naddr={naddr} ptr={{ kind: note.kind, pubkey: note.pubkey, identifier: d, relays: relayHints }} />;
  }
  return <EventView ptr={ptr} note={note} loading={eventQuery.isLoading} />;
}

function DeletedEvent() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <PublicPageHeader />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="py-10" data-testid="event-deleted">
          <DeletedStub />
          <p className="mt-4 text-center">
            <Link href="/" className="text-sm font-semibold text-brand-link hover:underline">Go to Brainstorm →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function EventView({ ptr, note, loading }: { ptr: EventPointer | null; note: MinimalEvent | null | undefined; loading: boolean }) {
  const speed = useConnectionSpeed();
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();
  const relayHints = ptr?.relays || [];
  const loggedIn = useHasSession();
  // Tagging needs a SIGNER, not a session: a session token is backend auth and
  // cannot sign an event, so gating on it would show a button that throws.
  //
  // Under the accounts model an Account *is* a Signer — local, extension, bunker
  // or Amber — so holding one is the whole test. Upstream asked
  // `hasLocalSecretKey() || window.nostr`, which quietly excluded every remote
  // signer; this includes them.
  const canTagNote = !!useActiveAccountDisplay()?.pubkey;

  // Live events (kind 30311) are authored by the streaming platform — the WoT
  // row should be the streamer (the `p`-tagged host), not the platform.
  const liveHost = note?.kind === 30311
    ? note.tags.find((t) => t[0] === "p" && (t[3] || "").toLowerCase() === "host")?.[1] || note.tags.find((t) => t[0] === "p")?.[1]
    : undefined;
  const authorPk = liveHost || note?.pubkey || ptr?.author || "";
  const mediaUrls = useMemo(() => (note && !NOTE_KINDS.has(note.kind) ? eventMediaUrls(note) : []), [note]);

  // The author's held profile at once; the event's own relay hints are asked
  // beside their outbox, and a newer profile replaces it as it lands.
  const authorProfile = useLiveProfile(authorPk || undefined, ptr?.relays ?? []).profile;
  const trustQuery = useQuery({
    queryKey: ["event-author-trust", authorPk],
    queryFn: () => (authorPk ? apiClient.getHouseInfluence(authorPk) : null),
    enabled: !!authorPk,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // References inside the note (quoted notes, articles, mentions) so the rich
  // card can embed them — same two batched queries the share page uses.
  const refs = useMemo(() => collectRefs(note ? [note] : []), [note]);
  const refEventsQuery = useQuery({
    queryKey: ["event-refs", ptr?.id, refs.ids],
    queryFn: () => fetchEventsByIds(refs.ids, Array.from(new Set([...relayHints, ...PROFILE_RELAYS, ...refs.idRelays.slice(0, MAX_REF_HINTS)]))),
    enabled: refs.ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const addrEventsQuery = useQuery({
    queryKey: ["event-addrs", ptr?.id, refs.addrs.map(addrCoord)],
    queryFn: () => fetchAddressableEvents(capHints(refs.addrs), Array.from(new Set([...relayHints, ...PROFILE_RELAYS]))),
    enabled: refs.addrs.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const eventsById = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const ev of (refEventsQuery.data ?? []) as MinimalEvent[]) m.set(ev.id, ev);
    return m;
  }, [refEventsQuery.data]);
  // Referenced articles: the held copy at once, the newer of it and the
  // fetched one after — and any later version the store receives.
  const heldAddrs = useHeldReplaceables(refs.addrs);
  const addrByCoord = useMemo(
    () => mergeNewest(refs.addrs, heldAddrs, (addrEventsQuery.data as Map<string, MinimalEvent> | undefined) ?? new Map()),
    [refs.addrs, heldAddrs, addrEventsQuery.data],
  );

  const allRefPubkeys = useMemo(() => {
    const set = new Set<string>(refs.pubkeys);
    for (const ev of eventsById.values()) set.add(ev.pubkey);
    for (const ev of addrByCoord.values()) set.add(ev.pubkey);
    return Array.from(set);
  }, [refs.pubkeys, eventsById, addrByCoord]);
  const refProfiles = useLiveProfiles(allRefPubkeys);

  const profiles = useMemo(() => {
    const m = new Map<string, ProfileLite>(refProfiles as Map<string, ProfileLite>);
    if (authorPk && authorProfile) m.set(authorPk, authorProfile as ProfileLite);
    return m;
  }, [refProfiles, authorPk, authorProfile]);

  const profile = (authorProfile ?? {}) as ProfileLite;
  const authorName = profile.display_name || profile.name || (authorPk ? npubFromPubkey(authorPk).slice(0, 12) + "…" : "Someone");
  const authorNpub = authorPk ? (() => { try { return npubFromPubkey(authorPk); } catch { return ""; } })() : "";
  const score01 = typeof trustQuery.data === "number" ? trustQuery.data : null;
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
  // Whether the hero below is one of the kind-specific ones, or the generic
  // fallback (media, text, or the structural card). Mirrors the chain in the
  // JSX: a kind with no hero of its own is the one whose publishing client
  // is worth a way back to (the team, 2026-09-24: "open in original client").
  const DEDICATED_KINDS = new Set([30311, 32267, 1063, 30617, 30000, 10040, 31337, 30402, 31922, 31923]);
  const renderedGenerically =
    !!note && !isGitItem(note.kind) && !DEDICATED_KINDS.has(note.kind) && !VIDEO_EVENT_KINDS.has(note.kind) && !NOTE_KINDS.has(note.kind);
  // The ⋯ in the header: copies of the event's ids and "Open in" another
  // client. The URL may have carried a bare id or a note1 — a real nevent
  // is what to copy and what the web apps want.
  const nevent = ptr ? neventFor(ptr.id, relayHints, authorPk || undefined) : "";
  // An addressable event (a listing, a track) also has its address: the
  // link that follows its author's edits, not this one version.
  const naddr = note && note.kind >= 30000 && note.kind < 40000 ? naddrForEvent(note, relayHints) : null;

  // When the thread's anon signup gate is showing, suppress the page's own
  // (now-duplicate) "Who can you trust online?" funnel.
  const [threadGated, setThreadGated] = useState(false);

  // Sign up from here → come back to this exact event afterward.
  const here = typeof window !== "undefined" ? window.location.pathname : "";
  const funnelLoginHref = `/login?${[authorNpub ? `invite=${authorNpub}` : "", here ? `next=${encodeURIComponent(here)}` : ""].filter(Boolean).join("&")}`;

  const openLightbox = useLightbox();
  // Image-only subset of the event's media — the lightbox carousels through these.
  const galleryImages = mediaUrls.filter((u) => !VID_RE.test(u));

  // New in-app accounts that landed here (e.g. via the thread gate) haven't saved
  // a backup yet — surface a slim, dismissible safety + discovery nudge. It asks
  // the same question the rest of the chain does, so it goes quiet for anyone the
  // chain has nothing to ask.
  const [setupDismissed, setSetupDismissed] = useState(false);
  const showSetupNudge = useBackupNeed() !== null && !setupDismissed;


  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
      <PublicPageHeader
        maxWidthClass="max-w-2xl"
        actions={<ShareButton url={typeof window !== "undefined" ? window.location.href : ""} title={`${authorName} on Brainstorm`} />}
      />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        {!ptr ? (
          <div className="text-center py-20">
            <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="mt-3 text-slate-600 dark:text-slate-300 font-medium">That note link isn't valid.</p>
            <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand-link hover:underline">Go to Brainstorm →</Link>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !note ? (
          <div className="text-center py-20">
            <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="mt-3 text-slate-600 dark:text-slate-300 font-medium">We couldn't find this note on the relays.</p>
            {openInApp && (
              <a href={openInApp} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover px-4 py-2 text-sm font-semibold text-white">
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
                  <span className="font-semibold text-slate-900 dark:text-slate-100">You're in.</span>{" "}
                  <Link href="/settings?tab=profile&focus=backup" className="font-semibold text-brand-link hover:underline">Save a backup</Link>
                  <span className="text-slate-600 dark:text-slate-300"> so you never lose this account · </span>
                  <Link href="/" className="font-semibold text-brand-link hover:underline">Explore Brainstorm →</Link>
                </div>
                <button type="button" onClick={() => setSetupDismissed(true)} aria-label="Dismiss" className="shrink-0 rounded-lg p-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-amber-100 transition-colors" data-testid="event-setup-dismiss">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {/* The conversation this reply sits in — parent (+ root) above, so a
                permalinked reply reads in context instead of floating alone. */}
            <ThreadAncestors note={note} relayHints={relayHints} />

            {/* Author header — and the ⋯, on the object it acts on (X puts it
                on the post, not the page). */}
            <div className="flex items-center justify-between gap-3 mb-5">
              <Link href={authorNpub ? `/p/${authorNpub}` : "#"} className="flex items-center gap-2.5 min-w-0 hover:opacity-80">
                <span className="relative shrink-0">
                  <Avatar className={`h-12 w-12 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${tierRing(score01) ?? ""}`}>
                    {profile.picture ? <AvatarImage src={profile.picture} alt={authorName} className="object-cover" /> : null}
                    <AvatarFallback className="rounded-full bg-brand-primary/15 text-brand-primary text-sm font-bold">{initialsFor(authorName)}</AvatarFallback>
                  </Avatar>
                  {typeof score01 === "number" && Number.isFinite(score01) && (
                    <VerificationCoin score01={score01} pov="global" size={22} className={tierRing(score01) && coinReplaced ? "sr-only" : "absolute -bottom-1 -right-1 ring-2 ring-white dark:ring-slate-900 rounded-full"} />
                  )}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100 truncate">{authorName}</span>
                    <Nip05Check nip05={profile.nip05} pubkey={note.pubkey} className="h-4 w-4 text-sky-500 shrink-0" />
                    <TierWordChip score01={score01} />
                  </div>
                  <span className="block text-[13px] text-slate-500 dark:text-slate-400">{ago(note.created_at)}</span>
                </div>
              </Link>
              {ptr && nevent && (
                <EntityMenu
                  entity={{ kind: "event", eventKind: note.kind, bech32: nevent, uri: openInApp, origin: renderedGenerically ? originClientOf(note) : undefined }}
                  copies={[
                    ...(naddr ? [{ id: "naddr", label: "Copy naddr", value: naddr, hint: "Its address: always the latest version" }] : []),
                    { id: "nevent", label: "Copy nevent", value: nevent, hint: "The note's id plus where to find it" },
                    { id: "event-id", label: "Copy event ID", value: ptr.id, hint: "The raw 64-character id" },
                    // The event as fetched from the relay (sig included) — the cast to MinimalEvent is type-only.
                    { id: "event-json", label: "Copy raw JSON", value: JSON.stringify(note, null, 2), hint: "The full signed event, as relays serve it" },
                  ]}
                  triggerTestId="event-menu"
                />
              )}
            </div>

            {/* The technical view's line: kind, ids, a click to copy. Nothing with it off. */}
            {ptr && <TechnicalStrip event={note} ids={nevent ? [{ label: "nevent", value: nevent }] : []} className="mb-3" />}

            {/* The event — notes via the rich card; media kinds render their media. */}
            <div className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${NOTE_KINDS.has(note.kind) ? "p-5 sm:p-7" : "p-4 sm:p-5"} shadow-sm ${replyRefs(note).parentId || replyRefs(note).rootId ? "ring-1 ring-brand-primary/15" : ""}`} data-testid="event-note">
              {dlistOfEvent(note) ? (
                <DListHero event={note} />
              ) : isGitItem(note.kind) ? (
                <GitItemHero event={note} author={{ name: profile.name, displayName: profile.display_name, bot: (profile as { bot?: boolean }).bot === true }} />
              ) : note.kind === 30311 ? (
                <LiveHero event={note} />
              ) : note.kind === 32267 ? (
                <AppHero event={note} />
              ) : note.kind === 1063 && !isMediaFile(note) ? (
                <FileHero event={note} />
              ) : note.kind === 30617 ? (
                <RepoHero event={note} />
              ) : note.kind === 30000 ? (
                <FollowSetHero event={note} />
              ) : note.kind === 10040 ? (
                <DesignationHero event={note} />
              ) : note.kind === 31337 ? (
                <AudioHero event={note} />
              ) : note.kind === 30402 ? (
                <ListingHero event={note} />
              ) : note.kind === 31922 || note.kind === 31923 ? (
                <EventHero event={note} />
              ) : VIDEO_EVENT_KINDS.has(note.kind) ? (
                <VideoHero event={note} />
              ) : NOTE_KINDS.has(note.kind) ? (
                <ShareNoteCard event={note} profiles={profiles} eventsById={eventsById} addrByCoord={addrByCoord} forceExpanded reading />
              ) : mediaUrls.length === 0 && (!note.content?.trim() || contentShape(note.content).kind !== "text") ? (
                // No content to read — none, or ciphertext, or JSON: a structural event, its meaning in its tags.
                <StructuralHero event={note} />
              ) : (
                <div data-testid="event-media">
                  {mediaUrls.map((u, i) =>
                    VID_RE.test(u) ? (
                      <video key={i} src={u} controls preload={videoPreload(speed)} className="mb-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 max-h-[36rem]" />
                    ) : (
                      <img
                        key={i}
                        src={u}
                        alt=""
                        loading="lazy"
                        onClick={() => openLightbox(galleryImages, Math.max(0, galleryImages.indexOf(u)))}
                        className="mb-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 object-contain max-h-[36rem] cursor-zoom-in"
                      />
                    ),
                  )}
                  {note.content?.trim() && (
                    <div className="mt-1">
                      <NoteContent content={note.content} reading profiles={profiles} linkCard tags={note.tags} authorName={profile.display_name || profile.name} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Under a listing: the seller's other things, then similar things
                from other sellers — a shop page that leads somewhere. */}
            {note.kind === 30402 && <ListingRelated event={note} sellerName={authorName} />}

            {/* What the network says this post is ABOUT (rung C2). Sits under
                the note itself, where a reader has just finished it and a
                tagger has the content in view. Reads from relays only, so it
                renders for logged-out visitors too. */}
            <NoteTagChips eventId={note.id} relayHint={relayHints[0]} canTag={canTagNote} />

            {/* Reply thread — teaser-gated for anon, trust-filterable for members. */}
            <EventThread eventId={note.id} addressCoord={addressCoordOf(note)} authorNpub={authorNpub} relayHints={relayHints} onGateChange={setThreadGated} />

            {/* More from this author — keep readers inside Brainstorm. */}
            {authorPk && <MoreFromAuthor pubkey={authorPk} authorName={authorName} author={profile} relayHints={relayHints} excludeId={note.id} excludeContent={note.content} />}

            {/* Anonymous signup funnel — same WoT hook as the profile page. Hidden
                when the thread's own signup gate is already showing (no duplicate),
                and hidden from SIGNED-IN users: it pitches a Web of Trust to people
                who already have one, mid-feed. The comment always said "anonymous",
                but the gate never actually checked. */}
            {!threadGated && !loggedIn && (
            <div className="mt-6 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.04] to-brand-accent/[0.06] p-5 text-center" data-testid="event-funnel">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>Who can you trust online?</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                Brainstorm scores reputation from real human connections — no algorithm. See <span className="font-bold text-slate-900 dark:text-slate-100">{firstName}</span> and everyone else through your own network.
              </p>
              <Link
                href={loggedIn ? (authorNpub ? `/p/${authorNpub}?pov=mywot` : "/") : funnelLoginHref}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                data-testid="event-cta"
              >
                {loggedIn ? "See it through your network" : "Create your free account"} <ArrowRight className="h-4 w-4" />
              </Link>
              {!loggedIn && <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Free, takes a minute — no email required</p>}
              {!loggedIn && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Already part of the network? <Link href={funnelLoginHref} className="font-semibold text-brand-link hover:underline" data-testid="event-funnel-signin">Sign in →</Link>
                </p>
              )}
            </div>
            )}

            <div className="mt-8 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Shared via <Link href="/" className="font-semibold text-brand-deep hover:underline">Brainstorm</Link> — trust, made visible.
              </p>
            </div>
          </ShareNavProvider>
        )}
      </main>
    </div>
  );
}
