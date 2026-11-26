import { CompromisedWatermark, WATERMARK_HOST } from "@/components/compromised/CompromisedWatermark";
import { CompromisedAuthorNotice } from "@/components/compromised/CompromisedAuthorNotice";
import { RetiredAuthorNotice } from "@/components/retired/RetiredAuthorNotice";
import { useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { naddrForEvent } from "@/lib/articleLinks";
import { isBlankEvent } from "@/lib/blankEvent";
import { useEventDeleted } from "@/components/share/eventDeletion";
import { eventStore } from "@/lib/eventStore";
import { loadEventForPage, seedSearchWithHeld } from "@/services/eventPageLoad";
import { NoteTagChips } from "@/components/share/NoteTagChips";
import { tagAddressOf } from "@/lib/tagTarget";
import { useBackupNeed } from "@/hooks/useBackupNeed";
import { replyRefs, type MinimalEvent } from "@/lib/noteRefs";
import { TechnicalStrip } from "@/components/share/TechnicalStrip";
import { CuratorFooter } from "@/components/search/cards";
import { ItemPage } from "@/components/items/ItemPage";
import { dlistOfEvent } from "@/lib/dlists";
import { dictionaryConceptOf } from "@/services/dictionary";
import { isDListItem } from "@/lib/dlistFields";
import { itemPageTitle } from "@/lib/itemPageTitle";
import { isReady, useItemView } from "@/hooks/useItemView";
import { useSiteCard } from "@/hooks/useSiteCard";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { ThingSections } from "@/components/share/things";
import { ListingRelated } from "@/components/share/ListingRelated";
import { isExpired } from "@/lib/nip40";
import { pageReadsRoomy, pageSurfaceOf } from "@/lib/kindSurfaces";
import { liveHostClaim } from "@/lib/liveStream";
import { LiveHostLine } from "@/components/share/LiveHostLine";
import { EventThread } from "@/components/share/EventThread";
import { ThreadAncestors } from "@/components/share/ThreadAncestors";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { ShareButton } from "@/components/share/ShareButton";
import { MoreFromAuthor } from "@/components/share/MoreFromAuthor";
import { neventFor, nostrUriForEvent, profilePath, readsAsArticle, shareUrlFor } from "@/lib/shareId";
import { ArticleScreen, type ArticleEvent } from "@/components/share/ArticleScreen";
import { useShareMeta } from "@/hooks/useShareMeta";
import { eventShortLink, useMintShortLink } from "@/hooks/useShortLink";
import { shareSnippet } from "@/lib/shareSnippet";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { useHasSession } from "@/hooks/useHasSession";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { publicPageUrl } from "@/lib/publicOrigin";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import { DeletedEvent } from "@/components/share/eventPage/DeletedEvent";
import { EventByline } from "@/components/share/eventPage/EventByline";
import { EventFunnel } from "@/components/share/eventPage/EventFunnel";
import { EventMenu } from "@/components/share/eventPage/EventMenu";
import { EventLinkInvalid, EventLoading, EventNotFound } from "@/components/share/eventPage/EventPageStates";
import { EventPageHero } from "@/components/share/eventPage/EventPageHero";
import { EventSetupNudge } from "@/components/share/eventPage/EventSetupNudge";
import { type EventPointer } from "@/components/share/eventPage/eventPointer";
import { useEventAuthor } from "@/components/share/eventPage/useEventAuthor";
import { useEventMedia } from "@/components/share/eventPage/useEventMedia";
import { useEventRefs } from "@/components/share/eventPage/useEventRefs";

// Where the app's routes have always found them.
export { decodeEventId, type EventPointer } from "@/components/share/eventPage/eventPointer";

/** Addressable kinds (30000–39999) are commented on by coordinate, not id —
 *  a listing's questions tag `30402:<seller>:<d>`, never the event id. */
function addressCoordOf(ev: { kind: number; pubkey: string; tags: string[][] }): string | undefined {
  if (ev.kind < 30000 || ev.kind >= 40000) return undefined;
  const d = ev.tags.find((t) => t[0] === "d")?.[1];
  return d === undefined ? undefined : `${ev.kind}:${ev.pubkey}:${d}`;
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
 * The hero, and every gate around it, is the kind's row of lib/kindSurfaces.
 */

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
  // Its author's NIP-09 deletion, asked for as the page opens.
  const deleted = useEventDeleted(note, relayHints);

  // Deleted by overwriting (lib/blankEvent): the address still resolves, to a
  // husk. Say what happened rather than render an article called "[Deleted]".
  if (note && (isBlankEvent(note) || deleted)) return <DeletedEvent />;
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

function EventView({
  ptr,
  note,
  loading,
}: {
  ptr: EventPointer | null;
  note: MinimalEvent | null | undefined;
  loading: boolean;
}) {
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
  const media = useEventMedia(note);

  const { authorProfile, profile, compromisedRing, authorNpub, authorName, score01 } = useEventAuthor(
    authorPk,
    ptr?.relays ?? [],
  );

  // An item of a Dictionary concept is drawn from its definition. Until this device knows the
  // concepts (its first visit), a list item waits for them rather than draw its tags and swap.
  const dlist = useMemo(() => (note ? dlistOfEvent(note) : null), [note]);
  const asDictionaryItem =
    !!note && (!!dictionaryConceptOf(note, concepts.rendered) || (!concepts.known && isDListItem(note) && !dlist));
  // What the page draws, decided once (lib/kindSurfaces): the hero below, the origin
  // client, the refs asked for, the thread above and the sections under it all read it.
  const surface = useMemo(
    () => (note ? pageSurfaceOf(note, { asDictionaryItem, hasMedia: media.items.length > 0 }) : null),
    [note, asDictionaryItem, media.items],
  );
  // Only a page that draws the note's words asks for what they quote and mention.
  const { eventsById, addrByCoord, profiles } = useEventRefs(note && surface?.collectsRefs ? note : null, relayHints, {
    pubkey: authorPk,
    profile: authorProfile,
  });

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
  // The ⋯ in the header. The URL may have carried a bare id or a note1 — a real
  // nevent is what to copy and what the web apps want.
  const nevent = ptr ? neventFor(ptr.id, relayHints, eventAuthor || undefined) : "";
  // An addressable event (a listing, a track) also has its address: the
  // link that follows its author's edits, not this one version.
  const naddr = note && note.kind >= 30000 && note.kind < 40000 ? naddrForEvent(note, relayHints) : null;
  const entityMenu =
    ptr && nevent && note ? (
      <EventMenu
        note={note}
        id={ptr.id}
        nevent={nevent}
        naddr={naddr}
        uri={openInApp}
        shareUrl={shareUrl}
        mint={mintShortUrl}
        // A kind drawn generically (media, text, or the structural card) names its publishing client.
        origin={!surface?.dedicated}
      />
    ) : null;
  // A list's items and headers are about the thing listed, not who listed it: the
  // lister is a quiet "Listed by" under it, as on the results card, instead of the
  // header a post or an article gets (the team, 2026-10-01).
  const quietAuthor = !!surface?.quietAuthor;

  // A zap, a reaction, a report…: its hero is the page, with no thread or topics of its own.
  const activityPage = !!surface && !surface.conversation;
  // The conversation above: not above a hero that draws what the event is about itself —
  // an activity's post, a git status's or a legacy git reply's issue or patch.
  const showAncestors = surface?.threads ?? true;
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
          <EventLinkInvalid />
        ) : loading ? (
          <EventLoading />
        ) : !note || !surface ? (
          <EventNotFound openInApp={openInApp} />
        ) : (
          <ShareNavProvider>
            {/* New-account safety + discovery nudge (in-app accounts, not backed up). */}
            {showSetupNudge && <EventSetupNudge onDismiss={() => setSetupDismissed(true)} />}
            {/* The conversation this reply sits in — parent (+ root) above, so a
                permalinked reply reads in context instead of floating alone.
                Not above an activity: its hero quotes the post a reaction or zap is about. */}
            {showAncestors && <ThreadAncestors note={note} relayHints={relayHints} />}

            {/* Author header — and the ⋯, on the object it acts on (X puts it
                on the post, not the page). A list event keeps only the ⋯ here. */}
            {quietAuthor ? (
              entityMenu && <div className="mb-3 flex justify-end">{entityMenu}</div>
            ) : (
              <EventByline
                note={note}
                authorPk={authorPk}
                authorNpub={authorNpub}
                authorName={authorName}
                profile={profile}
                score01={score01}
                compromisedRing={compromisedRing}
                menu={entityMenu}
              />
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

            {/* The event — its kind's hero (lib/kindSurfaces); a kind with none, its media, words or tags. */}
            <div
              className={`${WATERMARK_HOST} rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${pageReadsRoomy(note) ? "p-5 sm:p-7" : "p-4 sm:p-5"} shadow-sm ${thread.parentId || thread.rootId ? "ring-1 ring-brand-primary/15" : ""}`}
              data-testid="event-note"
            >
              <CompromisedWatermark pubkey={authorPk} postedAt={note.created_at} eventId={note.id} />
              <EventPageHero
                note={note}
                surface={surface}
                profile={profile}
                authorName={authorName}
                profiles={profiles}
                eventsById={eventsById}
                addrByCoord={addrByCoord}
                relayHints={relayHints}
                media={media}
                itemPage={surface.hero === "dictionary-item" ? <ItemPage event={note} /> : null}
              />
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
            {surface.below === "listing-related" && <ListingRelated event={note} sellerName={authorName} />}

            {/* Under a thing: what the network holds around it — a community's
                posts, a fundraiser's supporters, a calendar's events… */}
            {surface.below === "thing-sections" && <ThingSections event={note} />}

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
              <EventFunnel
                loggedIn={loggedIn}
                firstName={firstName}
                authorNpub={authorNpub}
                funnelLoginHref={funnelLoginHref}
              />
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
