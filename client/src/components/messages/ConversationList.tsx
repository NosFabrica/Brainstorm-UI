import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Archive,
  BellOff,
  ChevronDown,
  EyeOff,
  Flag,
  Lock,
  Pin,
  Search,
  Settings2,
  SquarePen,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DmEngine, DmEngineState } from "@/services/dm/engine";
import type { DmRoom } from "@/lib/dm/store";
import type { Shelves } from "@/lib/dm/inbox";
import { unreadIn } from "@/lib/dm/inbox";
import { fileLabel, roomSlug } from "@/lib/dm/rooms";
import { roomTimer, type DmPrefs } from "@/lib/dm/prefs";
import { REACTION_KIND, FILE_KIND } from "@/lib/dm/giftWrap";
import type { RelayProgress } from "@/lib/dm/pager";
import { Chip } from "@/components/ui/chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RelayMarker } from "./RelayMarker";
import { RequestTrustLine } from "./RequestTrust";
import { MessageSearchResults } from "./MessageSearchResults";
import { searchMessages } from "@/lib/dm/search";
import { Input } from "@/components/ui/input";
import { RoomAvatar, firstName, listTime, roomTitle, type Profiles } from "./people";

export type InboxTab = "chats" | "requests";

function preview(room: DmRoom, me: string, profiles: Profiles): string {
  const last = room.last;
  if (!last) return "";
  const who =
    last.author === me ? "You: " : room.participants.length > 2 ? `${firstName(last.author, profiles)}: ` : "";
  const body =
    last.kind === FILE_KIND ? fileLabel(last.rumor) : last.kind === REACTION_KIND ? "Reacted" : last.rumor.content;
  return who + body.replace(/\s+/g, " ").trim();
}

function RoomRow({
  room,
  me,
  profiles,
  scoreOf,
  prefs,
  selected,
  hidePreview,
  showTrust,
}: {
  room: DmRoom;
  me: string;
  profiles: Profiles;
  scoreOf: (pk: string) => number | null | undefined;
  prefs: DmPrefs;
  selected: boolean;
  hidePreview?: boolean;
  /** A request: say who vouches for the sender. */
  showTrust?: boolean;
}) {
  const unread = selected || prefs.muted.includes(room.key) ? 0 : unreadIn(room, me, prefs);
  const timer = roomTimer(prefs, room.key) > 0;
  const others = room.participants.filter((pk) => pk !== me);
  return (
    <Link
      href={`/messages/${roomSlug(room.key, me)}`}
      className={cn(
        "flex items-center gap-3 rounded-xl px-2.5 py-3 transition-colors",
        selected
          ? "bg-brand-primary/[0.08] dark:bg-brand-primary/[0.15]"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/60",
      )}
      aria-current={selected ? "page" : undefined}
      data-testid="dm-room-row"
    >
      <RoomAvatar room={room} me={me} profiles={profiles} scoreOf={scoreOf} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{roomTitle(room, me, profiles)}</span>
          {timer && <Timer className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Disappearing messages on" />}
          {prefs.muted.includes(room.key) && (
            <BellOff className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Muted" />
          )}
          {prefs.pinned.includes(room.key) && (
            <Pin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Pinned" />
          )}
          <span className="ml-auto shrink-0 text-xs text-slate-500 dark:text-slate-400">{listTime(room.lastAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          {hidePreview ? (
            <span className="flex items-center gap-1.5 truncate text-sm text-slate-500 dark:text-slate-400">
              <EyeOff className="h-3.5 w-3.5" /> Preview hidden · low trust
            </span>
          ) : (
            <span
              className={cn(
                "truncate text-sm",
                unread ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400",
              )}
            >
              {preview(room, me, profiles)}
            </span>
          )}
          {unread > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary px-1.5 text-[11px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
        {showTrust && others.length === 1 && <RequestTrustLine pubkey={others[0]} />}
      </span>
    </Link>
  );
}

type Item = { kind: "room"; room: DmRoom; at: number } | { kind: "marker"; progress: RelayProgress; at: number };

/** Rooms newest first, with each relay's marker at the moment it is complete to. */
function interleave(rooms: DmRoom[], relays: RelayProgress[]): Item[] {
  const items: Item[] = rooms.map((room) => ({ kind: "room", room, at: room.lastAt }));
  for (const progress of relays)
    items.push({ kind: "marker", progress, at: progress.state === "done" ? -1 : progress.completeTo });
  // Newest first; a marker sorts after a room at the same moment.
  return items.sort((a, b) => b.at - a.at || (a.kind === "marker" ? 1 : -1));
}

export function ConversationList({
  engine,
  state,
  shelves,
  prefs,
  profiles,
  me,
  selectedKey,
  tab,
  onSignIn,
}: {
  engine: DmEngine | null;
  state: DmEngineState;
  shelves: Shelves & { scoreOf: (pk: string) => number | null | undefined };
  prefs: DmPrefs;
  profiles: Profiles;
  me: string;
  selectedKey: string | null;
  tab: InboxTab;
  onSignIn: () => void;
}) {
  const [showLow, setShowLow] = useState(false);
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const results = useMemo(
    () =>
      searching
        ? searchMessages([...shelves.chats, ...shelves.requests, ...shelves.archived], query, {
            titleOf: (room) => roomTitle(room, me, profiles),
          })
        : null,
    [searching, query, shelves, me, profiles],
  );
  const advance = useCallback((url: string) => engine?.advance(url), [engine]);
  const retry = useCallback((url: string) => engine?.retry(url), [engine]);
  const rooms = tab === "chats" ? shelves.chats : shelves.requests;
  // Pinned chats stay on top; the rest interleave with the relays' history markers by time.
  const [pinned, flowing] = useMemo(
    () => (tab === "chats" ? [rooms.slice(0, shelves.pinnedCount), rooms.slice(shelves.pinnedCount)] : [[], rooms]),
    [tab, rooms, shelves.pinnedCount],
  );
  const items = useMemo(() => interleave(flowing, state.history.relays), [flowing, state.history.relays]);
  const [showArchived, setShowArchived] = useState(false);
  const requestCount = shelves.requests.length + shelves.low.length;

  return (
    <aside
      aria-label="Conversations"
      className="flex min-h-0 flex-1 flex-col border-border bg-card md:border-r"
      data-testid="dm-conversation-list"
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h1 className="font-display text-[22px] font-bold tracking-tight">Messages</h1>
        <Link
          href="/settings?tab=trust&focus=messages"
          aria-label="Message settings"
          className="ml-auto mr-2 inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Settings2 className="h-[18px] w-[18px]" />
        </Link>
        <Link
          href="/messages/new"
          aria-label="New message"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-white shadow-sm transition-colors hover:bg-brand-primary-hover"
          data-testid="dm-new-message"
        >
          <SquarePen className="h-[18px] w-[18px]" />
        </Link>
      </div>

      <div className="relative mx-4 mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Search messages"
          aria-label="Search messages"
          className="h-10 rounded-full pl-9 pr-9"
          data-testid="dm-search"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {results ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
          <MessageSearchResults results={results} me={me} profiles={profiles} scoreOf={shelves.scoreOf} />
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Inbox"
            className="mx-4 mb-2 grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800"
          >
            {(
              [
                ["chats", "Chats", "/messages"],
                ["requests", "Requests", "/messages/requests"],
              ] as const
            ).map(([key, label, href]) => (
              <Link
                key={key}
                href={href}
                role="tab"
                aria-selected={tab === key}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors",
                  tab === key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
                )}
                data-testid={`dm-tab-${key}`}
              >
                {label}
                {key === "requests" && requestCount > 0 && (
                  <Chip tone="brand" size="sm">
                    {requestCount}
                  </Chip>
                )}
              </Link>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3" data-testid="dm-room-scroll">
            {tab === "requests" && rooms.length === 0 && shelves.low.length === 0 && (
              <p className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">
                No requests. People you don't follow land here, sorted by how your web of trust sees them.
              </p>
            )}
            {tab === "chats" && rooms.length === 0 && state.status === "ready" && (
              <p className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">
                {state.history.loading || !state.liveSettled ? "Loading your messages…" : "No chats yet."}
              </p>
            )}
            {pinned.map((room) => (
              <RoomRow
                key={room.key}
                room={room}
                me={me}
                profiles={profiles}
                scoreOf={shelves.scoreOf}
                prefs={prefs}
                selected={room.key === selectedKey}
              />
            ))}
            {pinned.length > 0 && flowing.length > 0 && <div className="mx-3 my-1 border-t border-border" />}
            {items.map((item) =>
              item.kind === "room" ? (
                <RoomRow
                  key={item.room.key}
                  room={item.room}
                  me={me}
                  profiles={profiles}
                  scoreOf={shelves.scoreOf}
                  prefs={prefs}
                  selected={item.room.key === selectedKey}
                  showTrust={tab === "requests"}
                />
              ) : (
                <RelayMarker
                  key={`m:${item.progress.url}`}
                  progress={item.progress}
                  variant="list"
                  onAdvance={advance}
                  onRetry={retry}
                  onSignIn={onSignIn}
                />
              ),
            )}

            {tab === "chats" && shelves.archived.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  aria-expanded={showArchived}
                  data-testid="dm-archived-toggle"
                >
                  <Archive className="h-4 w-4" />
                  Archived · {shelves.archived.length}
                  <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", !showArchived && "-rotate-90")} />
                </button>
                {showArchived &&
                  shelves.archived.map((room) => (
                    <RoomRow
                      key={room.key}
                      room={room}
                      me={me}
                      profiles={profiles}
                      scoreOf={shelves.scoreOf}
                      prefs={prefs}
                      selected={room.key === selectedKey}
                    />
                  ))}
              </div>
            )}

            {tab === "requests" && shelves.low.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowLow((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  aria-expanded={showLow}
                  data-testid="dm-low-trust-toggle"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !showLow && "-rotate-90")} />
                  {shelves.low.length} below your trust threshold
                </button>
                {showLow &&
                  shelves.low.map((room) => (
                    <RoomRow
                      key={room.key}
                      room={room}
                      me={me}
                      profiles={profiles}
                      scoreOf={shelves.scoreOf}
                      prefs={prefs}
                      selected={room.key === selectedKey}
                      hidePreview
                      showTrust
                    />
                  ))}
              </div>
            )}
            {tab === "requests" && shelves.flagged.length > 0 && (
              <Alert variant="destructive" className="mx-2 mt-3 w-auto px-3 py-2.5 text-xs leading-relaxed">
                <Flag className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">
                  {shelves.flagged.length}{" "}
                  {shelves.flagged.length === 1 ? "request from a sender" : "requests from senders"} flagged by people
                  you trust {shelves.flagged.length === 1 ? "is" : "are"} never shown.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}

      <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
        <Lock className="h-3 w-3" /> NIP-17 · relays can't see who you talk to
      </div>
    </aside>
  );
}
