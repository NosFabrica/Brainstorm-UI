/**
 * The event page for the kinds lib/thing reads — one hero per kind (the event
 * itself, inside the page's card) and the sections under it (what the network
 * holds around it). EventScreen asks `hasThingPage` and renders both.
 */
import { describeThing } from "@/lib/thing";
import type { PageEvent } from "./shared";
import { CommunityHero, CommunitySections } from "./CommunityPage";
import { FundraiserHero, FundraiserSections } from "./FundraiserPage";
import { ReviewHero, ReviewSections } from "./ReviewPage";
import { ShopPlaceHero, ShopPlaceSections } from "./ShopPlacePage";
import { AppThingHero, AppThingSections } from "./AppThingPage";
import {
  BadgeHero,
  BadgeSections,
  CalendarHero,
  CalendarSections,
  EmojiPackHero,
  EmojiPackSections,
  PlaylistHero,
  PlaylistSections,
} from "./CollectionPages";
import { LearningHero, LearningSections, TorrentHero, TorrentSections } from "./ResourcePages";

export function hasThingPage(event: PageEvent): boolean {
  return describeThing(event) !== null;
}

export function ThingHero({ event }: { event: PageEvent }) {
  const thing = describeThing(event);
  if (!thing) return null;
  const d = thing.detail;
  switch (d.type) {
    case "community":
      return <CommunityHero thing={thing} detail={d} />;
    case "fundraiser":
      return <FundraiserHero event={event} thing={thing} detail={d} />;
    case "review":
      return <ReviewHero event={event} thing={thing} detail={d} />;
    case "shop":
      return <ShopPlaceHero event={event} thing={thing} detail={d} />;
    case "app":
      return <AppThingHero event={event} thing={thing} detail={d} />;
    case "calendar":
      return <CalendarHero thing={thing} detail={d} />;
    case "badge":
      return <BadgeHero thing={thing} />;
    case "emoji":
      return <EmojiPackHero thing={thing} detail={d} />;
    case "playlist":
      return <PlaylistHero thing={thing} detail={d} />;
    case "learning":
      return <LearningHero event={event} thing={thing} detail={d} />;
    case "torrent":
      return <TorrentHero thing={thing} detail={d} />;
  }
}

export function ThingSections({ event }: { event: PageEvent }) {
  const thing = describeThing(event);
  if (!thing) return null;
  const d = thing.detail;
  switch (d.type) {
    case "community":
      return <CommunitySections event={event} detail={d} />;
    case "fundraiser":
      return <FundraiserSections event={event} />;
    case "review":
      return <ReviewSections event={event} detail={d} />;
    case "shop":
      return <ShopPlaceSections event={event} detail={d} />;
    case "app":
      return <AppThingSections event={event} detail={d} />;
    case "calendar":
      return <CalendarSections event={event} />;
    case "badge":
      return <BadgeSections event={event} />;
    case "emoji":
      return <EmojiPackSections event={event} />;
    case "playlist":
      return <PlaylistSections event={event} detail={d} />;
    case "learning":
      return <LearningSections event={event} />;
    case "torrent":
      return <TorrentSections detail={d} />;
  }
}
