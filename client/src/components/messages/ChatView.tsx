import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ban, Check, History, Info, Loader2, ShieldCheck, Timer, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DmEngine, DmEngineState, SendResult } from "@/services/dm/engine";
import { sendFile } from "@/services/dm";
import type { DmMessage, DmRoom } from "@/lib/dm/store";
import type { RoomShelf } from "@/lib/dm/inbox";
import { TIMER_CHOICES, roomTimer, setRoomTimer, markRoomRead, type DmPrefs } from "@/lib/dm/prefs";
import { RelayMarker } from "./RelayMarker";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { useChatHistory, type ChatHistoryPhase } from "./useChatHistory";
import { RoomAvatar, dayLabel, firstName, nameOf, roomTitle, shortDate, shortNpub, type Profiles } from "./people";
import type { RelayProgress } from "@/lib/dm/pager";

type Item =
  | { kind: "day"; key: string; label: string }
  | { kind: "marker"; key: string; progress: RelayProgress }
  | { kind: "message"; key: string; message: DmMessage; showAuthor: boolean };

/** Oldest first, a divider per day, each relay's marker where its history is complete. */
function threadItems(messages: DmMessage[], relays: RelayProgress[]): Item[] {
  const markers = relays
    .map((progress) => ({ progress, at: progress.state === "done" ? Number.NEGATIVE_INFINITY : progress.completeTo }))
    .sort((a, b) => a.at - b.at);
  const items: Item[] = [];
  let m = 0;
  let lastDay = "";
  let lastAuthor = "";
  for (const message of messages) {
    while (m < markers.length && markers[m].at <= message.createdAt) {
      items.push({ kind: "marker", key: `m:${markers[m].progress.url}`, progress: markers[m].progress });
      m++;
      lastAuthor = "";
    }
    const day = new Date(message.createdAt * 1000).toDateString();
    if (day !== lastDay) {
      items.push({ kind: "day", key: `d:${day}`, label: dayLabel(message.createdAt) });
      lastDay = day;
      lastAuthor = "";
    }
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
  onRetry,
}: {
  phase: ChatHistoryPhase;
  state: DmEngineState;
  first: string;
  onKeepLooking: () => void;
  onStop: () => void;
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
  onSignIn,
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
  onSignIn: () => void;
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
  const markersVisible = Object.values(visible).some(Boolean);
  const count = view.messages.length;
  const history = useChatHistory(engine, state, roomKey, count, markersVisible);

  const items = useMemo(() => threadItems(view.messages, state.history.relays), [view.messages, state.history.relays]);
  const byId = useMemo(() => new Map(view.messages.map((m) => [m.id, m])), [view.messages]);

  // Reading the chat marks it read.
  useEffect(() => {
    if (room?.lastAt) markRoomRead(me, roomKey, room.lastAt);
  }, [me, roomKey, room?.lastAt]);

  // Keep the newest message in view as messages arrive at the bottom.
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = view.messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, roomKey]);

  const isRequest = shelf !== "chat" && !view.hasMine;
  const inboxMissing = state.status === "no-inbox";

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
          onRetry={(url) => engine?.retry(url)}
        />
        {!view.messages.length && history.phase === "idle" && (
          <p className="mx-auto max-w-sm py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {state.liveSynced ? `Say hi to ${first}.` : "Loading this conversation…"}
          </p>
        )}
        <p className="mx-auto flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-300">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          End-to-end encrypted. Relays see neither who sent a message nor when.
        </p>
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.kind === "day" ? (
              <p className="mx-auto mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                {item.label}
              </p>
            ) : item.kind === "marker" ? (
              <RelayMarker
                progress={item.progress}
                variant="chat"
                onVisible={onVisible}
                onRetry={(url) => engine?.retry(url)}
                onSignIn={onSignIn}
              />
            ) : (
              <MessageBubble
                message={item.message}
                me={me}
                group={group}
                profiles={profiles}
                replyTo={item.message.replyTo ? (byId.get(item.message.replyTo) ?? null) : undefined}
                reactions={view.reactions.get(item.message.id) ?? []}
                showAuthor={item.showAuthor}
                onReply={setReplyTo}
                onReact={(m, content) => void engine?.react(m, content).then((r) => !r.ok && sendError(r))}
                onDetails={onDetails}
                onResend={(m) => void engine?.resend(m.id)}
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
            <Button onClick={onAccept} className="ml-auto" data-testid="dm-accept">
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
          recipients={Math.max(1, others.length)}
          disabled={
            inboxMissing
              ? "Set up your inbox relays to send messages"
              : state.paused === "no-nip44"
                ? "Your signer can't encrypt private messages"
                : undefined
          }
          onSend={send}
          onSendFile={attach}
        />
      )}
    </section>
  );
}
