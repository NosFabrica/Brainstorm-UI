import { useRef, useState, type KeyboardEvent } from "react";
import { Gift, Loader2, Paperclip, Send, Timer, X } from "lucide-react";
import type { DmMessage } from "@/lib/dm/store";
import { TIMER_CHOICES } from "@/lib/dm/prefs";
import { MAX_ATTACHMENT_BYTES } from "@/lib/dm/fileCrypto";
import { formatBytes } from "@/lib/formatBytes";
import { firstName, type Profiles } from "./people";

export function Composer({
  placeholder,
  me,
  profiles,
  replyTo,
  onCancelReply,
  timer,
  recipients,
  disabled,
  onSend,
  onSendFile,
}: {
  placeholder: string;
  me: string;
  profiles: Profiles;
  replyTo: DmMessage | null;
  onCancelReply: () => void;
  /** Disappearing timer in seconds, 0 for off. */
  timer: number;
  recipients: number;
  disabled?: string;
  onSend: (text: string) => Promise<boolean>;
  onSendFile: (file: File) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const send = async () => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    setBusy(true);
    const sent = await onSend(value);
    setBusy(false);
    if (sent) {
      setText("");
      area.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setFileError(`Files can be up to ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
      return;
    }
    setFileError(null);
    setBusy(true);
    await onSendFile(file);
    setBusy(false);
  };

  const timerLabel = TIMER_CHOICES.find((c) => c.seconds === timer)?.label;
  const others = recipients === 1 ? "them" : `${recipients} people`;
  return (
    <div className="shrink-0 border-t border-border bg-card px-4 pb-4 pt-3 sm:px-6">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[13px] dark:bg-slate-800">
          <span className="min-w-0 flex-1 truncate">
            Replying to <strong>{replyTo.author === me ? "yourself" : firstName(replyTo.author, profiles)}</strong> ·{" "}
            {replyTo.rumor.content}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-slate-50 p-1 pl-1.5 focus-within:border-brand-primary/50 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={busy || !!disabled}
          aria-label="Attach an encrypted file"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 disabled:opacity-50 dark:hover:bg-slate-800"
          data-testid="dm-attach"
        >
          <Paperclip className="h-[19px] w-[19px]" />
        </button>
        <input
          ref={picker}
          type="file"
          className="hidden"
          onChange={(e) => {
            void attach(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={disabled ?? placeholder}
          disabled={!!disabled}
          aria-label="Message"
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-1 py-[11px] text-[15px] leading-snug outline-none [field-sizing:content] placeholder:text-slate-400"
          data-testid="dm-composer"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || busy || !!disabled}
          aria-label="Send"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
          data-testid="dm-send"
        >
          {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {fileError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fileError}</p>}
      <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
        {timer > 0 ? <Timer className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
        {timer > 0
          ? `Disappears after ${timerLabel ?? "a while"} · gift-wrapped for ${others} and a copy for you`
          : `Gift-wrapped for ${others} and a copy for you`}
      </p>
    </div>
  );
}
