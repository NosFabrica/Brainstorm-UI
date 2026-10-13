/**
 * A quoted or linked event drawn as the card its kind already has elsewhere
 * (lib/embedShape): a thing as its thing card, a people list as its faces, a
 * stream, a dated event, a listing, an app, a repo or a track as the search
 * card for it. The card replaces the note card — it has its own author line
 * and its own link — and its clicks stay inside it, so the note around it
 * does not open as well. None of these cards draws a note inside itself, so
 * nothing here can nest.
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { AppCard, EventCard, ListCard, ListingCard, LiveCard, RepoCard, TrackCard } from "@/components/search/cards";
import { ThingCard } from "@/components/search/thingCards";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import type { ProfileLite } from "@/hooks/useNoteRefs";
import type { EmbedShape } from "@/lib/embedShape";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { SearchResult } from "@/lib/profileSearch";
import { npubFromPubkey } from "@/lib/shareId";

/** The shapes this component draws; the rest are the note card's. */
export type KindCardShape = Extract<
  EmbedShape,
  "thing" | "people-list" | "live" | "calendar-event" | "listing" | "app" | "repo" | "track"
>;

export const KIND_CARD_SHAPES: ReadonlySet<EmbedShape> = new Set<KindCardShape>([
  "thing",
  "people-list",
  "live",
  "calendar-event",
  "listing",
  "app",
  "repo",
  "track",
]);

/** The cards take a search hit's author; a quote has a profile, or only a key. */
function useCardAuthor(pubkey: string, given?: ProfileLite): SearchResult {
  const fetched = useLiveProfiles(given ? [] : [pubkey]) as Map<string, ProfileLite>;
  const p = given ?? fetched.get(pubkey);
  return useMemo(() => {
    let npub = "";
    try {
      npub = npubFromPubkey(pubkey);
    } catch {
      /* a malformed key keeps an empty npub */
    }
    return { pubkey, npub, name: p?.name, displayName: p?.display_name, picture: p?.picture, nip05: p?.nip05 };
  }, [pubkey, p?.name, p?.display_name, p?.picture, p?.nip05]);
}

export function EmbeddedKindCard({
  event,
  author,
  shape,
}: {
  event: MinimalEvent;
  author?: ProfileLite;
  shape: KindCardShape;
}) {
  const who = useCardAuthor(event.pubkey, author);
  const scoreOf = useAuthorScores([event.pubkey]);
  const typed = { event: event as NostrEvent, author: who, score: scoreOf(event.pubkey) };
  const card = (() => {
    switch (shape) {
      case "thing":
        return <ThingCard {...typed} />;
      case "people-list":
        return <ListCard {...typed} />;
      case "live":
        return <LiveCard {...typed} />;
      case "calendar-event":
        return <EventCard {...typed} dateTile />;
      case "listing":
        // A shop tile, at the width it has in the Shop grid: a full-width photo would swamp the note.
        return (
          <div className="max-w-[15rem]">
            <ListingCard {...typed} />
          </div>
        );
      case "app":
        return <AppCard {...typed} />;
      case "repo":
        return <RepoCard {...typed} />;
      case "track":
        return <TrackCard {...typed} />;
    }
  })();
  return (
    <div className="not-prose mt-2" data-testid="embedded-card" data-shape={shape} onClick={(e) => e.stopPropagation()}>
      {card}
    </div>
  );
}
