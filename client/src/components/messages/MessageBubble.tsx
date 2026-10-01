import { AlertTriangle, Check, CheckCheck, Info, Loader2, Reply, SmilePlus, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DmMessage } from "@/lib/dm/store";
import { FILE_KIND } from "@/lib/dm/giftWrap";
import { fileMetaOf, reactionLabel } from "@/lib/dm/rooms";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileMessage } from "./FileMessage";
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

function Status({ message, onDetails, onResend }: { message: DmMessage; onDetails: () => void; onResend: () => void }) {
  const out = message.outgoing;
  if (!out) return null;
  if (out.status === "sending")
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Sending
      </span>
    );
  if (out.status === "failed")
    return (
      <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" /> Not delivered
        <button type="button" onClick={onResend} className="font-semibold underline underline-offset-2">
          Retry
        </button>
      </span>
    );
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

export function MessageBubble({
  message,
  me,
  group,
  profiles,
  replyTo,
  reactions,
  showAuthor,
  onReply,
  onReact,
  onDetails,
  onResend,
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
  onReact: (m: DmMessage, content: string) => void;
  onDetails: (m: DmMessage) => void;
  onResend: (m: DmMessage) => void;
}) {
  const mine = message.author === me;
  const file = message.kind === FILE_KIND ? fileMetaOf(message.rumor) : undefined;
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const label = reactionLabel(r.rumor.content);
    const g = grouped.get(label) ?? { count: 0, mine: false };
    grouped.set(label, { count: g.count + 1, mine: g.mine || r.author === me });
  }

  const actions = (
    <span
      className={cn(
        "flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
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
      <DropdownMenu>
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
      className={cn("group flex gap-2.5", mine ? "justify-end" : "justify-start")}
      data-testid="dm-message"
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
              <div
                className={cn(
                  "mb-1.5 rounded-xl px-2.5 py-1.5 text-[13px] leading-snug",
                  mine ? "bg-white/15" : "bg-slate-100 dark:bg-slate-800",
                )}
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
                  <span className="opacity-80">Replying to an earlier message</span>
                )}
              </div>
            )}
            {file ? (
              <FileMessage meta={file} mine={mine} />
            ) : (
              <p className="whitespace-pre-wrap break-words">
                <Linked text={message.rumor.content} />
              </p>
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
          {mine && <Status message={message} onDetails={() => onDetails(message)} onResend={() => onResend(message)} />}
        </span>
      </div>
    </div>
  );
}
