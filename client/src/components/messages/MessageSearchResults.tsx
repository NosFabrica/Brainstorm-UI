/**
 * Search results in the conversation column: matching chats, people on Nostr
 * to start a chat with (the SearchBox's people search), then matching messages.
 */
import { Fragment } from "react";
import { Link } from "wouter";
import { Loader2, Lock, SquarePen } from "lucide-react";
import type { SearchResult } from "@/lib/profileSearch";
import { npubFromPubkey } from "@/lib/shareId";
import { NetworkPersonRow } from "./usePeopleSearch";
import type { SearchResults } from "@/lib/dm/search";
import { roomSlug } from "@/lib/dm/rooms";
import { SectionHeader } from "@/components/ui/section-header";
import { RoomAvatar, firstName, listTime, roomTitle, type Profiles } from "./people";

function Marked({ text, marks }: { text: string; marks: [number, number][] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [a, b] of marks) {
    if (a < at) continue;
    parts.push(<Fragment key={`t${at}`}>{text.slice(at, a)}</Fragment>);
    parts.push(
      <mark key={`m${a}`} className="rounded-sm bg-amber-200/70 text-inherit dark:bg-amber-400/30">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{parts}</>;
}

export function MessageSearchResults({
  results,
  people,
  searchingPeople,
  follows,
  me,
  profiles,
  scoreOf,
}: {
  results: SearchResults;
  /** People to start a chat with — already without anyone in a chat above. */
  people: SearchResult[];
  searchingPeople: boolean;
  follows: ReadonlySet<string>;
  me: string;
  profiles: Profiles;
  scoreOf: (pk: string) => number | null | undefined;
}) {
  const href = (key: string, message?: string) =>
    `/messages/${roomSlug(key, me)}${message ? `?m=${encodeURIComponent(message)}` : ""}`;
  return (
    <div className="flex flex-col gap-1 px-1" data-testid="dm-search-results">
      {results.rooms.length > 0 && (
        <>
          <SectionHeader kicker="Chats" className="px-2 pt-2" />
          {results.rooms.slice(0, 8).map((room) => (
            <Link
              key={room.key}
              href={href(room.key)}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <RoomAvatar room={room} me={me} profiles={profiles} scoreOf={scoreOf} size={36} />
              <span className="truncate text-sm font-semibold">{roomTitle(room, me, profiles)}</span>
            </Link>
          ))}
        </>
      )}
      {(people.length > 0 || searchingPeople) && (
        <>
          <SectionHeader
            kicker={
              <span className="flex items-center gap-1.5">
                People {searchingPeople && <Loader2 className="h-3 w-3 animate-spin" aria-label="Searching" />}
              </span>
            }
            className="px-2 pt-3"
          />
          {people.map((person) => (
            <Link
              key={person.pubkey}
              href={`/messages/${npubFromPubkey(person.pubkey)}`}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              data-testid="dm-search-person"
            >
              <NetworkPersonRow
                person={person}
                follows={follows.has(person.pubkey)}
                size={36}
                trailing={<SquarePen className="h-4 w-4 text-slate-400" aria-label="Start a chat" />}
              />
            </Link>
          ))}
        </>
      )}
      <SectionHeader kicker="Messages" className="px-2 pt-3" />
      {results.hits.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">No messages match.</p>
      ) : (
        results.hits.map((hit) => (
          <Link
            key={hit.message.id}
            href={href(hit.room.key, hit.message.id)}
            className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            data-testid="dm-search-hit"
          >
            <RoomAvatar room={hit.room} me={me} profiles={profiles} size={36} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{roomTitle(hit.room, me, profiles)}</span>
                <span className="ml-auto shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {listTime(hit.message.createdAt)}
                </span>
              </span>
              <span className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                {hit.message.author === me
                  ? "You: "
                  : hit.room.participants.length > 2
                    ? `${firstName(hit.message.author, profiles)}: `
                    : ""}
                <Marked text={hit.snippet} marks={hit.marks} />
              </span>
            </span>
          </Link>
        ))
      )}
      <p className="flex items-center gap-1.5 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
        <Lock className="h-3 w-3 shrink-0" />
        Searched {results.searched.toLocaleString()} messages on this device. Older history is included once it has
        loaded.
      </p>
    </div>
  );
}
