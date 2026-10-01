/**
 * Recording a voice note with the browser's MediaRecorder. The result is a
 * plain audio File, sent like any attachment: encrypted here, uploaded as
 * ciphertext, the key only inside the wrapped message (services/dm sendFile).
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Longest note: past this the recording stops on its own. */
export const MAX_VOICE_SECONDS = 5 * 60;

const PREFERRED = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

export function voiceMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED.find((t) => MediaRecorder.isTypeSupported?.(t));
}

export function canRecordVoice(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!voiceMimeType();
}

const EXTENSION: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg" };

export type VoiceState = "idle" | "starting" | "recording";

/** `onLimit`: the note reached MAX_VOICE_SECONDS — finish it (usually: stop and send). */
export function useVoiceRecorder({ onLimit }: { onLimit?: () => void } = {}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const finish = useRef<((file: File | null) => void) | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const limit = useRef(onLimit);
  limit.current = onLimit;

  const release = useCallback(() => {
    if (ticker.current !== undefined) clearInterval(ticker.current);
    ticker.current = undefined;
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    setState("idle");
    setSeconds(0);
  }, []);

  const start = useCallback(async () => {
    const mime = voiceMimeType();
    if (!mime) return setError("This browser can't record audio.");
    setError(null);
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("idle");
      return setError("Microphone access was blocked.");
    }
    const rec = new MediaRecorder(stream, { mimeType: mime });
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const base = mime.split(";")[0];
      const blob = new Blob(chunks.current, { type: base });
      const file = blob.size
        ? new File([blob], `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.${EXTENSION[base] ?? "audio"}`, {
            type: base,
          })
        : null;
      finish.current?.(file);
      finish.current = null;
    };
    recorder.current = rec;
    rec.start(250);
    setState("recording");
    const began = Date.now();
    ticker.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= MAX_VOICE_SECONDS && ticker.current !== undefined) {
        clearInterval(ticker.current);
        ticker.current = undefined;
        limit.current?.();
      }
    }, 250);
  }, []);

  /** Stop and hand back the recording (null when there was nothing). */
  const stop = useCallback(
    () =>
      new Promise<File | null>((resolve) => {
        const rec = recorder.current;
        if (!rec || rec.state === "inactive") return resolve(null);
        finish.current = (file) => {
          release();
          resolve(file);
        };
        rec.stop();
      }),
    [release],
  );

  const cancel = useCallback(() => {
    finish.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    release();
  }, [release]);

  useEffect(() => cancel, [cancel]);

  return { state, seconds, error, start, stop, cancel };
}
