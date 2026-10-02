import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Check,
  History,
  Info,
  Loader2,
  MoreVertical,
  Pin,
  Pencil,
  PinOff,
  Timer,
  Trash2,
  UserRound,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DmEngine, DmEngineState, SendResult } from "@/services/dm/engine";
import { sendFile } from "@/services/dm";
import type { DmMessage, DmRoom } from "@/lib/dm/store";
import { FILE_KIND } from "@/lib/dm/giftWrap";
import type { RoomShelf } from "@/lib/dm/inbox";
import {
  TIMER_CHOICES,
  roomTimer,
  setRoomTimer,
  markRoomRead,
  setRoomMuted,
  setRoomPinned,
  unarchiveRoom,
  type DmPrefs,
} from "@/lib/dm/prefs";
import { npubFromPubkey } from "@/lib/shareId";
import { RelayMarker } from "./RelayMarker";
import { RequestTrustPanel } from "./RequestTrust";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { RenameChatDialog, renameText } from "./RenameChatDialog";
import { useChatHistory, type ChatHistoryPhase } from "./useChatHistory";
import { RoomAvatar, dayLabel, firstName, nameOf, roomTitle, shortDate, shortNpub, type Profiles } from "./people";
import type { RelayProgress } from "@/lib/dm/pager";

type Item =
  | { kind: "day"; key: string; label: string }
  | { kind: "marker"; key: string; progress: RelayProgress }
  | { kind: "message"; key: string; message: DmMessage; showAuthor: boolean }
  | { kind: "subject"; key: string; author: string; subject: string };

/** Oldest first, a divider per day, each relay's marker where its history is complete. */
function threadItems(messages: DmMessage[], relays: RelayProgress[]): Item[] {
  const markers = relays
    .map((progress) => ({ progress, at: progress.state === "done" ? Number.NEGATIVE_INFINITY : progress.completeTo }))
    .sort((a, b) => a.at - b.at);
  const items: Item[] = [];
  let m = 0;
  let lastDay = "";
  let lastAuthor = "";
  let lastSubject = "";
  for (const message of messages) {
    while (m < markers.length && markers[m].at <= message.createdAt) {
      items.push({ kind: "marker", key: `m:${markers[m].progress.url}`, progress: markers[m].progress });
      m++;
      lastAuthor = "";
    }
    // Nothing to read (some clients send a blank message to rename a chat):
    // no bubble. A rename still gets its line below.
    const empty = message.kind !== FILE_KIND && !message.rumor.content.trim();
    const renames = !!message.subject && message.subject !== lastSubject;
    if (empty && !renames) continue;
    const day = new Date(message.createdAt * 1000).toDateString();
    if (day !== lastDay) {
      items.push({ kind: "day", key: `d:${day}`, label: dayLabel(message.createdAt) });
      lastDay = day;
      lastAuthor = "";
    }
    // NIP-17: a message carrying a new subject renames the chat.
    if (renames) {
      items.push({ kind: "subject", key: `s:${message.id}`, author: message.author, subject: message.subject! });
      lastSubject = message.subject!;
      lastAuthor = "";
    }
    if (empty) continue;
    items.push({ kind: "message", key: message.id, message, showAuthor: message.author !== lastAuthor });
    lastAuthor = message.author;
  }
  for (; m < markers.length; m++)
    items.push({ kind: "marker", key: `m:${markers[m].progress.url}`, progress: markers[m].progress });
  return items;
}

function HistoryCard({
  phase,
  state,
  first,
  onKeepLooking,
  onStop,
  onResume,
  onRetry,
}: {
  phase: ChatHistoryPhase;
  state: DmEngineState;
  first: string;
  onKeepLooking: () => void;
  onStop: () => void;
  onResume: () => void;
  onRetry: (url: string) => void;
}) {
  const relays = state.history.relays;
  // How far back the relays that are answering have got; a stalled one is named separately.
  const answering = relays.filter((r) => r.state === "idle" || r.state === "loading");
  const deepest = answering.length ? Math.max(...answering.map((r) => r.completeTo)) : 0;
  const stalled = relays.filter((r) => r.state === "stalled" || r.state === "auth");
  if (phase === "idle") return null;

  let icon = <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />;
  let title = "";
  let body = "";
  let action: React.ReactNode = null;
  if (phase === "auto") {
    icon = <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-deep" />;
    title = "Looking for older messages";
    body = "Loading one more page from each of your inbox relays.";
  } else if (phase === "paused") {
    title = "Older messages aren't loaded yet";
    body = deepest ? `Loaded back to ${shortDate(deepest)}.` : "Your inbox relays have more history.";
    action = (
      <Button size="sm" onClick={onResume} data-testid="dm-history-continue">
        Continue
      </Button>
    );
  } else if (phase === "button") {
    title = `No older messages with ${first} yet`;
    body = deepest ? `Your relays are complete to ${shortDate(deepest)}. Older messages may be further back.` : "";
    action = (
      <Button size="sm" onClick={onKeepLooking} data-testid="dm-keep-looking">
        Keep looking
      </Button>
    );
  } else if (phase === "search") {
    icon = <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-deep" />;
    title = "Searching further back…";
    body = deepest ? `Checked back to ${shortDate(deepest)}. Stops when a message with ${first} turns up.` : "";
    action = (
      <Button size="sm" variant="outline" onClick={onStop}>
        Stop
      </Button>
    );
  } else if (phase === "end") {
    if (stalled.length) {
      title = "Couldn't search everywhere";
      body = `${stalled.map((r) => r.url.replace(/^wss?:\/\//, "").replace(/\/$/, "")).join(", ")} didn't answer. Your other relays have nothing older.`;
      action = (
        <Button size="sm" variant="outline" onClick={() => stalled.forEach((r) => onRetry(r.url))}>
          Retry
        </Button>
      );
    } else {
      title = `This is the start of your chat with ${first}`;
      body = "Every inbox relay has been searched to the end.";
    }
  }
  return (
    <div
      className="mx-auto mb-2 flex w-full max-w-md flex-col gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300"
      data-testid="dm-history-card"
      data-phase={phase}
    >
      <span className="flex gap-2.5">
        {icon}
        <span>
          <strong className="block text-slate-900 dark:text-slate-100">{title}</strong>
          {body}
        </span>
      </span>
      {action && <span className="pl-6">{action}</span>}
    </div>
  );
}

const NO_REACTIONS: DmMessage[] = [];

export function ChatView({
  engine,
  state,
  roomKey,
  room,
  me,
  profiles,
  scoreOf,
  prefs,
  shelf,
  onBack,
  onAccept,
  onDelete,
  onBlock,
  onDetails,
  onToggleInfo,
  onArchive,
  sendError,
  initialSubject,
}: {
  engine: DmEngine | null;
  state: DmEngineState;
  roomKey: string;
  room: DmRoom | undefined;
  me: string;
  profiles: Profiles;
  scoreOf: (pk: string) => number | null | undefined;
  prefs: DmPrefs;
  shelf: RoomShelf;
  onBack: () => void;
  onAccept: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onDetails: (m: DmMessage) => void;
  onToggleInfo: () => void;
  onArchive: () => void;
  sendError: (result: SendResult) => void;
  /** A group's name, chosen when it was started, sent with its first message. */
  initialSubject?: string;
}) {
  const participants = useMemo(() => roomKey.split(","), [roomKey]);
  const others = participants.filter((pk) => pk !== me);
  const group = others.length > 1;
  const view: DmRoom = room ?? {
    key: roomKey,
    participants,
    messages: [],
    reactions: new Map(),
    lastAt: 0,
    hasMine: false,
  };
  const title = roomTitle({ ...view, subject: view.subject ?? initialSubject }, me, profiles);
  const first = others.length === 1 ? firstName(others[0], profiles) : title;
  const timer = roomTimer(prefs, roomKey);
  const [replyTo, setReplyTo] = useState<DmMessage | null>(null);

  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const onVisible = useCallback(
    (url: string, v: boolean) => setVisible((cur) => (cur[url] === v ? cur : { ...cur, [url]: v })),
    [],
  );
  const reported = Object.values(visible);
  const markersVisible = reported.length ? reported.some(Boolean) : null;
  const count = view.messages.length;
  const history = useChatHistory(engine, state, roomKey, count, markersVisible);

  const items = useMemo(() => threadItems(view.messages, state.history.relays), [view.messages, state.history.relays]);
  const byId = useMemo(() => new Map(view.messages.map((m) => [m.id, m])), [view.messages]);
  // Stable, so a bubble re-renders only when its own message, reactions or reply do.
  const onReact = useCallback(
    (m: DmMessage, content: string) => void engine?.react(m, content).then((r) => !r.ok && sendError(r)),
    [engine, sendError],
  );
  const onResend = useCallback((m: DmMessage) => void engine?.resend(m.id), [engine]);
  const onDiscard = useCallback((m: DmMessage) => engine?.discard(m.id), [engine]);

  // Reading the chat marks it read.
  useEffect(() => {
    if (room?.lastAt) markRoomRead(me, roomKey, room.lastAt);
  }, [me, roomKey, room?.lastAt]);

  // Keep the newest message in view: a new message scrolls to it, and while the reader
  // is at the bottom the thread stays pinned there through anything else that changes its
  // height — the history card and relay markers above the messages, link previews, images.
  // Opening a chat used to land at the top once those rendered after the first scroll.
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastId = view.messages.at(-1)?.id;
  useEffect(() => {
    atBottom.current = true;
  }, [roomKey]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, roomKey]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const stick = () => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    };
    const onScroll = () => {
      atBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 48;
    };
    const resized = new ResizeObserver(stick);
    resized.observe(el);
    const changed = new MutationObserver(stick);
    changed.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    // An image or preview finishing its load grows the thread without a DOM change.
    el.addEventListener("load", stick, true);
    return () => {
      resized.disconnect();
      changed.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("load", stick, true);
    };
  }, [roomKey]);

  // Arrived from search (?m=<id>): bring that message to the middle, briefly lit.
  const focusId = new URLSearchParams(useSearch()).get("m");
  const focused = useRef<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId || focused.current === focusId || !byId.has(focusId)) return;
    const el = scroller.current?.querySelector(`[data-message-id="${CSS.escape(focusId)}"]`);
    if (!el) return;
    focused.current = focusId;
    atBottom.current = false;
    el.scrollIntoView({ block: "center" });
    setFlash(focusId);
  }, [focusId, byId]);
  // A reply's quote jumps to the message it answers, lit like a search arrival. One
  // older than what's loaded is paged in first: Keep looking stops at the first message
  // for this chat, so it's asked again until the target appears or every relay is done.
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<ReadonlySet<string>>(() => new Set());
  const { phase: historyPhase, keepLooking } = history;
  useEffect(() => {
    if (!jumpTo) return;
    if (byId.has(jumpTo)) {
      const el = scroller.current?.querySelector(`[data-message-id="${CSS.escape(jumpTo)}"]`);
      if (!el) return;
      atBottom.current = false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(jumpTo);
      setJumpTo(null);
    } else if (historyPhase === "end") {
      setNotFound((prev) => new Set(prev).add(jumpTo));
      setJumpTo(null);
    } else if (historyPhase !== "search" && historyPhase !== "auto") {
      keepLooking();
    }
  }, [jumpTo, byId, historyPhase, keepLooking]);
  const onJumpTo = useCallback((id: string) => setJumpTo(id), []);
  // Its own effect: messages arriving meanwhile re-run the one above, and must not cancel this.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  const isRequest = shelf !== "chat" && !view.hasMine;
  const [focusComposer, setFocusComposer] = useState(false);
  const pinned = prefs.pinned.includes(roomKey);
  const muted = prefs.muted.includes(roomKey);
  const hiddenAt = prefs.hidden[roomKey];
  const archived = hiddenAt !== undefined && view.lastAt <= hiddenAt;
  const inboxMissing = state.status === "no-inbox";

  const [renaming, setRenaming] = useState(false);
  const rename = async (subject: string) => {
    if (!engine) return false;
    const result = await engine.send(roomKey, renameText(subject), { subject, timer });
    if (!result.ok && !result.message) {
      sendError(result);
      return false;
    }
    return true;
  };

  const send = async (text: string) => {
    if (!engine) return false;
    const subject = !view.messages.length ? initialSubject : undefined;
    const result = await engine.send(roomKey, text, { replyTo: replyTo?.id, timer, subject });
    if (!result.ok && !result.message) {
      sendError(result);
      return false;
    }
    setReplyTo(null);
    return true;
  };
  const attach = async (file: File) => {
    if (!engine) return false;
    const result = await sendFile(engine, roomKey, file, { replyTo: replyTo?.id, timer });
    if (!result.ok && !result.message) {
      sendError(result);
      return false;
    }
    setReplyTo(null);
    return true;
  };

  const subtitle = group
    ? `${others.map((pk) => firstName(pk, profiles)).join(", ")} and you`
    : others.length
      ? profiles.get(others[0])?.nip05 || shortNpub(others[0])
      : "Only you can read these";

  return (
    <section aria-label={title} className="flex min-h-0 flex-col bg-background" data-testid="dm-chat">
      <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <RoomAvatar room={view} me={me} profiles={profiles} scoreOf={scoreOf} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-base font-bold">{title}</span>
          <span className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Disappearing messages"
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800",
                timer ? "text-brand-deep" : "text-slate-500",
              )}
              data-testid="dm-timer"
            >
              <Timer className="h-[19px] w-[19px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Disappearing messages</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(timer)} onValueChange={(v) => setRoomTimer(me, roomKey, Number(v))}>
                {TIMER_CHOICES.map((c) => (
                  <DropdownMenuRadioItem key={c.seconds} value={String(c.seconds)}>
                    {c.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-xs leading-relaxed text-slate-500">
                New messages ask relays to delete them after this time. The people you write to can still keep a copy.
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={onToggleInfo}
            aria-label="Conversation details"
            className="hidden h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 sm:inline-flex"
          >
            <Info className="h-[19px] w-[19px]" />
          </button>
          {!isRequest && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                data-testid="dm-chat-more"
              >
                <MoreVertical className="h-[19px] w-[19px]" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => setRenaming(true)} data-testid="dm-rename">
                  <Pencil className="mr-2 h-4 w-4" /> Rename chat
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRoomPinned(me, roomKey, !pinned)} data-testid="dm-pin">
                  {pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                  {pinned ? "Unpin" : "Pin to top"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRoomMuted(me, roomKey, !muted)} data-testid="dm-mute">
                  {muted ? <Bell className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
                  {muted ? "Unmute" : "Mute notifications"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => (archived ? unarchiveRoom(me, roomKey) : onArchive())}
                  data-testid="dm-archive"
                >
                  {archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                  {archived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
                {!group && others[0] && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/p/${npubFromPubkey(others[0])}`}>
                        <UserRound className="mr-2 h-4 w-4" /> View profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onBlock} className="text-red-600 focus:text-red-600 dark:text-red-400">
                      <Ban className="mr-2 h-4 w-4" /> Block
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </header>

      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-5 sm:px-7"
        data-testid="dm-thread"
      >
        <HistoryCard
          phase={history.phase}
          state={state}
          first={first}
          onKeepLooking={history.keepLooking}
          onStop={history.stop}
          onResume={history.resume}
          onRetry={(url) => engine?.retry(url)}
        />
        {!view.messages.length && history.phase === "idle" && (
          <p className="mx-auto max-w-sm py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {state.liveSettled ? `Say hi to ${first}.` : "Loading this conversation…"}
          </p>
        )}
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.kind === "subject" ? (
              <p
                className="mx-auto max-w-md text-center text-xs text-slate-500 dark:text-slate-400"
                data-testid="dm-subject-change"
              >
                <span className="font-semibold">{item.author === me ? "You" : firstName(item.author, profiles)}</span>{" "}
                named the chat{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">“{item.subject}”</span>
              </p>
            ) : item.kind === "day" ? (
              <p className="mx-auto mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                {item.label}
              </p>
            ) : item.kind === "marker" ? (
              <RelayMarker
                progress={item.progress}
                variant="chat"
                onVisible={onVisible}
                onRetry={(url) => engine?.retry(url)}
              />
            ) : (
              <MessageBubble
                message={item.message}
                me={me}
                group={group}
                profiles={profiles}
                replyTo={item.message.replyTo ? (byId.get(item.message.replyTo) ?? null) : undefined}
                reactions={view.reactions.get(item.message.id) ?? NO_REACTIONS}
                showAuthor={item.showAuthor}
                onReply={setReplyTo}
                onJumpTo={onJumpTo}
                replyLookup={
                  !item.message.replyTo
                    ? undefined
                    : jumpTo === item.message.replyTo
                      ? "finding"
                      : notFound.has(item.message.replyTo)
                        ? "missing"
                        : undefined
                }
                onReact={onReact}
                onDetails={onDetails}
                onResend={onResend}
                onDiscard={onDiscard}
                highlight={flash === item.message.id}
                linkPreviews={prefs.linkPreviews && !isRequest}
                autoOpenFiles={!isRequest}
              />
            )}
          </Fragment>
        ))}
      </div>

      {isRequest ? (
        <div className="shrink-0 border-t border-border bg-card px-4 pb-5 pt-4 sm:px-6" data-testid="dm-request-bar">
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-slate-100">
              {group ? "You've been added to a group chat." : `${nameOf(others[0], profiles)} wants to message you.`}
            </strong>{" "}
            They can't tell whether you've opened this — NIP-17 sends no read receipts. Deleting it doesn't notify them.
          </p>
          {!group && (
            <div className="mt-3">
              <RequestTrustPanel pubkey={others[0]} name={nameOf(others[0], profiles)} score={scoreOf(others[0])} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!group && (
              <Button
                variant="outline"
                onClick={onBlock}
                className="text-red-600 dark:text-red-400"
                data-testid="dm-block"
              >
                <Ban className="mr-1.5 h-4 w-4" /> Block
              </Button>
            )}
            <Button variant="outline" onClick={onDelete} data-testid="dm-delete">
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
            <Button
              onClick={() =>
                // Synchronous, so the composer mounts and takes focus inside this tap.
                flushSync(() => {
                  setFocusComposer(true);
                  onAccept();
                })
              }
              className="ml-auto"
              data-testid="dm-accept"
            >
              <Check className="mr-1.5 h-4 w-4" /> Accept and reply
            </Button>
          </div>
        </div>
      ) : (
        <Composer
          placeholder={`Message ${first}`}
          me={me}
          profiles={profiles}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          timer={timer}
          disabled={
            inboxMissing
              ? "Set up your inbox relays to send messages"
              : state.paused === "no-nip44"
                ? "Your signer can't encrypt private messages"
                : undefined
          }
          onSend={send}
          onSendFile={attach}
          autoFocus={focusComposer}
        />
      )}
      <RenameChatDialog
        open={renaming}
        current={view.subject ?? initialSubject}
        onOpenChange={setRenaming}
        onRename={rename}
      />
    </section>
  );
}
