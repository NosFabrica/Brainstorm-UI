import {
  createContext,
  memo,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  Archive,
  BellOff,
  ChevronDown,
  EyeOff,
  Flag,
  Loader2,
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
import { ANSWER_WITHIN_MS, serverStatus } from "@/lib/dm/serverStatus";
import { usePeopleSearch } from "./usePeopleSearch";
import { useMyFollows } from "@/hooks/useMyFollows";
import { useNearViewport } from "@/hooks/useNearViewport";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import type { SearchResult } from "@/lib/profileSearch";
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
  const text = body.replace(/\s+/g, " ").trim();
  // A blank message (a rename from some clients) previews as what it did.
  if (!text) return last.subject ? `${who}Named the chat “${last.subject}”` : "";
  return who + text;
}

/** Told the people of each row as it comes near the screen, so their names and pictures load. */
const RowNearContext = createContext<((pubkeys: string[]) => void) | null>(null);

// Memoized: the list re-renders on every engine snapshot (sync progress, several a
// second while a big inbox loads), and a row's room only changes when its messages do.
const RoomRow = memo(function RoomRow({
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
  const onNear = useContext(RowNearContext);
  const face = useRef<HTMLSpanElement>(null);
  const near = useNearViewport(face, "800px");
  useEffect(() => {
    if (near) onNear?.(room.participants);
  }, [near, onNear, room.participants]);
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
      <span ref={face} className="shrink-0">
        <RoomAvatar room={room} me={me} profiles={profiles} scoreOf={scoreOf} />
      </span>
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
          {!room.notLoaded && (
            <span className="ml-auto shrink-0 text-xs text-slate-500 dark:text-slate-400">{listTime(room.lastAt)}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {room.notLoaded ? (
            <span className="truncate text-sm text-slate-500 dark:text-slate-400" data-testid="dm-room-not-loaded">
              {"Older messages aren't loaded yet"}
            </span>
          ) : hidePreview ? (
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
});

type Item = { kind: "room"; room: DmRoom; at: number } | { kind: "marker"; progress: RelayProgress; at: number };

/** Rooms newest first, with each relay's marker at the moment it is complete to. */
function interleave(rooms: DmRoom[], relays: RelayProgress[]): Item[] {
  const items: Item[] = rooms.map((room) => ({ kind: "room", room, at: room.lastAt }));
  for (const progress of relays)
    items.push({ kind: "marker", progress, at: progress.state === "done" ? -1 : progress.completeTo });
  // Newest first; a marker sorts after a room at the same moment.
  return items.sort((a, b) => b.at - a.at || (a.kind === "marker" ? 1 : -1));
}

/**
 * The inbox's history, said once, in a reader's words: how many of their message
 * servers aren't answering and what that means, with Retry and Manage (Settings ›
 * Messages, where each server's status is); else older messages still on their
 * way; else nothing. Replaces a row per relay in the list; a chat keeps its own
 * per-relay markers ("Keep looking").
 *
 * After a Retry the line goes quiet for the rest of the visit — a server that's
 * gone for good shouldn't nag on every glance — but never disappears while it's
 * true, and nothing is remembered between visits.
 */
function HistoryStatus({ state, onRetry }: { state: DmEngineState; onRetry: (url: string) => void }) {
  const [retried, setRetried] = useState(false);
  // The same "not answering" Settings › Messages shows (lib/dm/serverStatus): a failed
  // history page, or still unconnected well after another server answered.
  const [openedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => tick((n) => n + 1), ANSWER_WITHIN_MS + 500);
    return () => clearTimeout(t);
  }, []);
  const relays = state.history.relays;
  const urls = [...new Set([...relays.map((r) => r.url), ...Object.keys(state.live)])];
  const waitedMs = Date.now() - openedAt;
  const silent = urls.filter((url) => serverStatus(url, state, { waitedMs }) === "not-answering");
  const loading = relays.some((r) => r.state === "loading" || (r.opening ?? 0) > 0);
  if (!silent.length && !loading) return null;
  const manage = (
    <Link
      href="/settings?tab=messages"
      className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      Manage
    </Link>
  );
  const servers = (n: number) => (n === 1 ? "server isn't" : "servers aren't");
  return (
    <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400" data-testid="dm-history-status">
      {silent.length && retried ? (
        <p className="flex items-center gap-2">
          <span>
            {silent.length} {servers(silent.length)} answering
          </span>
          <span className="ml-auto">{manage}</span>
        </p>
      ) : silent.length ? (
        <>
          <p className="flex items-start gap-2 leading-relaxed">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              {silent.length === urls.length
                ? "None of your message servers are answering. New messages can't reach you right now."
                : `${silent.length} of your ${urls.length} message servers ${silent.length === 1 ? "isn't" : "aren't"} answering. Your messages still arrive through the others.`}
            </span>
          </p>
          <p className="mt-1.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRetried(true);
                silent.forEach((url) => onRetry(url));
              }}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Retry
            </button>
            {manage}
          </p>
        </>
      ) : (
        <p className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          Loading older messages…
        </p>
      )}
    </div>
  );
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
  notices,
  onPeopleNear,
}: {
  engine: DmEngine | null;
  state: DmEngineState;
  shelves: Shelves & { scoreOf: (pk: string) => number | null | undefined };
  prefs: DmPrefs;
  profiles: Profiles;
  me: string;
  selectedKey: string | null;
  tab: InboxTab;
  /** Status and things waiting on the reader, pinned under the list. */
  notices?: React.ReactNode;
  /** The people of rows coming near the screen. */
  onPeopleNear?: (pubkeys: string[]) => void;
}) {
  const [showLow, setShowLow] = useState(false);
  const [query, setQuery] = useState("");
  // Typing stays responsive; the search over every message runs behind it.
  const deferredQuery = useDeferredValue(query);
  const searching = query.trim().length > 0;
  const results = useMemo(
    () =>
      deferredQuery.trim()
        ? searchMessages([...shelves.chats, ...shelves.requests, ...shelves.archived], deferredQuery, {
            titleOf: (room) => roomTitle(room, me, profiles),
          })
        : null,
    [deferredQuery, shelves, me, profiles],
  );
  // People to start a chat with: the network's people search, plus a pasted npub —
  // minus anyone the reader already has a one-to-one chat with (that's in Chats).
  const { follows } = useMyFollows();
  const { people: found, searching: searchingPeople } = usePeopleSearch(deferredQuery, me, {
    limit: 12,
    enabled: searching,
  });
  const people = useMemo(() => {
    if (!results) return [];
    const inChat = new Set(
      [...shelves.chats, ...shelves.requests, ...shelves.archived]
        .filter((r) => r.participants.length === 2)
        .flatMap((r) => r.participants),
    );
    const listed = new Set(results.rooms.flatMap((r) => r.participants));
    const direct = decodeShareId(deferredQuery.trim())?.pubkey;
    const pasted: SearchResult[] = direct && direct !== me ? [{ pubkey: direct, npub: npubFromPubkey(direct) }] : [];
    return [...pasted, ...found]
      .filter((p, i, all) => all.findIndex((q) => q.pubkey === p.pubkey) === i)
      .filter((p) => !inChat.has(p.pubkey) && !listed.has(p.pubkey))
      .slice(0, 8);
  }, [results, found, shelves, deferredQuery, me]);
  // Each trust line is a lookup: the first screenful of requests gets one, not a spam flood.
  const trustLines = useMemo(
    () => new Set([...shelves.requests.slice(0, 25), ...shelves.low.slice(0, 25)].map((r) => r.key)),
    [shelves.requests, shelves.low],
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
  // A server has answered once the live subscription settles, or once any relay has
  // delivered a page of history — one silent relay can hold "settled" off indefinitely.
  const answered = state.liveSettled || state.history.relays.some((r) => r.state === "done" || r.pages > 0);

  return (
    <RowNearContext.Provider value={onPeopleNear ?? null}>
      <aside
        aria-label="Conversations"
        className="flex min-h-0 flex-1 flex-col border-border bg-card md:border-r"
        data-testid="dm-conversation-list"
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <h1 className="font-display text-[22px] font-bold tracking-tight">Messages</h1>
          <Link
            href="/settings?tab=messages"
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
            placeholder="Search messages and people"
            aria-label="Search messages and people"
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

        {searching && results ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
            <MessageSearchResults
              results={results}
              people={people}
              searchingPeople={searchingPeople}
              follows={follows}
              me={me}
              profiles={profiles}
              scoreOf={shelves.scoreOf}
            />
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

            <div
              className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3"
              data-testid="dm-room-scroll"
            >
              {tab === "requests" && (rooms.length > 0 || shelves.low.length > 0) && (
                <p
                  className="px-3 pb-1 pt-2 text-xs text-slate-500 dark:text-slate-400"
                  data-testid="dm-requests-explainer"
                >
                  From people you don't follow, sorted by who your network trusts.
                </p>
              )}
              {tab === "requests" && rooms.length === 0 && shelves.low.length === 0 && (
                <p className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No requests. People you don't follow land here, sorted by how your web of trust sees them.
                </p>
              )}
              {tab === "chats" && rooms.length === 0 && state.status === "ready" && (
                <p className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">
                  {/* Until any server answers; after that an empty inbox is empty, however
                      long the slow ones take — they're the quiet line below. */}
                  {answered ? "No chats yet." : "Loading your messages…"}
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
                    showTrust={tab === "requests" && trustLines.has(item.room.key)}
                  />
                ) : (
                  <RelayMarker
                    key={`m:${item.progress.url}`}
                    progress={item.progress}
                    variant="list"
                    // Each relay's marker still pages its history as it scrolls into view, but
                    // says nothing: a reader shouldn't need to know what a relay is to read their
                    // messages. Only a relay that wants them signed in speaks up, since that needs
                    // them. The rest is the one line under the list.
                    quiet={item.progress.state !== "auth"}
                    onAdvance={advance}
                    onRetry={retry}
                  />
                ),
              )}

              <HistoryStatus state={state} onRetry={retry} />

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
                    <ChevronDown
                      className={cn("ml-auto h-4 w-4 transition-transform", !showArchived && "-rotate-90")}
                    />
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
                    Low trust · {shelves.low.length} (previews hidden)
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
                        showTrust={trustLines.has(room.key)}
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
            {/* Pinned under the list, outside its scroll: coming and going, it never moves a row. */}
            <div className="shrink-0 border-t border-border pt-2 empty:hidden" data-testid="dm-list-footer">
              {notices}
            </div>
          </>
        )}
      </aside>
    </RowNearContext.Provider>
  );
}
