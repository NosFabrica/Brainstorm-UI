import { CompromisedMark } from "@/components/compromised/CompromisedMark";
import { CompromisedWatermark, WATERMARK_HOST } from "@/components/compromised/CompromisedWatermark";
import { CompromisedAuthorNotice } from "@/components/compromised/CompromisedAuthorNotice";
import { RetiredAuthorNotice } from "@/components/retired/RetiredAuthorNotice";
import { useCompromisedRing } from "@/hooks/useCompromised";
import { useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { naddrForEvent } from "@/lib/articleLinks";
import { isBlankEvent } from "@/lib/blankEvent";
import { DeletedStub } from "@/components/share/DeletedStub";
import { Smartphone, Loader2, MessageSquare, ArrowRight, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  VerificationCoin,
  useTierRing,
  TierWordChip,
  useCoinReplacedByRing,
} from "@/components/score/VerificationCoin";
import { fetchEventsByIds, fetchAddressableEvents } from "@/services/nostr";
import { eventStore } from "@/lib/eventStore";
import { loadEventForPage, seedSearchWithHeld } from "@/services/eventPageLoad";
import { useHeldReplaceables } from "@/hooks/useHeldEvents";
import { useLiveProfile, useLiveProfiles } from "@/hooks/useLiveProfile";
import { MAX_REF_HINTS, capHints, mergeNewest } from "@/hooks/useNoteRefs";
import { PROFILE_RELAYS } from "@/lib/relays";
import { NoteTagChips } from "@/components/share/NoteTagChips";
import { tagAddressOf } from "@/lib/tagTarget";
import { useBackupNeed } from "@/hooks/useBackupNeed";
import { lookupTrustSignals } from "@/services/trustSignals";
import { collectRefs, addrCoord, replyRefs, type MinimalEvent } from "@/lib/noteRefs";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { NoteContent } from "@/components/share/NoteContent";
import { AppHero } from "@/components/share/AppHero";
import { FileHero } from "@/components/share/FileHero";
import { RepoHero } from "@/components/share/RepoHero";
import { GitItemHero } from "@/components/share/GitItemHero";
import { GitReplyHero, GitStatusHero, RepoStateHero } from "@/components/share/GitEventHero";
import { ReleaseHero } from "@/components/share/ReleaseHero";
import { FollowSetHero } from "@/components/share/FollowSetHero";
import { TrustedListHero } from "@/components/share/TrustedListHero";
import { ItemListHero } from "@/components/share/ItemListHero";
import { DesignationHero } from "@/components/share/DesignationHero";
import { StructuralHero } from "@/components/share/StructuralHero";
import { TechnicalStrip } from "@/components/share/TechnicalStrip";
import { DListHero } from "@/components/share/DListHero";
import { DListHeaderHero } from "@/components/share/DListHeaderHero";
import { CuratorFooter } from "@/components/search/cards";
import { ItemPage } from "@/components/items/ItemPage";
import { dlistOfEvent } from "@/lib/dlists";
import { dictionaryConceptOf } from "@/services/dictionary";
import { isDListItem } from "@/lib/dlistFields";
import { itemPageTitle } from "@/lib/itemPageTitle";
import { isReady, useItemView } from "@/hooks/useItemView";
import { useSiteCard } from "@/hooks/useSiteCard";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { contentShape } from "@/lib/contentShape";
import { AudioHero } from "@/components/share/AudioHero";
import { EventMedia } from "@/components/share/EventMedia";
import { SensitiveRevealScope } from "@/components/share/SensitiveMedia";
import { mediaItemsOf } from "@/lib/mediaKind";
import { contentWarningOf } from "@/lib/nip36";
import { EmojiText } from "@/components/ui/custom-emoji";
import { ListingHero } from "@/components/share/ListingHero";
import { ThingHero, ThingSections } from "@/components/share/things";
import { ActivityHero } from "@/components/share/activity";
import { ListingRelated } from "@/components/share/ListingRelated";
import { EventHero } from "@/components/share/EventHero";
import { VideoHero } from "@/components/share/VideoHero";
import { isExpired } from "@/lib/nip40";
import { VIDEO_KINDS, publishedAtOf } from "@/lib/nip71";
import { HighlightHero } from "@/components/share/HighlightQuote";
import { LiveHero } from "@/components/share/LiveHero";
import { MeetingHero } from "@/components/share/MeetingHero";
import { RelayListHero } from "@/components/share/RelayListHero";
import { UserStatusHero } from "@/components/share/UserStatusHero";
import { WebBookmarkHero } from "@/components/share/WebBookmarkHero";
import { ChatContextLine } from "@/components/share/ChatContext";
import { NOTE_KINDS, heroFor } from "@/components/share/heroFor";
import { CHAT_KINDS } from "@/lib/chatMessage";
import { liveHostClaim } from "@/lib/liveStream";
import { LiveHostLine } from "@/components/share/LiveHostLine";
import { EventThread } from "@/components/share/EventThread";
import { ThreadAncestors } from "@/components/share/ThreadAncestors";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { EntityMenu } from "@/components/share/EntityMenu";
import { originClientOf } from "@/lib/openInApp";
import { ShareButton } from "@/components/share/ShareButton";
import { MoreFromAuthor } from "@/components/share/MoreFromAuthor";
import { neventFor, npubFromPubkey, nostrUriForEvent, profilePath, readsAsArticle, shareUrlFor } from "@/lib/shareId";
import { ArticleScreen, type ArticleEvent } from "@/components/share/ArticleScreen";
import { initialsFor } from "@/lib/profileDefaults";
import { useShareMeta } from "@/hooks/useShareMeta";
import { eventShortLink, useMintShortLink } from "@/hooks/useShortLink";
import { shareSnippet } from "@/lib/shareSnippet";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { useHasSession } from "@/hooks/useHasSession";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { Nip05Check } from "@/components/Nip05Check";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";
import { publicPageUrl } from "@/lib/publicOrigin";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";

type ProfileLite = { display_name?: string; name?: string; picture?: string; nip05?: string; website?: string };
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
const byCoord = (events: MinimalEvent[]) =>
  new Map(events.map((e) => [`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e]));

/** What the item view reads before a note is loaded: nothing it could name. */
const NO_ITEM = { kind: 0, tags: [] as string[][] };

export function EventScreen({ ptr: given, event }: { ptr?: EventPointer | null; event?: MinimalEvent }) {
  const ptr: EventPointer | null = event
    ? { id: event.id, author: event.pubkey, relays: given?.relays }
    : (given ?? null);
  const relayHints = ptr?.relays || [];
  // An event by id never changes, so a held copy is the answer: no spinner,
  // and no relay asked for what the store already has — only search, which is
  // given the copy if it lacks one. Otherwise search and the pointer's relays
  // are asked at once, and what search lacks is handed to it (services/eventPageLoad).
  const eventQuery = useStoreEvents(
    ptr?.id && !event ? `event:${ptr.id}` : null,
    ptr?.id && !event ? [{ ids: [ptr.id] }] : null,
    () => {
      const held = eventStore.getEvent(ptr!.id);
      if (!held) return loadEventForPage({ id: ptr!.id, relays: relayHints });
      void seedSearchWithHeld(held).catch(() => {});
      return Promise.resolve([held]);
    },
  );
  const note = (event ?? eventQuery.events[0] ?? (eventQuery.loading ? undefined : null)) as
    MinimalEvent | null | undefined;

  // Deleted by overwriting (lib/blankEvent): the address still resolves, to a
  // husk. Say what happened rather than render an article called "[Deleted]".
  if (note && isBlankEvent(note)) return <DeletedEvent />;
  // Past its NIP-40 expiration, whatever its kind: its author meant it to be gone by
  // now, and "clients SHOULD ignore events that have expired".
  if (note && isExpired(note, Math.floor(Date.now() / 1000))) return <DeletedEvent expired />;
  // A profile event (kind 0) is a person: their page, never its JSON as a structural card.
  if (note?.kind === 0 && profilePath(note.pubkey, relayHints))
    return <Redirect to={profilePath(note.pubkey, relayHints)} replace />;
  // The kind decides, before any of the event layout's own queries run.
  if (note && readsAsArticle(note)) {
    const d = note.tags.find((t) => t[0] === "d")?.[1] ?? "";
    // An address that won't encode: the event layout still shows it.
    const naddr = naddrForEvent(note, relayHints);
    if (naddr)
      return (
        <ArticleScreen
          ev={note as ArticleEvent}
          naddr={naddr}
          ptr={{ kind: note.kind, pubkey: note.pubkey, identifier: d, relays: relayHints }}
        />
      );
  }
  return <EventView ptr={ptr} note={note} loading={eventQuery.loading} />;
}

function DeletedEvent({ expired = false }: { expired?: boolean }) {
  return (
    <div className="min-h-page bg-[#F8FAFC] font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PublicPageHeader />
      <main className={cn(pageWidth("reading"), "py-8")}>
        <div className="py-10" data-testid={expired ? "event-expired" : "event-deleted"}>
          <DeletedStub expired={expired} />
          <p className="mt-4 text-center">
            <Link href="/" className="text-sm font-semibold text-brand-link hover:underline">
              Go to Brainstorm →
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function EventView({
  ptr,
  note,
  loading,
}: {
  ptr: EventPointer | null;
  note: MinimalEvent | null | undefined;
  loading: boolean;
}) {
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();
  const relayHints = ptr?.relays || [];
  const loggedIn = useHasSession();
  const concepts = useDictionaryConcepts();
  // Tagging needs a SIGNER, not a session: a session token is backend auth and
  // cannot sign an event, so gating on it would show a button that throws.
  //
  // Under the accounts model an Account *is* a Signer — local, extension, bunker
  // or Amber — so holding one is the whole test. Upstream asked
  // `hasLocalSecretKey() || window.nostr`, which quietly excluded every remote
  // signer; this includes them.
  const canTagNote = !!useActiveAccountDisplay()?.pubkey;

  // A live event (30311), a space or a meeting (30312, 30313) is often published by a
  // platform for its host, named in a `p` marked Host. That name is the signer's word
  // (anyone can name anyone): the page stays the signer's, and the host is a line under
  // the byline, unconfirmed unless the host's NIP-53 proof says they agreed.
  const liveHost = useMemo(
    () => (note && (note.kind === 30311 || note.kind === 30312 || note.kind === 30313) ? liveHostClaim(note) : null),
    [note],
  );
  // Likewise a zap receipt stays its signer's page: the payer it names is a claim anyone
  // could write (lib/zapRequest), so only its hero names them, and says how sure.
  const authorPk = note?.pubkey || ptr?.author || "";
  // Who signed it, for the links that name the event: never a host or a payer it only names.
  const eventAuthor = note?.pubkey ?? ptr?.author;
  // The files a kind with no hero of its own carries (a kind-20 picture post, a
  // comment's imeta), each drawn as what it is — every one of them, its words'
  // links too, so a sensitive post is one cover and one lightbox, each with its alt.
  // A repost's tags are the reposted note's business, not files of its own.
  const mediaItems = useMemo(() => (note && note.kind !== 6 && note.kind !== 16 ? mediaItemsOf(note) : []), [note]);
  // What the media draws, the words beside it leave out (NoteContent `skipUrls`).
  const mediaUrls = useMemo(() => new Set(mediaItems.map((item) => item.url)), [mediaItems]);
  // Under a note card, only the files its text never mentions: the card draws
  // every linked file itself, extensionless Blossom links included.
  const imetaOnlyMedia = useMemo(
    () => (note ? mediaItems.filter((item) => !note.content.includes(item.url)) : []),
    [note, mediaItems],
  );
  // A picture post's own title (NIP-68 kind 20), above its pictures.
  const mediaTitle = note?.tags.find((t) => t[0] === "title")?.[1]?.trim();

  // The author's held profile at once; the event's own relay hints are asked
  // beside their outbox, and a newer profile replaces it as it lands.
  const authorProfile = useLiveProfile(authorPk || undefined, ptr?.relays ?? []).profile;
  const compromisedRing = useCompromisedRing(authorPk || undefined);
  const trustQuery = useQuery({
    // The ring every author list draws (services/trustSignals): the house
    // overview's own influence, batched with the page's other authors and
    // asked once a session, instead of a whole overview for one number.
    queryKey: ["author-trust-signals", authorPk],
    queryFn: async () => (authorPk ? (await lookupTrustSignals(authorPk)).influence : null),
    enabled: !!authorPk,
  });

  // An item of a Dictionary concept is drawn from its definition. Until this device knows the
  // concepts (its first visit), a list item waits for them rather than draw its tags and swap.
  const dlist = useMemo(() => (note ? dlistOfEvent(note) : null), [note]);
  const asDictionaryItem =
    !!note && (!!dictionaryConceptOf(note, concepts.rendered) || (!concepts.known && isDListItem(note) && !dlist));
  // The hero the page draws, decided once: the chain below, the origin client, the refs
  // asked for and the thread above all read it (heroFor).
  const hero = useMemo(() => (note ? heroFor(note, asDictionaryItem) : null), [note, asDictionaryItem]);
  // The generic fallback with no words to read (none, ciphertext, JSON): the structural card.
  const structural =
    !!note &&
    hero === null &&
    mediaItems.length === 0 &&
    (!note.content?.trim() || contentShape(note.content).kind !== "text");
  // References inside the note (quoted notes, articles, mentions) so the rich
  // card can embed them — same two batched queries the share page uses. Only a
  // page that draws the note's words asks: every other hero asks for what it
  // names itself, a fold at a time (a bookmark set's items, a follow set's or a
  // Trusted People list's thousands of members, an activity's post).
  const refs = useMemo(
    () => collectRefs(note && (hero === "note" || (hero === null && !structural)) ? [note] : []),
    [note, hero, structural],
  );
  const refEventsQuery = useStoreEvents(
    refs.ids.length ? `event-refs:${refs.ids.join(",")}` : null,
    refs.ids.length ? [{ ids: refs.ids }] : null,
    () =>
      fetchEventsByIds(
        refs.ids,
        Array.from(new Set([...relayHints, ...PROFILE_RELAYS, ...refs.idRelays.slice(0, MAX_REF_HINTS)])),
      ),
  );
  // The held copies render through `heldAddrs` below; this only fills the store.
  const addrEventsQuery = useStoreEvents(
    refs.addrs.length ? `event-addrs:${refs.addrs.map(addrCoord).join(",")}` : null,
    null,
    async () =>
      Array.from(
        (
          await fetchAddressableEvents(capHints(refs.addrs), Array.from(new Set([...relayHints, ...PROFILE_RELAYS])))
        ).values(),
      ),
  );

  const eventsById = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const ev of (refEventsQuery.events ?? []) as MinimalEvent[]) m.set(ev.id, ev);
    return m;
  }, [refEventsQuery.events]);
  // Referenced articles: the held copy at once, the newer of it and the
  // fetched one after — and any later version the store receives.
  const heldAddrs = useHeldReplaceables(refs.addrs);
  const addrByCoord = useMemo(
    () => mergeNewest(refs.addrs, heldAddrs, byCoord(addrEventsQuery.events as MinimalEvent[])),
    [refs.addrs, heldAddrs, addrEventsQuery.events],
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
  const authorNpub = authorPk
    ? (() => {
        try {
          return npubFromPubkey(authorPk);
        } catch {
          return "";
        }
      })()
    : "";
  const authorName = profile.display_name || profile.name || (authorNpub ? authorNpub.slice(0, 12) + "…" : "Someone");
  const score01 = typeof trustQuery.data === "number" ? trustQuery.data : null;
  const firstName = authorName.split(" ")[0];

  // A list item's page is named for the item — "vitorpamplona · GitHub Account" — not for who listed it.
  const itemView = useItemView(note ?? NO_ITEM);
  // A place's own website gives a picture (through our link-preview origin); a shared link previews with it.
  const siteCard = useSiteCard(isReady(itemView) ? (itemView.shown.link?.href ?? null) : null);
  const itemTitle =
    asDictionaryItem && isReady(itemView) ? itemPageTitle(itemView.shown, itemView.resolved.governing.singular) : null;
  const pageTitle = `${itemTitle ?? authorName} on Brainstorm`;

  // A kind whose content is no words (a voice message's file, a reaction's "+", a repost's JSON) is said in words.
  const snippet = note ? shareSnippet(note) : "";
  // A list item is shared by its address: an id link someone arrived by goes stale at the next import.
  const pageUrl = publicPageUrl();
  const shareUrl = note && pageUrl ? shareUrlFor(note, pageUrl, relayHints) : pageUrl;
  const mintShortUrl = useMintShortLink(
    note ? eventShortLink(note, { relays: relayHints }) : { kind: "event", key: "" },
  );
  useShareMeta(
    note
      ? {
          title: pageTitle,
          description: itemTitle
            ? (isReady(itemView) && itemView.shown.summary) || `Listed by ${authorName}.`
            : snippet || `A note by ${authorName}.`,
          image: (itemTitle && (isReady(itemView) ? itemView.shown.image : null)) || siteCard?.image || profile.picture,
          url: shareUrl,
        }
      : null,
  );

  const openInApp = nostrUriForEvent(ptr?.id || "", relayHints, eventAuthor || undefined);
  // Whether the hero below is one of the kind-specific ones, or the generic
  // fallback (media, text, or the structural card): a kind with no hero of its
  // own is the one whose publishing client is worth a way back to (the team,
  // 2026-09-24: "open in original client").
  const renderedGenerically = !!note && hero === null;
  // The ⋯ in the header: copies of the event's ids and "Open in" another
  // client. The URL may have carried a bare id or a note1 — a real nevent
  // is what to copy and what the web apps want.
  const nevent = ptr ? neventFor(ptr.id, relayHints, eventAuthor || undefined) : "";
  // An addressable event (a listing, a track) also has its address: the
  // link that follows its author's edits, not this one version.
  const naddr = note && note.kind >= 30000 && note.kind < 40000 ? naddrForEvent(note, relayHints) : null;
  const entityMenu =
    ptr && nevent && note ? (
      <EntityMenu
        entity={{
          kind: "event",
          eventKind: note.kind,
          bech32: nevent,
          uri: openInApp,
          origin: renderedGenerically ? originClientOf(note) : undefined,
        }}
        copies={[
          { id: "link", label: "Copy link", value: shareUrl, mint: mintShortUrl },
          ...(naddr
            ? [
                {
                  id: "naddr",
                  label: "Copy naddr",
                  value: naddr,
                  hint: "Its address: always the latest version",
                },
              ]
            : []),
          { id: "nevent", label: "Copy nevent", value: nevent, hint: "The note's id plus where to find it" },
          { id: "event-id", label: "Copy event ID", value: ptr.id, hint: "The raw 64-character id" },
          // The event as fetched from the relay (sig included) — the cast to MinimalEvent is type-only.
          {
            id: "event-json",
            label: "Copy raw JSON",
            value: JSON.stringify(note, null, 2),
            hint: "The full signed event, as relays serve it",
          },
        ]}
        triggerTestId="event-menu"
      />
    ) : null;
  // A list's items and headers are about the thing listed, not who listed it: the
  // lister is a quiet "Listed by" under it, as on the results card, instead of the
  // header a post or an article gets (the team, 2026-10-01).
  const quietAuthor = !!note && (!!dlist || asDictionaryItem || note.kind === 39998 || note.kind === 9998);

  // A zap, a reaction, a report…: its hero is the page, with no thread or topics of its own.
  const activityPage = hero === "activity";
  // The conversation above: not above a hero that draws what the event is about itself —
  // an activity's post, a git status's or a legacy git reply's issue or patch.
  const showAncestors = hero !== "activity" && hero !== "git-status" && hero !== "git-reply";
  const thread = useMemo(() => (note && showAncestors ? replyRefs(note) : {}), [note, showAncestors]);

  // When the thread's anon signup gate is showing, suppress the page's own
  // (now-duplicate) "Who can you trust online?" funnel.
  const [threadGated, setThreadGated] = useState(false);

  // Sign up from here → come back to this exact event afterward.
  const here = typeof window !== "undefined" ? window.location.pathname : "";
  const funnelLoginHref = `/login?${[authorNpub ? `invite=${authorNpub}` : "", here ? `next=${encodeURIComponent(here)}` : ""].filter(Boolean).join("&")}`;

  // New in-app accounts that landed here (e.g. via the thread gate) haven't saved
  // a backup yet — surface a slim, dismissible safety + discovery nudge. It asks
  // the same question the rest of the chain does, so it goes quiet for anyone the
  // chain has nothing to ask.
  const [setupDismissed, setSetupDismissed] = useState(false);
  const showSetupNudge = useBackupNeed() !== null && !setupDismissed;

  return (
    <div className="min-h-page bg-[#F8FAFC] dark:bg-slate-950">
      <PublicPageHeader actions={<ShareButton url={shareUrl} title={pageTitle} mint={mintShortUrl} />} />

      <main className={cn(pageWidth("reading"), "py-6 sm:py-8")}>
        {!ptr ? (
          <div className="py-20 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-medium text-slate-600 dark:text-slate-300">That note link isn't valid.</p>
            <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand-link hover:underline">
              Go to Brainstorm →
            </Link>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !note ? (
          <div className="py-20 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-medium text-slate-600 dark:text-slate-300">
              We couldn't find this note on the relays.
            </p>
            {openInApp && (
              <a
                href={openInApp}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover"
              >
                <Smartphone className="h-4 w-4" /> Try opening in an app
              </a>
            )}
          </div>
        ) : (
          <ShareNavProvider>
            {/* New-account safety + discovery nudge (in-app accounts, not backed up). */}
            {showSetupNudge && (
              <div
                className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5"
                data-testid="event-setup-nudge"
              >
                <div className="min-w-0 flex-1 text-[13px] leading-snug">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">You're in.</span>{" "}
                  <Link
                    href="/settings?tab=profile&focus=backup"
                    className="font-semibold text-brand-link hover:underline"
                  >
                    Save a backup
                  </Link>
                  <span className="text-slate-600 dark:text-slate-300"> so you never lose this account · </span>
                  <Link href="/" className="font-semibold text-brand-link hover:underline">
                    Explore Brainstorm →
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setSetupDismissed(true)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-amber-100 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                  data-testid="event-setup-dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {/* The conversation this reply sits in — parent (+ root) above, so a
                permalinked reply reads in context instead of floating alone.
                Not above an activity: its hero quotes the post a reaction or zap is about. */}
            {showAncestors && <ThreadAncestors note={note} relayHints={relayHints} />}

            {/* Author header — and the ⋯, on the object it acts on (X puts it
                on the post, not the page). A list event keeps only the ⋯ here. */}
            {quietAuthor ? (
              entityMenu && <div className="mb-3 flex justify-end">{entityMenu}</div>
            ) : (
              <div className="mb-5 flex items-center justify-between gap-3">
                <Link
                  href={authorNpub ? `/p/${authorNpub}` : "#"}
                  className="flex min-w-0 items-center gap-2.5 hover:opacity-80"
                >
                  <span className="relative shrink-0">
                    <Avatar
                      className={`h-12 w-12 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${compromisedRing ?? tierRing(score01) ?? ""}`}
                    >
                      {profile.picture ? (
                        <AvatarImage src={profile.picture} alt={authorName} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="rounded-full bg-brand-primary/15 text-sm font-bold text-brand-primary">
                        {initialsFor(authorName)}
                      </AvatarFallback>
                    </Avatar>
                    {typeof score01 === "number" && Number.isFinite(score01) && (
                      <VerificationCoin
                        score01={score01}
                        pov="global"
                        size={22}
                        className={
                          tierRing(score01) && coinReplaced
                            ? "sr-only"
                            : "absolute -bottom-1 -right-1 rounded-full ring-2 ring-white dark:ring-slate-900"
                        }
                      />
                    )}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100">
                        <ProfileEmojiText pubkey={authorPk} text={authorName} />
                      </span>
                      <Nip05Check nip05={profile.nip05} pubkey={authorPk} className="h-4 w-4 shrink-0 text-sky-500" />
                      <TierWordChip score01={score01} />
                      <CompromisedMark pubkey={authorPk} />
                    </div>
                    {/* A video says when it was published: a restored Vine's created_at is its import day. */}
                    <span className="block text-[13px] text-slate-500 dark:text-slate-400" data-testid="event-date">
                      {ago(VIDEO_KINDS.has(note.kind) ? publishedAtOf(note) : note.created_at)}
                    </span>
                  </div>
                </Link>
                {entityMenu}
              </div>
            )}

            {/* A compromised author: said under the byline, before the reader reads on. */}
            <CompromisedAuthorNotice pubkey={authorPk} postedAt={note.created_at} eventId={note.id} className="mb-4" />
            {/* A retired author: one calm line, and where its owner is now. */}
            <RetiredAuthorNotice pubkey={authorPk} className="mb-4" />

            {/* The host a stream or meeting names, when someone else signed it. */}
            {liveHost && liveHost.pubkey !== note.pubkey && <LiveHostLine host={liveHost} className="-mt-2 mb-4" />}

            {/* The technical view's line: kind, ids, a click to copy. Nothing with it off. */}
            {ptr && (
              <TechnicalStrip event={note} ids={nevent ? [{ label: "nevent", value: nevent }] : []} className="mb-3" />
            )}

            {/* The event — notes via the rich card; media kinds render their media. */}
            <div
              className={`${WATERMARK_HOST} rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${NOTE_KINDS.has(note.kind) || note.kind === 9802 ? "p-5 sm:p-7" : "p-4 sm:p-5"} shadow-sm ${thread.parentId || thread.rootId ? "ring-1 ring-brand-primary/15" : ""}`}
              data-testid="event-note"
            >
              <CompromisedWatermark pubkey={authorPk} postedAt={note.created_at} eventId={note.id} />
              {hero === "dlist" ? (
                <DListHero event={note} />
              ) : hero === "dlist-header" ? (
                // Any other list's header: the list and its items, its tags behind "Advanced view".
                <DListHeaderHero event={note} />
              ) : hero === "dictionary-item" ? (
                // An item of a Dictionary concept: its concept's own page (ADR 0007), else drawn from its definition (ADR 0004).
                <ItemPage event={note} />
              ) : hero === "git-item" ? (
                <GitItemHero
                  event={note}
                  author={{
                    name: profile.name,
                    displayName: profile.display_name,
                    bot: (profile as { bot?: boolean }).bot === true,
                  }}
                />
              ) : hero === "live" ? (
                <LiveHero event={note} />
              ) : hero === "meeting" ? (
                // A NIP-53 meeting space or a meeting in one: its state, its way in, its people and their roles.
                <MeetingHero event={note} />
              ) : hero === "relay-list" ? (
                <RelayListHero event={note} />
              ) : hero === "user-status" ? (
                <UserStatusHero event={note} />
              ) : hero === "web-bookmark" ? (
                <WebBookmarkHero event={note} />
              ) : hero === "app" ? (
                <AppHero event={note} />
              ) : hero === "file" ? (
                // Any file: an installer offered for download, a picture, video or sound drawn as what it is.
                <FileHero event={note} />
              ) : hero === "repo" ? (
                <RepoHero event={note} />
              ) : hero === "git-status" ? (
                // A NIP-34 status: what it set, on which issue, patch or PR.
                <GitStatusHero event={note} />
              ) : hero === "repo-state" ? (
                <RepoStateHero event={note} />
              ) : hero === "git-reply" ? (
                // A reply from before NIP-34 moved replies to NIP-22 comments.
                <GitReplyHero event={note} />
              ) : hero === "release" ? (
                <ReleaseHero event={note} />
              ) : hero === "follow-set" ? (
                <FollowSetHero event={note} />
              ) : hero === "trusted-list" ? (
                <TrustedListHero event={note} />
              ) : hero === "designation" ? (
                <DesignationHero event={note} />
              ) : hero === "item-list" ? (
                // Bookmarks, bookmark sets, curation sets, pins: the things it holds.
                <ItemListHero event={note} />
              ) : hero === "audio" ? (
                // A track, a podcast episode or trailer, a voice message, an audio header.
                <AudioHero event={note} />
              ) : hero === "listing" ? (
                <ListingHero event={note} sellerName={authorName} />
              ) : hero === "calendar" ? (
                <EventHero event={note} />
              ) : hero === "activity" ? (
                // Zaps, reactions, deletions, reports, labels, votes, RSVPs, follows, trust scores.
                // Keyed by the event: a reveal or an open fold is that event's, never the next one's.
                <ActivityHero key={note.id} event={note} />
              ) : hero === "thing" ? (
                // Communities, fundraisers, reviews, shops, apps, calendars,
                // badges, emoji packs, playlists, lessons, torrents (lib/thing).
                <ThingHero event={note} />
              ) : hero === "video" ? (
                <VideoHero event={note} nip05={profile.nip05} />
              ) : hero === "highlight" ? (
                // A NIP-84 highlight: the passage marked in its paragraph, and the text it is from.
                <HighlightHero event={note} />
              ) : hero === "note" ? (
                <SensitiveRevealScope key={note.id}>
                  {CHAT_KINDS.has(note.kind) && <ChatContextLine event={note} className="mb-3" />}
                  <ShareNoteCard
                    event={note}
                    profiles={profiles}
                    eventsById={eventsById}
                    addrByCoord={addrByCoord}
                    forceExpanded
                    reading
                    relayHints={relayHints}
                  />
                  {/* A file only its imeta names (a comment's voice clip): the text never draws it. */}
                  {imetaOnlyMedia.length > 0 && (
                    <div className="mt-3">
                      <EventMedia key={note.id} event={note} items={imetaOnlyMedia} />
                    </div>
                  )}
                </SensitiveRevealScope>
              ) : structural ? (
                // No content to read — none, or ciphertext, or JSON: a structural event, its meaning in its tags.
                <StructuralHero event={note} />
              ) : (
                <div data-testid="event-media">
                  {mediaTitle && (
                    <h1
                      className="mb-3 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="event-media-title"
                    >
                      <EmojiText text={mediaTitle} tags={note} />
                    </h1>
                  )}
                  <SensitiveRevealScope key={note.id}>
                    <EventMedia event={note} items={mediaItems} />
                    {note.content?.trim() && (
                      <div className="mt-1">
                        <NoteContent
                          key={note.id}
                          content={note.content}
                          reading
                          profiles={profiles}
                          linkCard
                          tags={note.tags}
                          authorName={profile.display_name || profile.name}
                          embedThings
                          contentWarning={contentWarningOf(note)}
                          skipUrls={mediaUrls}
                        />
                      </div>
                    )}
                  </SensitiveRevealScope>
                </div>
              )}
              {quietAuthor && (
                <Link
                  href={authorNpub ? `/p/${authorNpub}` : "#"}
                  className="mt-5 block hover:opacity-80"
                  data-testid="event-listed-by"
                >
                  <CuratorFooter
                    kicker="Listed by"
                    author={{
                      pubkey: note.pubkey,
                      npub: authorNpub,
                      name: profile.name,
                      displayName: profile.display_name,
                      picture: profile.picture,
                    }}
                    score={score01}
                    created_at={note.created_at}
                  />
                </Link>
              )}
            </div>

            {/* Under a listing: the seller's other things, then similar things
                from other sellers — a shop page that leads somewhere. */}
            {hero === "listing" && <ListingRelated event={note} sellerName={authorName} />}

            {/* Under a thing: what the network holds around it — a community's
                posts, a fundraiser's supporters, a calendar's events… */}
            {hero === "thing" && <ThingSections event={note} />}

            {/* What the network says this post is ABOUT (rung C2). Sits under
                the note itself, where a reader has just finished it and a
                tagger has the content in view. Reads from relays only, so it
                renders for logged-out visitors too. */}
            {!activityPage && (
              <NoteTagChips
                eventId={note.id}
                // A listing, an article, a DList item: tagged by coordinate, so a tag survives its next edit (#334).
                address={tagAddressOf(note)}
                relayHint={relayHints[0]}
                canTag={canTagNote}
                // Named as what it is: "Tag this issue", "Tag this repo"; a Dictionary item
                // as its list calls it, "Tag this GitHub account" (lib/taggable).
                item={note}
                list={asDictionaryItem && isReady(itemView) ? itemView.resolved.governing : null}
              />
            )}

            {/* Reply thread — teaser-gated for anon, trust-filterable for members.
                Not under a zap, a reaction or a report: nobody replies to those,
                and asking the relays for their replies is a REQ per visit for nothing
                (as their ancestors and refs are not asked for either). */}
            {!activityPage && (
              <EventThread
                eventId={note.id}
                addressCoord={addressCoordOf(note)}
                authorNpub={authorNpub}
                relayHints={relayHints}
                onGateChange={setThreadGated}
              />
            )}

            {/* More from this author — keep readers inside Brainstorm. Not under a list
                event: who listed a GitHub account says nothing about the account. */}
            {authorPk && !quietAuthor && (
              <MoreFromAuthor
                pubkey={authorPk}
                authorName={authorName}
                author={profile}
                relayHints={relayHints}
                excludeId={note.id}
                excludeContent={note.content}
                event={note}
              />
            )}

            {/* Anonymous signup funnel — same WoT hook as the profile page. Hidden
                when the thread's own signup gate is already showing (no duplicate),
                and hidden from SIGNED-IN users: it pitches a Web of Trust to people
                who already have one, mid-feed. The comment always said "anonymous",
                but the gate never actually checked. */}
            {!threadGated && !loggedIn && (
              <div
                className="mt-6 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.04] to-brand-accent/[0.06] p-5 text-center"
                data-testid="event-funnel"
              >
                <p
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Who can you trust online?
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-slate-300">
                  Brainstorm scores reputation from real human connections — no algorithm. See{" "}
                  <span className="font-bold text-slate-900 dark:text-slate-100">{firstName}</span> and everyone else
                  through your own network.
                </p>
                <Link
                  href={loggedIn ? (authorNpub ? `/p/${authorNpub}?pov=mywot` : "/") : funnelLoginHref}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
                  data-testid="event-cta"
                >
                  {loggedIn ? "See it through your network" : "Create your free account"}{" "}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {!loggedIn && (
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    Free, takes a minute — no email required
                  </p>
                )}
                {!loggedIn && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Already part of the network?{" "}
                    <Link
                      href={funnelLoginHref}
                      className="font-semibold text-brand-link hover:underline"
                      data-testid="event-funnel-signin"
                    >
                      Sign in →
                    </Link>
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Shared via{" "}
                <Link href="/" className="font-semibold text-brand-deep hover:underline">
                  Brainstorm
                </Link>{" "}
                — trust, made visible.
              </p>
            </div>
          </ShareNavProvider>
        )}
      </main>
    </div>
  );
}
