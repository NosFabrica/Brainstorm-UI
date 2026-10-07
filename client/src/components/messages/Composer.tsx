import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Mic, Paperclip, Send, Timer, Trash2, X } from "lucide-react";
import { canRecordVoice, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import type { DmMessage } from "@/lib/dm/store";
import { FILE_KIND } from "@/lib/dm/giftWrap";
import { TIMER_CHOICES } from "@/lib/dm/prefs";
import { MAX_ATTACHMENT_BYTES } from "@/lib/dm/fileCrypto";
import { formatBytes } from "@/lib/formatBytes";
import { useEditingText } from "@/hooks/useEditingText";
import { cn } from "@/lib/utils";
import { type Profiles, PersonName } from "./people";

export function Composer({
  placeholder,
  me,
  profiles,
  replyTo,
  onCancelReply,
  timer,
  disabled,
  onSend,
  onSendFile,
  autoFocus,
}: {
  placeholder: string;
  me: string;
  profiles: Profiles;
  replyTo: DmMessage | null;
  onCancelReply: () => void;
  /** Disappearing timer in seconds, 0 for off. */
  timer: number;
  disabled?: string;
  /** Resolves false when nothing was sent and no bubble shows it: the composer restores the draft. */
  onSend: (text: string) => Promise<boolean>;
  onSendFile: (file: File) => Promise<boolean>;
  /** Focus the field on mount — after Accept and reply. */
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // A layout effect, so a mount inside the tap's flushSync focuses within that tap:
  // iOS Safari only raises the keyboard for a focus made during the gesture.
  useLayoutEffect(() => {
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);

  // The field empties at once: the message's own bubble shows it sending, sent or
  // failed. Only a send that never made a bubble (no signer, no inbox relays, the
  // signer said no) hands the draft back — in front of anything typed since.
  const send = () => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    setText("");
    area.current?.focus();
    void onSend(value)
      .catch(() => false)
      .then((sent) => {
        if (!sent) setText((cur) => (cur.trim() ? `${value}\n${cur}` : value));
      });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
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

  const finishVoice = async () => {
    const file = await voice.stop();
    if (!file) return;
    setBusy(true);
    await onSendFile(file);
    setBusy(false);
  };
  const voice = useVoiceRecorder({ onLimit: () => void finishVoice() });
  const recording = voice.state !== "idle";
  const showMic = !text.trim() && !disabled && canRecordVoice();
  const clock = `${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")}`;

  // Pressing Send (or attach, or the mic) must not take focus from the field.
  // The page grows into the tab bar's space while a field has focus
  // (MessagesPage); a press that moved focus here would shrink it back between
  // pointer-down and -up, the button would move out from under the finger, and
  // the tap would be lost. Keeping focus also keeps the phone keyboard up.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const editing = useEditingText();

  const timerLabel = TIMER_CHOICES.find((c) => c.seconds === timer)?.label;
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-card px-4 pb-3 pt-3 sm:px-6 sm:pb-4",
        // While typing the tab bar steps aside and the composer reaches the bottom edge:
        // keep the box above the phone's home indicator — unless the keyboard is over it
        // (MessagesPage sets --bs-bottom-inset to 0 then).
        editing && "pb-[calc(0.75rem+var(--bs-bottom-inset,env(safe-area-inset-bottom,0px)))]",
      )}
    >
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[13px] dark:bg-slate-800">
          <span className="min-w-0 flex-1 truncate">
            Replying to{" "}
            <strong>
              {replyTo.author === me ? "yourself" : <PersonName pubkey={replyTo.author} profiles={profiles} first />}
            </strong>{" "}
            · {replyTo.kind === FILE_KIND ? "A file" : replyTo.rumor.content}
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
      {recording ? (
        <div
          className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-1 pl-2"
          data-testid="dm-recording"
        >
          <button
            type="button"
            onClick={voice.cancel}
            aria-label="Discard the recording"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <Trash2 className="h-[19px] w-[19px]" />
          </button>
          <span className="flex flex-1 items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            {voice.state === "starting" ? "Starting…" : `Recording ${clock}`}
          </span>
          <button
            type="button"
            onClick={() => void finishVoice()}
            disabled={voice.state !== "recording"}
            aria-label="Send the voice message"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
            data-testid="dm-voice-send"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-slate-50 p-1 pl-1.5 focus-within:border-brand-primary/50 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={busy || !!disabled}
            aria-label="Attach an encrypted file"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 disabled:opacity-50 dark:hover:bg-slate-800"
            data-testid="dm-attach"
            onMouseDown={keepFocus}
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
            className={cn(
              "max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-[11px] text-[15px] leading-snug outline-none [field-sizing:content] placeholder:text-slate-400",
              // A long group name ends in "…" on one line rather than wrapping and being
              // cropped; a reason the field is off is read in full.
              !disabled && "placeholder:truncate",
            )}
            data-testid="dm-composer"
          />
          {showMic && !busy ? (
            <button
              type="button"
              onClick={() => void voice.start()}
              aria-label="Record a voice message"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              data-testid="dm-voice"
              onMouseDown={keepFocus}
            >
              <Mic className="h-[19px] w-[19px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!text.trim() || busy || !!disabled}
              aria-label="Send"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
              data-testid="dm-send"
              onMouseDown={keepFocus}
            >
              {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
            </button>
          )}
        </div>
      )}
      {(fileError ?? voice.error) && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fileError ?? voice.error}</p>
      )}
      {timer > 0 && (
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          <Timer className="h-3 w-3" /> Disappears after {timerLabel ?? "a while"}
        </p>
      )}
    </div>
  );
}
