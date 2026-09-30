/**
 * A community's page — a NIP-72 moderated community, a NIP-29 relay group,
 * or a NIP-28 public chat channel. The hero is the place itself: its
 * picture, name, what sort of place it is, whether anyone may join, its
 * rules. Below it, who runs it and what is being said there.
 */
import { MessagesSquare, ScrollText, Users } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { ReadingText } from "@/components/share/ReadingText";
import { fetchFromSearch } from "@/services/search";
import type { Detail } from "./types";
import type { Thing } from "@/lib/thing";
import {
  ActivityList,
  InfoBox,
  Kicker,
  PageTitle,
  PeopleRoster,
  Section,
  SectionNote,
  useFetched,
  type PageEvent,
  SafeImg,
} from "./shared";

const PLACE = {
  moderated: { word: "Community", icon: Users, posts: "Recent posts" },
  group: { word: "Relay group", icon: Users, posts: "Recent messages" },
  channel: { word: "Public chat", icon: MessagesSquare, posts: "Recent messages" },
} as const;

const dTag = (e: PageEvent) => e.tags.find((t) => t[0] === "d")?.[1] ?? "";

/** Where a community's conversation lives, as relay filters. */
function conversationFilters(event: PageEvent, variant: Detail<"community">["variant"]): Record<string, unknown>[] {
  if (variant === "moderated") {
    // NIP-72 posts are NIP-22 comments scoped to the community (`A`), older
    // clients' kind 1s `a`-tag it.
    const address = `34550:${event.pubkey}:${dTag(event)}`;
    return [
      { kinds: [1111], "#A": [address] },
      { kinds: [1111, 1], "#a": [address] },
    ];
  }
  // A NIP-29 group's messages carry its id in `h`: chat (9), threads (11), comments.
  if (variant === "group") return [{ kinds: [9, 11, 1111], "#h": [dTag(event)] }];
  // A NIP-28 channel's messages (42) name its creation event (the 40).
  const channel = event.kind === 40 ? event.id : (event.tags.find((t) => t[0] === "e")?.[1] ?? event.id);
  return [{ kinds: [42], "#e": [channel] }];
}

export function CommunityHero({ thing, detail }: { thing: Thing; detail: Detail<"community"> }) {
  const place = PLACE[detail.variant];
  return (
    <div data-testid="thing-page-community">
      <div className="flex items-start gap-4">
        <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
          <SafeImg
            src={thing.image}
            className="h-full w-full object-cover"
            fallback={<place.icon className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />}
          />
        </span>
        <div className="min-w-0 flex-1">
          <Kicker icon={place.icon}>{place.word}</Kicker>
          <PageTitle testId="thing-page-title">{thing.title}</PageTitle>
          {detail.variant === "group" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip size="sm" tone={detail.isOpen ? "success" : "slate"}>
                {detail.isOpen ? "Open to join" : "Closed"}
              </Chip>
              <Chip size="sm" tone="slate">
                {detail.isPublic ? "Public" : "Private"}
              </Chip>
            </div>
          )}
          {detail.moderators.length > 0 && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {detail.moderators.length} {detail.moderators.length === 1 ? "moderator" : "moderators"}
            </p>
          )}
        </div>
      </div>
      {thing.description && <ReadingText text={thing.description} className="mt-4" testId="thing-page-description" />}
      {detail.rules && (
        <div className="mt-4">
          <InfoBox label="Rules" icon={ScrollText} testId="thing-page-rules">
            <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{detail.rules}</p>
          </InfoBox>
        </div>
      )}
    </div>
  );
}

export function CommunitySections({ event, detail }: { event: PageEvent; detail: Detail<"community"> }) {
  const place = PLACE[detail.variant];
  // A NIP-72 community's posts are NIP-22 comments on its address — the page's
  // own comment thread (EventThread) already shows them, so only relay groups
  // and public chats, whose messages it does not read, get a list here.
  const posts = useFetched(detail.variant === "moderated" ? null : `community-posts:${event.id}`, () =>
    fetchFromSearch(conversationFilters(event, detail.variant), { limit: 30 }),
  );
  // A NIP-29 group's roster is the relay's own kind-39002 list for that group id.
  const members = useFetched(detail.variant === "group" ? `group-members:${dTag(event)}` : null, () =>
    fetchFromSearch([{ kinds: [39002], "#d": [dTag(event)] }], { limit: 5 }).then((evs) => [
      ...new Set(
        evs.flatMap((e) => e.tags.filter((t) => t[0] === "p" && /^[0-9a-f]{64}$/i.test(t[1] ?? "")).map((t) => t[1])),
      ),
    ]),
  );
  return (
    <div data-testid="thing-sections-community">
      {detail.moderators.length > 0 && (
        <Section title="Moderators" count={detail.moderators.length} testId="thing-page-moderators">
          <PeopleRoster pubkeys={detail.moderators} />
        </Section>
      )}
      {members && members.length > 0 && (
        <Section title="Members" count={members.length} testId="thing-page-members">
          <PeopleRoster pubkeys={members} />
        </Section>
      )}
      {detail.variant !== "moderated" && (
        <Section title={place.posts} count={posts?.length} testId="thing-page-posts">
          {posts === undefined ? (
            <SectionNote>Looking for recent activity…</SectionNote>
          ) : posts.length === 0 ? (
            <SectionNote>Nothing posted here yet that the search relay has seen.</SectionNote>
          ) : (
            <ActivityList events={posts} />
          )}
        </Section>
      )}
    </div>
  );
}
