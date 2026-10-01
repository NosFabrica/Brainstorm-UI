import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Lock, AlertTriangle, Mic } from "lucide-react";
import type { FileMeta } from "@/lib/dm/rooms";
import { decryptFile, matchesHash } from "@/lib/dm/fileCrypto";
import { formatBytes } from "@/lib/formatBytes";

/** The largest attachment we fetch and open without being asked. */
const AUTO_OPEN_BYTES = 8 * 1024 * 1024;

type Opened = { url: string; mime: string } | { error: string } | null;

/**
 * A kind-15 attachment: downloaded, checked against its hash, and decrypted
 * here. Images open on their own when small; anything else waits for a tap.
 */
export function FileMessage({ meta, mine }: { meta: FileMeta; mine: boolean }) {
  const isImage = meta.mime?.startsWith("image/") ?? false;
  const isAudio = meta.mime?.startsWith("audio/") ?? false;
  const encrypted = meta.algorithm?.toLowerCase() === "aes-gcm" && !!meta.key && !!meta.nonce;
  const [opened, setOpened] = useState<Opened>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const response = await fetch(meta.url);
      if (!response.ok) throw new Error(`The file host answered ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!(await matchesHash(bytes, meta.hash))) throw new Error("The file doesn't match what was sent");
      const plain = encrypted ? await decryptFile(bytes, meta.key!, meta.nonce!) : bytes;
      const mime = meta.mime || "application/octet-stream";
      setOpened({ url: URL.createObjectURL(new Blob([plain], { type: mime })), mime });
    } catch (error) {
      setOpened({ error: error instanceof Error ? error.message : "Couldn't open the file" });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if ((isImage || isAudio) && (meta.size ?? 0) <= AUTO_OPEN_BYTES) void open();
    // Opened once per message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.url]);

  useEffect(
    () => () => {
      if (opened && "url" in opened) URL.revokeObjectURL(opened.url);
    },
    [opened],
  );

  if (opened && "url" in opened && opened.mime.startsWith("image/")) {
    return (
      <a href={opened.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl">
        <img src={opened.url} alt="Attachment" className="max-h-80 max-w-full object-contain" />
      </a>
    );
  }

  if (isAudio && !(opened && "error" in opened)) {
    return (
      <div
        className={`flex w-72 max-w-full flex-col gap-1.5 rounded-2xl p-2 ${mine ? "bg-white/10" : ""}`}
        data-testid="dm-voice-message"
      >
        <span
          className={`flex items-center gap-1.5 px-1 text-xs ${mine ? "text-white/85" : "text-slate-500 dark:text-slate-400"}`}
        >
          <Mic className="h-3.5 w-3.5" /> Voice message
          {encrypted && <Lock className="ml-auto h-3 w-3" aria-label="Encrypted" />}
        </span>
        {opened && "url" in opened ? (
          <audio controls preload="metadata" src={opened.url} className="h-10 w-full" />
        ) : (
          <button
            type="button"
            onClick={() => void open()}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? "Opening…" : "Load"}
          </button>
        )}
      </div>
    );
  }

  const name = meta.url.split("/").pop()?.split("?")[0] || "Attachment";
  return (
    <div
      className={`flex w-72 max-w-full items-center gap-3 rounded-2xl border p-3 ${
        mine ? "border-white/25 bg-white/10" : "border-border bg-card"
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <FileText className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{name}</span>
        <span
          className={`flex items-center gap-1 text-xs ${mine ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}
        >
          {encrypted && <Lock className="h-3 w-3" />}
          {meta.size ? formatBytes(meta.size) : "File"}
          {encrypted ? " · encrypted" : ""}
        </span>
        {opened && "error" in opened && (
          <span className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" /> {opened.error}
          </span>
        )}
      </span>
      {opened && "url" in opened ? (
        <a
          href={opened.url}
          download={name}
          aria-label="Save the file"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border"
        >
          <Download className="h-4 w-4" />
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          aria-label="Open the file"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
