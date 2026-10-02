import { memo, useState } from "react";
import { AlertTriangle, Check, CheckCheck, Info, Loader2, Reply, SmilePlus, Timer, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Delivery, DmMessage } from "@/lib/dm/store";
import { useRelayAuthProblems } from "@/hooks/useRelayAuthProblems";
import { askRelayAuthAgain, relayAuthProblemFor } from "@/services/relayAuth";
import { FILE_KIND } from "@/lib/dm/giftWrap";
import { fileMetaOf, reactionLabel } from "@/lib/dm/rooms";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileMessage } from "./FileMessage";
import { DmLinkPreview, firstPreviewableLink } from "./DmLinkPreview";
import { PersonAvatar, clockTime, firstName, type Profiles } from "./people";

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Plain text with bare links made clickable, in the bubble's own colour. */
function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-2"
          >
            {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export const QUICK_REACTIONS = ["+", "😂", "🙏", "🔥", "😮"];

/**
 * A message no relay took. One held by a relay that wants the sender signed in says
 * whose "no" it was, and its Retry asks for that login again before sending — while a
 * declined login stands, sending alone would be turned away the same way.
 */
function NotDelivered({
  deliveries,
  onResend,
  discard,
}: {
  deliveries: Delivery[];
  onResend: () => void;
  discard: React.ReactNode;
}) {
  const problems = useRelayAuthProblems();
  const held = [...new Set(deliveries.filter((d) => d.auth && !d.ok).map((d) => d.relay))];
  const declined = held.some((relay) => relayAuthProblemFor(problems, relay)?.by === "signer");
  return (
    <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" />
      {declined
        ? "Not delivered · you declined to sign in to their relay"
        : held.length
          ? "Not delivered · their relay wants you signed in"
          : "Not delivered"}
      <button
        type="button"
        onClick={() => {
          for (const relay of held) askRelayAuthAgain(relay);
          onResend();
        }}
        className="font-semibold underline underline-offset-2"
        data-testid="dm-resend"
      >
        {declined ? "Ask again" : "Retry"}
      </button>
      · {discard}
    </span>
  );
}

function Status({
  message,
  onDetails,
  onResend,
  onDiscard,
}: {
  message: DmMessage;
  onDetails: () => void;
  onResend: () => void;
  onDiscard: () => void;
}) {
  const out = message.outgoing;
  if (!out) return null;
  const discard = (
    <button type="button" onClick={onDiscard} className="font-semibold underline underline-offset-2">
      Discard
    </button>
  );
  if (out.status === "queued")
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300" data-testid="dm-queued">
        <Clock className="h-3 w-3" /> Sends when you're back online · {discard}
      </span>
    );
  if (out.status === "sending")
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Sending
      </span>
    );
  if (out.status === "failed")
    return <NotDelivered deliveries={out.deliveries} onResend={onResend} discard={discard} />;
  const recipients = new Set(out.deliveries.map((d) => d.recipient));
  const ok = out.deliveries.filter((d) => d.ok).length;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDetails}
        className={cn(
          "inline-flex items-center gap-1 hover:underline",
          out.status === "partial" ? "text-amber-600 dark:text-amber-300" : "text-teal-700 dark:text-teal-300",
        )}
        data-testid="dm-delivery"
      >
        {out.status === "partial" ? <Check className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />}
        {out.status === "partial" ? `Delivered to ${ok} of ${out.deliveries.length} relays` : "Delivered"}
      </button>
      {out.status === "partial" && recipients.size > 0 && (
        <button type="button" onClick={onResend} className="font-semibold underline underline-offset-2">
          Retry
        </button>
      )}
    </span>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  me,
  group,
  profiles,
  replyTo,
  reactions,
  showAuthor,
  onReply,
  onJumpTo,
  replyLookup,
  onReact,
  onDetails,
  onResend,
  onDiscard,
  highlight = false,
  linkPreviews = false,
  autoOpenFiles = true,
}: {
  message: DmMessage;
  me: string;
  group: boolean;
  profiles: Profiles;
  /** The message this one answers, when it is loaded. */
  replyTo?: DmMessage | null;
  reactions: DmMessage[];
  showAuthor: boolean;
  onReply: (m: DmMessage) => void;
  /** Bring the message with this id into view — what a reply's quote does. */
  onJumpTo?: (id: string) => void;
  /** While the quoted message is being paged in, or once no relay had it. */
  replyLookup?: "finding" | "missing";
  onReact: (m: DmMessage, content: string) => void;
  onDetails: (m: DmMessage) => void;
  onResend: (m: DmMessage) => void;
  onDiscard: (m: DmMessage) => void;
  /** Just jumped to from search. */
  highlight?: boolean;
  /** Show a preview card for the first link (Settings › Messages). */
  linkPreviews?: boolean;
  /** Small images and voice notes load on their own — not in requests. */
  autoOpenFiles?: boolean;
}) {
  const mine = message.author === me;
  const file = message.kind === FILE_KIND ? fileMetaOf(message.rumor) : undefined;
  const previewUrl = !file && linkPreviews ? firstPreviewableLink(message.rumor.content) : null;
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const label = reactionLabel(r.rumor.content);
    const g = grouped.get(label) ?? { count: 0, mine: false };
    grouped.set(label, { count: g.count + 1, mine: g.mine || r.author === me });
  }

  const [actionsShown, setActionsShown] = useState(false);
  // The reaction menu renders in a portal and takes focus, so focus-within no longer
  // holds the row visible: track it, or the row fades and leaves the menu under nothing.
  const [reactOpen, setReactOpen] = useState(false);
  const actions = (
    <span
      className={cn(
        // Revealed on hover only where there is hover: iOS Safari treats a tap that would
        // reveal content through :hover as hover alone and drops the click, so every link,
        // preview and reply quote in a bubble took two taps. Touch reveals them by tapping
        // the bubble instead.
        "flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
        (actionsShown || reactOpen) && "opacity-100",
        mine ? "order-first" : "",
      )}
    >
      <button
        type="button"
        onClick={() => onReply(message)}
        aria-label="Reply"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Reply className="h-4 w-4" />
      </button>
      <DropdownMenu open={reactOpen} onOpenChange={setReactOpen}>
        <DropdownMenuTrigger
          aria-label="React"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <SmilePlus className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mine ? "end" : "start"} className="flex gap-1 p-1">
          {QUICK_REACTIONS.map((r) => (
            <DropdownMenuItem key={r} onSelect={() => onReact(message, r)} className="px-2 text-lg">
              {reactionLabel(r)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={() => onDetails(message)}
        aria-label="Message details"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Info className="h-4 w-4" />
      </button>
    </span>
  );

  return (
    <div
      className={cn(
        "group -mx-2 flex gap-2.5 rounded-2xl px-2 py-0.5 transition-colors duration-700",
        mine ? "justify-end" : "justify-start",
        highlight && "bg-amber-200/50 dark:bg-amber-400/15",
      )}
      onClick={(e) => {
        // A tap on the bubble itself (not a link, button or the actions) shows its actions on touch.
        if (!(e.target as HTMLElement).closest("a,button,[role=menu],input,textarea")) setActionsShown((v) => !v);
      }}
      data-testid="dm-message"
      data-message-id={message.id}
      data-mine={mine ? "true" : undefined}
    >
      {!mine && group && (
        <span className="w-8 shrink-0 self-end">
          {showAuthor && <PersonAvatar pubkey={message.author} profiles={profiles} size={32} />}
        </span>
      )}
      <div className={cn("flex max-w-[78%] flex-col gap-1", mine ? "items-end" : "items-start")}>
        {!mine && group && showAuthor && (
          <span className="px-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {firstName(message.author, profiles)}
          </span>
        )}
        <div className="flex items-center gap-1">
          {!mine ? null : actions}
          <div
            className={cn(
              "min-w-0 rounded-[18px] text-[15px] leading-[1.45]",
              file && !replyTo ? "p-1" : "px-3.5 py-2.5",
              mine
                ? "rounded-br-md bg-brand-primary text-white"
                : "rounded-bl-md border border-border bg-card text-slate-900 dark:text-slate-100",
            )}
          >
            {message.replyTo && (
              <button
                type="button"
                onClick={() => message.replyTo && onJumpTo?.(message.replyTo)}
                disabled={!onJumpTo || replyLookup === "missing"}
                aria-label={replyTo ? "Go to the message this replies to" : "Find the message this replies to"}
                className={cn(
                  "mb-1.5 block w-full rounded-xl border-l-[3px] px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors disabled:cursor-default",
                  mine
                    ? "border-white/70 bg-white/15 [@media(hover:hover)]:enabled:hover:bg-white/25"
                    : "border-brand-primary bg-slate-100 dark:bg-slate-800 [@media(hover:hover)]:enabled:hover:bg-slate-200 [@media(hover:hover)]:dark:enabled:hover:bg-slate-700",
                )}
                data-testid="dm-reply-quote"
              >
                {replyTo ? (
                  <>
                    <span className="block font-semibold">
                      {replyTo.author === me ? "You" : firstName(replyTo.author, profiles)}
                    </span>
                    <span className="line-clamp-2 opacity-90">
                      {replyTo.kind === FILE_KIND ? "A file" : replyTo.rumor.content}
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 opacity-80">
                    {replyLookup === "finding" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {replyLookup === "finding"
                      ? "Looking for the message this replies to…"
                      : replyLookup === "missing"
                        ? "The message this replies to isn't in your inbox"
                        : "Replying to an earlier message · Show it"}
                  </span>
                )}
              </button>
            )}
            {file ? (
              <FileMessage meta={file} mine={mine} autoOpen={autoOpenFiles} />
            ) : (
              <>
                <p className="whitespace-pre-wrap break-words">
                  <Linked text={message.rumor.content} />
                </p>
                {previewUrl && <DmLinkPreview url={previewUrl} mine={mine} />}
              </>
            )}
          </div>
          {mine ? null : actions}
        </div>
        {grouped.size > 0 && (
          <span className="flex flex-wrap gap-1 px-1">
            {[...grouped].map(([label, g]) => (
              <button
                key={label}
                type="button"
                onClick={() => onReact(message, label === "❤️" ? "+" : label)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-semibold",
                  g.mine
                    ? "border-brand-primary/30 bg-brand-primary/10 text-brand-deep dark:bg-brand-primary/20"
                    : "border-border bg-card text-slate-600 dark:text-slate-300",
                )}
              >
                {label} {g.count > 1 ? g.count : ""}
              </button>
            ))}
          </span>
        )}
        <span className="flex items-center gap-2 px-1.5 text-xs text-slate-500 dark:text-slate-400">
          {message.expiresAt && <Timer className="h-3 w-3" aria-label="Disappears" />}
          {clockTime(message.createdAt)}
          {mine && (
            <Status
              message={message}
              onDetails={() => onDetails(message)}
              onResend={() => onResend(message)}
              onDiscard={() => onDiscard(message)}
            />
          )}
        </span>
      </div>
    </div>
  );
});
